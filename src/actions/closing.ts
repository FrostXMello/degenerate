"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { remainingDisplay } from "@/lib/stock-math";

export async function saveClosingAction(input: {
  notes?: string;
  lines: { productId: string; physicalStock: number }[];
}) {
  const user = await requireSession();
  if (input.lines.length === 0) {
    return { ok: false as const, error: "Enter physical counts before saving." };
  }

  try {
    const products = await prisma.product.findMany({
      include: { stock: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    await prisma.closingReport.create({
      data: {
        notes: input.notes?.trim() || null,
        createdById: user.id,
        lines: {
          create: input.lines.map((line) => {
            const product = byId.get(line.productId);
            if (!product) throw new Error("Product missing");
            const display = remainingDisplay({
              trackingType: product.trackingType,
              estimatedVolumeMl: product.stock?.estimatedVolumeMl ?? 0,
              estimatedUnits: product.stock?.estimatedUnits ?? 0,
              bottleSizeMl: product.bottleSizeMl,
              pegSizeMl: product.pegSizeMl,
            });
            const physical = Number(line.physicalStock);
            if (!Number.isFinite(physical)) {
              throw new Error(`Invalid count for ${product.name}`);
            }
            return {
              productId: product.id,
              estimatedStock: display.remaining,
              physicalStock: physical,
              variance: physical - display.remaining,
              unit: display.unit,
            };
          }),
        },
      },
    });

    revalidatePath("/closing");
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: `CLOSING NOT SAVED. ${message}` };
  }
}
