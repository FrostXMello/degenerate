import { requireFoodAccess } from "@/lib/auth";
import { listFoodOrdersAction } from "@/actions/food";
import { FoodOrdersBoard } from "@/components/FoodOrdersBoard";

export const dynamic = "force-dynamic";

export default async function FoodOrdersPage() {
  const [access, orders] = await Promise.all([requireFoodAccess(), listFoodOrdersAction()]);
  return <FoodOrdersBoard user={access} initialOrders={orders} />;
}
