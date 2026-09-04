import { prisma } from "@/lib/prisma";
import { getProducts } from "@/lib/data";
import { StockBoard } from "@/components/StockBoard";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const [products, adjustments] = await Promise.all([
    getProducts(false),
    prisma.stockAdjustment.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { product: true, createdBy: true },
    }),
  ]);

  return (
    <StockBoard
      products={products}
      adjustments={adjustments.map((row) => ({
        id: row.id,
        productName: row.product.name,
        type: row.adjustmentType,
        quantity: row.quantity,
        unit: row.unit,
        reason: row.reason,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
        createdByName: row.createdBy?.name ?? null,
      }))}
    />
  );
}
