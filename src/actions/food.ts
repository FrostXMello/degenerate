"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  requireFoodAccess,
  requireFoodPermission,
  requireSession,
} from "@/lib/auth";
import type { PaymentMethod } from "@prisma/client";

function revalidateFood() {
  revalidatePath("/food");
  revalidatePath("/food/menu");
  revalidatePath("/food/orders");
  revalidatePath("/food/staff");
}

export type FoodMenuRow = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
};

export async function listFoodMenuAction(includeInactive = false) {
  await requireFoodAccess();
  const items = await prisma.foodMenuItem.findMany({
    where: includeInactive ? undefined : { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return items.map((i) => ({
    id: i.id,
    name: i.name,
    price: i.price,
    active: i.active,
    sortOrder: i.sortOrder,
  }));
}

export async function addFoodItemAction(input: { name: string; price: number }) {
  try {
    const session = await requireFoodPermission("addItem");
    const name = input.name.trim();
    if (!name) return { ok: false as const, error: "Enter a dish name." };
    if (!Number.isInteger(input.price) || input.price < 0) {
      return { ok: false as const, error: "Price must be a whole rupee amount." };
    }
    const last = await prisma.foodMenuItem.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const item = await prisma.foodMenuItem.create({
      data: {
        name,
        price: input.price,
        sortOrder: (last?.sortOrder ?? 0) + 1,
        createdById: session.id,
      },
    });
    revalidateFood();
    return {
      ok: true as const,
      item: {
        id: item.id,
        name: item.name,
        price: item.price,
        active: item.active,
        sortOrder: item.sortOrder,
      },
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not add item." };
  }
}

export async function updateFoodItemAction(input: {
  id: string;
  name?: string;
  price?: number;
  active?: boolean;
}) {
  try {
    const existing = await prisma.foodMenuItem.findUnique({ where: { id: input.id } });
    if (!existing) return { ok: false as const, error: "Item not found." };

    if (typeof input.price === "number" && input.price !== existing.price) {
      await requireFoodPermission("changePrice");
      if (!Number.isInteger(input.price) || input.price < 0) {
        return { ok: false as const, error: "Price must be a whole rupee amount." };
      }
    }
    if (typeof input.active === "boolean" && input.active === false && existing.active) {
      await requireFoodPermission("removeItem");
    }
    if (typeof input.name === "string" && input.name.trim() !== existing.name) {
      await requireFoodPermission("addItem");
    }

    // Ensure at least food access if only toggling active on
    await requireFoodAccess();

    const updated = await prisma.foodMenuItem.update({
      where: { id: input.id },
      data: {
        name: input.name?.trim() || undefined,
        price: typeof input.price === "number" ? input.price : undefined,
        active: typeof input.active === "boolean" ? input.active : undefined,
      },
    });
    revalidateFood();
    return {
      ok: true as const,
      item: {
        id: updated.id,
        name: updated.name,
        price: updated.price,
        active: updated.active,
        sortOrder: updated.sortOrder,
      },
    };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Update failed." };
  }
}

export async function removeFoodItemAction(id: string) {
  try {
    await requireFoodPermission("removeItem");
    // Soft-remove so past order history still has the name snapshot; keep row inactive
    await prisma.foodMenuItem.update({
      where: { id },
      data: { active: false },
    });
    revalidateFood();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Remove failed." };
  }
}

export async function createFoodOrderAction(input: {
  items: { menuItemId: string; quantity: number }[];
  paymentMethod?: PaymentMethod;
  note?: string;
  idempotencyKey: string;
}) {
  try {
    const session = await requireFoodAccess();
    const paymentMethod: PaymentMethod =
      input.paymentMethod === "COUPON" ? "COUPON" : "CASH_UPI";

    if (!input.idempotencyKey) {
      return { ok: false as const, error: "ORDER NOT SAVED. Missing request key." };
    }

    const linesIn = input.items.filter((i) => Number.isInteger(i.quantity) && i.quantity > 0);
    if (linesIn.length === 0) {
      return { ok: false as const, error: "ORDER NOT SAVED. Add at least one item." };
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.foodOrder.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { orderNumber: true, total: true },
      });
      if (existing) {
        return { orderNumber: existing.orderNumber, total: existing.total, duplicate: true };
      }

      const menu = await tx.foodMenuItem.findMany({
        where: { id: { in: linesIn.map((i) => i.menuItemId) }, active: true },
      });
      const byId = new Map(menu.map((m) => [m.id, m]));
      const lines = [];
      for (const row of linesIn) {
        const item = byId.get(row.menuItemId);
        if (!item) throw new Error("A menu item is unavailable.");
        lines.push({
          menuItemId: item.id,
          nameSnapshot: item.name,
          quantity: row.quantity,
          unitPrice: item.price,
          lineTotal: row.quantity * item.price,
        });
      }
      const total = lines.reduce((s, l) => s + l.lineTotal, 0);
      const last = await tx.foodOrder.findFirst({
        orderBy: { orderNumber: "desc" },
        select: { orderNumber: true },
      });
      const orderNumber = (last?.orderNumber ?? 0) + 1;

      await tx.foodOrder.create({
        data: {
          orderNumber,
          total,
          paymentMethod,
          note: input.note?.trim() || null,
          idempotencyKey: input.idempotencyKey,
          createdById: session.id,
          items: { create: lines },
        },
      });

      return { orderNumber, total, duplicate: false };
    });

    revalidateFood();
    return {
      ok: true as const,
      orderNumber: result.orderNumber,
      total: result.total,
    };
  } catch (error) {
    return {
      ok: false as const,
      error: `ORDER NOT SAVED. ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function voidFoodOrderAction(orderId: string, reason: string) {
  try {
    const session = await requireFoodPermission("voidOrder");
    const trimmed = reason.trim();
    if (!trimmed) return { ok: false as const, error: "A void reason is required." };

    const order = await prisma.foodOrder.findUnique({ where: { id: orderId } });
    if (!order) return { ok: false as const, error: "Order not found." };
    if (order.status === "VOID") return { ok: false as const, error: "Already voided." };

    await prisma.foodOrder.update({
      where: { id: orderId },
      data: {
        status: "VOID",
        voidReason: trimmed,
        voidedAt: new Date(),
        voidedById: session.id,
      },
    });
    revalidateFood();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Void failed." };
  }
}

export async function listFoodOrdersAction() {
  await requireFoodAccess();
  const orders = await prisma.foodOrder.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      items: true,
      createdBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
    },
  });
  return orders.map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    total: o.total,
    paymentMethod: o.paymentMethod,
    status: o.status,
    voidReason: o.voidReason,
    voidedAt: o.voidedAt?.toISOString() ?? null,
    note: o.note,
    createdAt: o.createdAt.toISOString(),
    createdByName: o.createdBy?.name ?? null,
    voidedByName: o.voidedBy?.name ?? null,
    items: o.items.map((i) => ({
      name: i.nameSnapshot,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
  }));
}

export async function listFoodStaffAction() {
  await requireAdmin();
  const staff = await prisma.user.findMany({
    where: { role: "FOOD_STAFF" },
    orderBy: { username: "asc" },
  });
  return staff.map((s) => ({
    id: s.id,
    username: s.username,
    name: s.name,
    active: s.active,
    canAddFoodItems: s.canAddFoodItems,
    canRemoveFoodItems: s.canRemoveFoodItems,
    canChangeFoodPrices: s.canChangeFoodPrices,
    canVoidFoodOrders: s.canVoidFoodOrders,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function updateFoodStaffAction(input: {
  userId: string;
  active?: boolean;
  canAddFoodItems?: boolean;
  canRemoveFoodItems?: boolean;
  canChangeFoodPrices?: boolean;
  canVoidFoodOrders?: boolean;
}) {
  try {
    await requireAdmin();
    const existing = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!existing || existing.role !== "FOOD_STAFF") {
      return { ok: false as const, error: "Food staff not found." };
    }
    await prisma.user.update({
      where: { id: input.userId },
      data: {
        active: typeof input.active === "boolean" ? input.active : undefined,
        canAddFoodItems:
          typeof input.canAddFoodItems === "boolean" ? input.canAddFoodItems : undefined,
        canRemoveFoodItems:
          typeof input.canRemoveFoodItems === "boolean" ? input.canRemoveFoodItems : undefined,
        canChangeFoodPrices:
          typeof input.canChangeFoodPrices === "boolean" ? input.canChangeFoodPrices : undefined,
        canVoidFoodOrders:
          typeof input.canVoidFoodOrders === "boolean" ? input.canVoidFoodOrders : undefined,
      },
    });
    revalidateFood();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Update failed." };
  }
}

/** Admin + food staff may place orders; bar cannot. */
export async function requireFoodOrderSession() {
  return requireSession();
}
