import { redirect } from "next/navigation";
import { readSession, requireGateAccess } from "@/lib/auth";
import { getGateSnapshot } from "@/actions/gate";
import { GateDesk } from "@/components/GateDesk";

export const dynamic = "force-dynamic";

export default async function GatePage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN" && session.role !== "GATE_STAFF") redirect("/order");

  const access = await requireGateAccess();
  const snap = await getGateSnapshot();

  return (
    <GateDesk
      user={{
        ...session,
        canAddGateEntries: access.canAddGateEntries,
        canRemoveGateEntries: access.canRemoveGateEntries,
      }}
      initialPasses={snap.passes}
      initialStats={snap.stats}
    />
  );
}
