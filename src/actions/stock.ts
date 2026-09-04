"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { liquorVolumeFromBottles } from "@/lib/stock-math";

function revalidateStock() {
  revalidatePath("/stock");
  revalidatePath("/order");
  revalidatePath("/dashboard");
  revalidatePath("/closing");
}

export async function adjustStockAction(input: {
  productId: string;
  type: "ADD" | "REMOVE";
  quantity: number;
  reason: string;
  note?: string;
}) {
  const user = await requireSession();
  const quantity = Number(input.quantity);
  const reason = input.reason.trim();

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false as const, error: "Enter a quantity greater than zero." };
  }
  if (!reason) {
    return { ok: false as const, error: "Choose a reason." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: input.productId },
        include: { stock: true },
      });
      if (!product || !product.stock) throw new Error("Product not found");

      const signed = input.type === "ADD" ? quantity : -quantity;
      const unit = product.trackingType === "LIQUOR" ? "bottles" : "units";
      const volumeMl =
        product.trackingType === "LIQUOR"
          ? liquorVolumeFromBottles(signed, product.bottleSizeMl || 750)
          : null;

      if (product.trackingType === "LIQUOR") {
        await tx.stock.update({
          where: { productId: product.id },
          data: {
            estimatedVolumeMl: (product.stock.estimatedVolumeMl ?? 0) + (volumeMl ?? 0),
          },
        });
      } else {
        await tx.stock.update({
          where: { productId: product.id },
          data: {
            estimatedUnits: (product.stock.estimatedUnits ?? 0) + signed,
          },
        });
      }

      await tx.stockAdjustment.create({
        data: {
          productId: product.id,
          adjustmentType: input.type,
          quantity,
          unit,
          volumeMl,
          reason,
          note: input.note?.trim() || null,
          createdById: user.id,
        },
      });
    });

    revalidateStock();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: `STOCK NOT UPDATED. ${message}` };
  }
}
