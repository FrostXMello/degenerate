"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";
import { DEFAULT_BOTTLE_ML, liquorVolumeFromBottles, PEG_ML } from "@/lib/stock-math";
import type { TrackingType } from "@prisma/client";

function revalidateProducts() {
  revalidatePath("/products");
  revalidatePath("/order");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  revalidatePath("/closing");
}

function slugify(name: string) {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return base || "drink";
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let n = 2;
  while (await prisma.product.findUnique({ where: { slug } })) {
    slug = `${base}-${n}`;
    n += 1;
  }
  return slug;
}

export async function setPriceAction(productId: string, price: number) {
  const user = await requireSession();
  if (!Number.isInteger(price) || price < 0) {
    return { ok: false as const, error: "Price must be a whole rupee amount." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.price.updateMany({
        where: { productId, active: true },
        data: { active: false },
      });
      await tx.price.create({
        data: {
          productId,
          price,
          active: true,
          createdById: user.id,
        },
      });
    });
    revalidateProducts();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}

export async function clearPriceAction(productId: string) {
  await requireSession();
  try {
    await prisma.price.updateMany({
      where: { productId, active: true },
      data: { active: false },
    });
    revalidateProducts();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}

export async function updateProductAction(input: {
  productId: string;
  name?: string;
  bottleSizeMl?: number | null;
  sizeMl?: number | null;
  lowThreshold?: number;
  veryLowThreshold?: number;
  active?: boolean;
}) {
  const user = await requireSession();
  try {
    await prisma.product.update({
      where: { id: input.productId },
      data: {
        name: input.name?.trim() || undefined,
        fullName: input.name?.trim() || undefined,
        bottleSizeMl: input.bottleSizeMl,
        sizeMl: input.sizeMl,
        lowThreshold: input.lowThreshold,
        veryLowThreshold: input.veryLowThreshold,
        active: input.active,
        updatedById: user.id,
      },
    });
    revalidateProducts();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}

export async function createProductAction(input: {
  name: string;
  trackingType: TrackingType;
  bottleSizeMl?: number | null;
  sizeMl?: number | null;
  initialBottles?: number;
  initialUnits?: number;
  price?: number | null;
}) {
  const user = await requireSession();
  const name = input.name.trim();
  if (!name) {
    return { ok: false as const, error: "Enter a drink name." };
  }

  const trackingType = input.trackingType;
  if (trackingType !== "LIQUOR" && trackingType !== "BEER") {
    return { ok: false as const, error: "Choose liquor or beer/unit drink." };
  }

  try {
    const last = await prisma.product.findFirst({
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    const slug = await uniqueSlug(name);

    if (trackingType === "LIQUOR") {
      const bottleSizeMl = input.bottleSizeMl && input.bottleSizeMl > 0 ? input.bottleSizeMl : DEFAULT_BOTTLE_ML;
      const bottles = Number(input.initialBottles ?? 0);
      if (!Number.isFinite(bottles) || bottles < 0) {
        return { ok: false as const, error: "Opening bottles must be 0 or more." };
      }
      const volumeMl = liquorVolumeFromBottles(bottles, bottleSizeMl);

      const product = await prisma.$transaction(async (tx) => {
        const created = await tx.product.create({
          data: {
            name,
            fullName: name,
            slug,
            category: "LIQUOR",
            trackingType: "LIQUOR",
            bottleSizeMl,
            pegSizeMl: PEG_ML,
            sizeMl: bottleSizeMl,
            sortOrder: (last?.sortOrder ?? 0) + 1,
            initialBottles: bottles,
            initialVolumeMl: volumeMl,
            lowThreshold: 4,
            veryLowThreshold: 1,
            updatedById: user.id,
            stock: {
              create: {
                estimatedVolumeMl: volumeMl,
                estimatedUnits: null,
              },
            },
          },
        });

        if (input.price != null && Number.isInteger(input.price) && input.price >= 0) {
          await tx.price.create({
            data: {
              productId: created.id,
              price: input.price,
              active: true,
              createdById: user.id,
            },
          });
        }

        return created;
      });

      revalidateProducts();
      return { ok: true as const, productId: product.id };
    }

    const units = Number(input.initialUnits ?? 0);
    if (!Number.isFinite(units) || units < 0) {
      return { ok: false as const, error: "Opening units must be 0 or more." };
    }
    const sizeMl = input.sizeMl && input.sizeMl > 0 ? input.sizeMl : null;

    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          name,
          fullName: name,
          slug,
          category: "BEER",
          trackingType: "BEER",
          bottleSizeMl: null,
          pegSizeMl: null,
          sizeMl,
          sortOrder: (last?.sortOrder ?? 0) + 1,
          initialUnits: units,
          lowThreshold: 24,
          veryLowThreshold: 8,
          updatedById: user.id,
          stock: {
            create: {
              estimatedVolumeMl: null,
              estimatedUnits: units,
            },
          },
        },
      });

      if (input.price != null && Number.isInteger(input.price) && input.price >= 0) {
        await tx.price.create({
          data: {
            productId: created.id,
            price: input.price,
            active: true,
            createdById: user.id,
          },
        });
      }

      return created;
    });

    revalidateProducts();
    return { ok: true as const, productId: product.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}
