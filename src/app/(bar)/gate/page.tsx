import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Offline passes now live in the unified Door List. */
export default function GatePage() {
  redirect("/guests");
}
