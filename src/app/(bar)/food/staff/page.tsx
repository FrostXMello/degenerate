import { requireAdmin } from "@/lib/auth";
import { listFoodStaffAction } from "@/actions/food";
import { FoodStaffAdmin } from "@/components/FoodStaffAdmin";

export const dynamic = "force-dynamic";

export default async function FoodStaffPage() {
  await requireAdmin();
  const staff = await listFoodStaffAction();
  return <FoodStaffAdmin initialStaff={staff} />;
}
