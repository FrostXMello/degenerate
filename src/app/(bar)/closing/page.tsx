import { prisma } from "@/lib/prisma";
import { getLiveStats, getProducts, getProductStats } from "@/lib/data";
import { ClosingBoard } from "@/components/ClosingBoard";

export const dynamic = "force-dynamic";

export default async function ClosingPage() {
  const [products, stats, sales, reports] = await Promise.all([
    getProducts(false),
    getLiveStats(),
    getProductStats(),
    prisma.closingReport.findMany({
      orderBy: { createdAt: "desc" },
      include: { createdBy: true, lines: { include: { product: true } } },
    }),
  ]);

  return (
    <ClosingBoard
      products={products}
      stats={stats}
      sales={sales}
      reports={reports.map((report) => ({
        id: report.id,
        createdAt: report.createdAt.toISOString(),
        createdByName: report.createdBy?.name ?? null,
        notes: report.notes,
        lines: report.lines.map((line) => ({
          productName: line.product.name,
          estimatedStock: line.estimatedStock,
          physicalStock: line.physicalStock,
          variance: line.variance,
          unit: line.unit,
        })),
      }))}
    />
  );
}
