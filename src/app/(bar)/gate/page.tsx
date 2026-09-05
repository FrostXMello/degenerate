import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Old offline-pass gate UI removed — everything is on Guests. */
export default function GatePage() {
  redirect("/guests");
}
