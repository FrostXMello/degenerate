import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";
import { AppNav } from "@/components/AppNav";
import { LiveSync } from "@/components/LiveSync";

export const dynamic = "force-dynamic";

export default async function BarLayout({ children }: { children: React.ReactNode }) {
  const user = await readSession();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen w-full overflow-x-hidden">
      <LiveSync />
      <AppNav user={user} />
      <div className="mx-auto w-full max-w-7xl min-w-0 px-4 py-5 pb-28 md:pb-8 overflow-x-hidden">
        {children}
      </div>
    </div>
  );
}
