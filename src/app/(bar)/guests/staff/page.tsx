import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { listGateAuditAction, listGateStaffAction } from "@/actions/gate";
import { GateStaffAdmin } from "@/components/GateStaffAdmin";

export const dynamic = "force-dynamic";

export default async function GuestsStaffPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/guests");

  const [staff, audit] = await Promise.all([listGateStaffAction(), listGateAuditAction()]);
  return <GateStaffAdmin initialStaff={staff} initialAudit={audit} />;
}
