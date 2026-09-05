import { requireFoodAccess } from "@/lib/auth";
import { listFoodMenuAction } from "@/actions/food";
import { FoodOrderPad } from "@/components/FoodOrderPad";

export const dynamic = "force-dynamic";

export default async function FoodPage() {
  const [access, menu] = await Promise.all([requireFoodAccess(), listFoodMenuAction(false)]);
  return <FoodOrderPad user={access} initialMenu={menu} />;
}
