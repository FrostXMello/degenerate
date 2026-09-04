import { getProducts } from "@/lib/data";
import { ProductsAdmin } from "@/components/ProductsAdmin";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const products = await getProducts(false);
  return <ProductsAdmin products={products} />;
}
