import { prisma } from "./prisma";
import { remainingDisplay, stockLevel, type StockLevel } from "./stock-math";
import type { TrackingType } from "@prisma/client";

export type ProductCard = {
  id: string;
  name: string;
  fullName: string | null;
  slug: string;
  category: string;
  trackingType: TrackingType;
  bottleSizeMl: number | null;
  pegSizeMl: number | null;
  sizeMl: number | null;
  sortOrder: number;
  active: boolean;
  initialBottles: number | null;
  initialUnits: number | null;
  initialVolumeMl: number | null;
  lowThreshold: number;
  veryLowThreshold: number;
  price: number | null;
  couponPrice: number | null;
  stock: {
    estimatedVolumeMl: number | null;
    estimatedUnits: number | null;
    remaining: number;
    remainingLabel: string;
    secondaryLabel: string | null;
    level: StockLevel;
    unit: "bottles" | "units";
  };
};

function toCard(product: {
  id: string;
  name: string;
  fullName: string | null;
  slug: string;
  category: string;
  trackingType: TrackingType;
  bottleSizeMl: number | null;
  pegSizeMl: number | null;
  sizeMl: number | null;
  sortOrder: number;
  active: boolean;
  initialBottles: number | null;
  initialUnits: number | null;
  initialVolumeMl: number | null;
  lowThreshold: number;
  veryLowThreshold: number;
  prices: { price: number; couponPrice: number | null }[];
  stock: { estimatedVolumeMl: number | null; estimatedUnits: number | null } | null;
}): ProductCard {
  const display = remainingDisplay({
    trackingType: product.trackingType,
    estimatedVolumeMl: product.stock?.estimatedVolumeMl ?? 0,
    estimatedUnits: product.stock?.estimatedUnits ?? 0,
    bottleSizeMl: product.bottleSizeMl,
    pegSizeMl: product.pegSizeMl,
  });
  const level = stockLevel(display.remaining, product.lowThreshold, product.veryLowThreshold);
  return {
    id: product.id,
    name: product.name,
    fullName: product.fullName,
    slug: product.slug,
    category: product.category,
    trackingType: product.trackingType,
    bottleSizeMl: product.bottleSizeMl,
    pegSizeMl: product.pegSizeMl,
    sizeMl: product.sizeMl,
    sortOrder: product.sortOrder,
    active: product.active,
    initialBottles: product.initialBottles,
    initialUnits: product.initialUnits,
    initialVolumeMl: product.initialVolumeMl,
    lowThreshold: product.lowThreshold,
    veryLowThreshold: product.veryLowThreshold,
    price: product.prices[0]?.price ?? null,
    couponPrice: product.prices[0]?.couponPrice ?? null,
    stock: {
      estimatedVolumeMl: product.stock?.estimatedVolumeMl ?? null,
      estimatedUnits: product.stock?.estimatedUnits ?? null,
      remaining: display.remaining,
      remainingLabel: display.remainingLabel,
      secondaryLabel: display.secondaryLabel,
      level,
      unit: display.unit,
    },
  };
}

const productInclude = {
  prices: {
    where: { active: true },
    orderBy: { effectiveFrom: "desc" as const },
    take: 1,
  },
  stock: true,
};

export async function getProducts(activeOnly = false) {
  const products = await prisma.product.findMany({
    where: activeOnly ? { active: true } : undefined,
    include: productInclude,
    orderBy: { sortOrder: "asc" },
  });
  return products.map(toCard);
}

export async function getLiveStats() {
  const [completed, itemGroups] = await Promise.all([
    prisma.order.aggregate({
      where: { status: "COMPLETED" },
      _sum: { total: true },
      _count: { _all: true },
      _avg: { total: true },
    }),
    prisma.orderItem.groupBy({
      by: ["unit"],
      where: { order: { status: "COMPLETED" } },
      _sum: { quantity: true },
    }),
  ]);

  const pegs = itemGroups.find((g) => g.unit === "peg")?._sum.quantity ?? 0;
  const beer = itemGroups.find((g) => g.unit === "unit")?._sum.quantity ?? 0;
  const revenue = completed._sum.total ?? 0;
  const orders = completed._count._all;
  const average = completed._avg.total ?? 0;

  return { revenue, orders, average, pegs, beer };
}

export async function getTopSellers(sort: "quantity" | "revenue" = "quantity") {
  const items = await prisma.orderItem.groupBy({
    by: ["productId", "productNameSnapshot", "unit"],
    where: { order: { status: "COMPLETED" } },
    _sum: { quantity: true, lineTotal: true },
    _count: { orderId: true },
  });

  const ranked = items.map((item) => ({
    productId: item.productId,
    name: item.productNameSnapshot,
    unit: item.unit,
    quantity: item._sum.quantity ?? 0,
    revenue: item._sum.lineTotal ?? 0,
    orderCount: item._count.orderId,
  }));

  ranked.sort((a, b) => (sort === "revenue" ? b.revenue - a.revenue : b.quantity - a.quantity));
  return ranked;
}

export async function getProductStats() {
  const products = await getProducts(false);
  const completedItems = await prisma.orderItem.findMany({
    where: { order: { status: "COMPLETED" } },
    select: {
      productId: true,
      quantity: true,
      lineTotal: true,
      volumeConsumedMl: true,
      orderId: true,
    },
  });
  const adjustments = await prisma.stockAdjustment.findMany();

  return products.map((product) => {
    const sold = completedItems.filter((i) => i.productId === product.id);
    const qtySold = sold.reduce((sum, i) => sum + i.quantity, 0);
    const revenue = sold.reduce((sum, i) => sum + i.lineTotal, 0);
    const mlConsumed = sold.reduce((sum, i) => sum + (i.volumeConsumedMl ?? 0), 0);
    const orderIds = new Set(sold.map((i) => i.orderId));
    const added = adjustments
      .filter((a) => a.productId === product.id && a.adjustmentType === "ADD")
      .reduce((sum, a) => sum + a.quantity, 0);
    const removed = adjustments
      .filter((a) => a.productId === product.id && a.adjustmentType === "REMOVE")
      .reduce((sum, a) => sum + a.quantity, 0);

    const bottlesConsumed =
      product.trackingType === "LIQUOR" && product.bottleSizeMl
        ? mlConsumed / product.bottleSizeMl
        : null;

    return {
      ...product,
      qtySold,
      revenue,
      mlConsumed,
      bottlesConsumed,
      orderCount: orderIds.size,
      stockAdded: added,
      stockRemoved: removed,
    };
  });
}
