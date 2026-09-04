import { getLiveStats, getProducts } from "@/lib/data";
import { OrderPad } from "@/components/OrderPad";

export const dynamic = "force-dynamic";

export default async function OrderPage() {
  const [products, stats] = await Promise.all([getProducts(true), getLiveStats()]);
  return <OrderPad initialProducts={products} initialStats={stats} />;
}
