import { getProducts } from "@/lib/data";
import { ProductsAdmin } from "@/components/ProductsAdmin";
import { requireSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const [products, session] = await Promise.all([getProducts(false), requireSession()]);
  return <ProductsAdmin products={products} isAdmin={session.role === "ADMIN"} />;
}
