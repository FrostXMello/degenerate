import { redirect } from "next/navigation";
import { readSession, requireGateAccess } from "@/lib/auth";
import { getGuestSnapshot } from "@/actions/guests";
import { GuestListBoard } from "@/components/GuestListBoard";

export const dynamic = "force-dynamic";

export default async function GuestsPage() {
  const session = await readSession();
  if (!session) redirect("/login");
  if (session.role !== "ADMIN" && session.role !== "GATE_STAFF") redirect("/order");

  const access = await requireGateAccess();
  const snap = await getGuestSnapshot();

  return (
    <GuestListBoard
      user={{
        ...session,
        canAddGateEntries: access.canAddGateEntries,
        canRemoveGateEntries: access.canRemoveGateEntries,
      }}
      initialGuests={snap.guests}
      initialStats={snap.stats}
    />
  );
}
