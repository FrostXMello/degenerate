import { getLiveStats, getProductStats, getProducts, getTopSellers } from "@/lib/data";
import { DashboardView } from "@/components/DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [stats, sellers, products, productStats] = await Promise.all([
    getLiveStats(),
    getTopSellers("quantity"),
    getProducts(true),
    getProductStats(),
  ]);

  return (
    <DashboardView stats={stats} sellers={sellers} products={products} productStats={productStats} />
  );
}
