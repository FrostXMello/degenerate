import { requireFoodAccess } from "@/lib/auth";
import { listFoodMenuAction } from "@/actions/food";
import { FoodMenuBoard } from "@/components/FoodMenuBoard";

export const dynamic = "force-dynamic";

export default async function FoodMenuPage() {
  const [access, items] = await Promise.all([requireFoodAccess(), listFoodMenuAction(true)]);
  return <FoodMenuBoard user={access} initialItems={items} />;
}
