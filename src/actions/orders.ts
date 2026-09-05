"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { liquorVolumeFromPegs, PEG_ML } from "@/lib/stock-math";
import type { Prisma, TrackingType, PaymentMethod } from "@prisma/client";

export type CartItemInput = {
  productId: string;
  quantity: number;
};

export type OrderStockDelta = {
  productId: string;
  quantity: number;
  trackingType: TrackingType;
  volumeMl: number | null;
};

function unitPriceFor(
  row: { price: number; couponPrice: number | null } | undefined,
  paymentMethod: PaymentMethod,
) {
  if (!row) return 0;
  if (paymentMethod === "COUPON") {
    return row.couponPrice ?? row.price;
  }
  return row.price;
}

function bumpCaches() {
  revalidatePath("/dashboard");
  revalidatePath("/orders");
  revalidatePath("/stock");
  revalidatePath("/closing");
}

async function applyStockDelta(
  tx: Prisma.TransactionClient,
  product: { id: string; trackingType: TrackingType; pegSizeMl: number | null },
  quantityDelta: number,
) {
  if (product.trackingType === "LIQUOR") {
    const ml = liquorVolumeFromPegs(quantityDelta, product.pegSizeMl || PEG_ML);
    await tx.stock.update({
      where: { productId: product.id },
      data: { estimatedVolumeMl: { decrement: ml } },
    });
    return;
  }

  await tx.stock.update({
    where: { productId: product.id },
    data: { estimatedUnits: { decrement: quantityDelta } },
  });
}

export async function createOrderAction(input: {
  items: CartItemInput[];
  idempotencyKey: string;
  paymentMethod?: PaymentMethod;
}) {
  const user = await requireSession();
  const paymentMethod: PaymentMethod =
    input.paymentMethod === "COUPON" ? "COUPON" : "CASH_UPI";

  if (!input.idempotencyKey) {
    return { ok: false as const, error: "ORDER NOT SAVED. Missing request key. Try again." };
  }

  const items = input.items.filter((i) => Number.isInteger(i.quantity) && i.quantity > 0);
  if (items.length === 0) {
    return { ok: false as const, error: "ORDER NOT SAVED. Add at least one item." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.order.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { orderNumber: true, total: true, paymentMethod: true },
      });
      if (existing) {
        return {
          orderNumber: existing.orderNumber,
          total: existing.total,
          paymentMethod: existing.paymentMethod,
          pegs: 0,
          beer: 0,
          deltas: [] as OrderStockDelta[],
          duplicate: true,
        };
      }

      const products = await tx.product.findMany({
        where: { id: { in: items.map((i) => i.productId) }, active: true },
        include: {
          prices: {
            where: { active: true },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
      });

      const byId = new Map(products.map((p) => [p.id, p]));
      const lines = [];
      const deltas: OrderStockDelta[] = [];
      let pegs = 0;
      let beer = 0;

      for (const item of items) {
        const product = byId.get(item.productId);
        if (!product) throw new Error("Product is unavailable");
        const price = unitPriceFor(product.prices[0], paymentMethod);
        const unit = product.trackingType === "LIQUOR" ? "peg" : "unit";
        const volumeConsumedMl =
          product.trackingType === "LIQUOR"
            ? liquorVolumeFromPegs(item.quantity, product.pegSizeMl || PEG_ML)
            : null;
        if (unit === "peg") pegs += item.quantity;
        else beer += item.quantity;
        lines.push({
          product,
          quantity: item.quantity,
          unit,
          unitPrice: price,
          lineTotal: item.quantity * price,
          volumeConsumedMl,
        });
        deltas.push({
          productId: product.id,
          quantity: item.quantity,
          trackingType: product.trackingType,
          volumeMl: volumeConsumedMl,
        });
      }

      const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);
      const last = await tx.order.findFirst({
        orderBy: { orderNumber: "desc" },
        select: { orderNumber: true },
      });
      const orderNumber = (last?.orderNumber ?? 0) + 1;

      await tx.order.create({
        data: {
          orderNumber,
          total,
          paymentMethod,
          status: "COMPLETED",
          idempotencyKey: input.idempotencyKey,
          createdById: user.id,
          items: {
            create: lines.map((line) => ({
              productId: line.product.id,
              productNameSnapshot: line.product.name,
              quantity: line.quantity,
              unit: line.unit,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              volumeConsumedMl: line.volumeConsumedMl,
            })),
          },
        },
      });

      await Promise.all(lines.map((line) => applyStockDelta(tx, line.product, line.quantity)));

      return { orderNumber, total, paymentMethod, pegs, beer, deltas, duplicate: false };
    });

    bumpCaches();

    return {
      ok: true as const,
      orderNumber: result.orderNumber,
      total: result.total,
      paymentMethod: result.paymentMethod,
      pegs: result.pegs,
      beer: result.beer,
      deltas: result.deltas,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: `ORDER NOT SAVED. ${message}` };
  }
}

export async function voidOrderAction(orderId: string, reason: string) {
  const user = await requireSession();
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false as const, error: "A void reason is required." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } } },
      });
      if (!order) throw new Error("Order not found");
      if (order.status === "VOID") throw new Error("Order is already void");

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "VOID",
          voidReason: trimmed,
          voidedAt: new Date(),
          voidedById: user.id,
        },
      });

      await Promise.all(
        order.items.map((item) => applyStockDelta(tx, item.product, -item.quantity)),
      );
    });

    bumpCaches();
    revalidatePath("/order");
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}

export async function updateOrderAction(orderId: string, items: CartItemInput[]) {
  const user = await requireSession();
  const nextItems = items.filter((i) => Number.isInteger(i.quantity) && i.quantity > 0);
  if (nextItems.length === 0) {
    return { ok: false as const, error: "Keep at least one item, or void the order instead." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } } },
      });
      if (!order) throw new Error("Order not found");
      if (order.status === "VOID") throw new Error("Voided orders cannot be edited");

      await Promise.all(
        order.items.map((item) => applyStockDelta(tx, item.product, -item.quantity)),
      );

      await tx.orderItem.deleteMany({ where: { orderId } });

      const products = await tx.product.findMany({
        where: { id: { in: nextItems.map((i) => i.productId) } },
        include: {
          prices: {
            where: { active: true },
            orderBy: { effectiveFrom: "desc" },
            take: 1,
          },
        },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      const lines = [];

      for (const item of nextItems) {
        const product = byId.get(item.productId);
        if (!product) throw new Error("Product missing");
        const existing = order.items.find((i) => i.productId === item.productId);
        const catalog = product.prices[0];
        const unitPrice =
          existing?.unitPrice ??
          unitPriceFor(catalog, order.paymentMethod);
        const unit = product.trackingType === "LIQUOR" ? "peg" : "unit";
        const volumeConsumedMl =
          product.trackingType === "LIQUOR"
            ? liquorVolumeFromPegs(item.quantity, product.pegSizeMl || PEG_ML)
            : null;
        lines.push({
          productId: product.id,
          productNameSnapshot: existing?.productNameSnapshot ?? product.name,
          quantity: item.quantity,
          unit,
          unitPrice,
          lineTotal: item.quantity * unitPrice,
          volumeConsumedMl,
          product,
        });
      }

      const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

      await tx.order.update({
        where: { id: orderId },
        data: {
          total,
          updatedAt: new Date(),
          items: {
            create: lines.map(({ product, ...line }) => line),
          },
        },
      });

      await Promise.all(lines.map((line) => applyStockDelta(tx, line.product, line.quantity)));

      void user;
    });

    bumpCaches();
    revalidatePath("/order");
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: `CHANGES NOT SAVED. ${message}` };
  }
}
