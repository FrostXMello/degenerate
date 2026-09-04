"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/actions/auth";
import type { SessionUser } from "@/lib/auth";
import { cn } from "@/lib/format";

const barLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/order", label: "New Order" },
  { href: "/orders", label: "Orders" },
  { href: "/stock", label: "Stock" },
  { href: "/products", label: "Products" },
  { href: "/closing", label: "Closing" },
  { href: "/gate", label: "Gate", admin: true },
];

export function AppNav({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const isGate = user.role === "GATE_STAFF";
  const links = isGate
    ? [{ href: "/gate", label: "Gate Entry" }]
    : barLinks.filter((l) => !("admin" in l && l.admin) || user.role === "ADMIN");

  const roleLabel =
    user.role === "ADMIN" ? "Admin" : user.role === "GATE_STAFF" ? "Gate" : "Bar";

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-ink/90 backdrop-blur-xl shrink-0 safe-top overflow-x-hidden">
      <div className="mx-auto max-w-7xl w-full min-w-0 px-4 py-2 flex items-center gap-2 sm:gap-3">
        <Link href={isGate ? "/gate" : "/order"} className="shrink-0">
          <p className="font-display text-xl leading-none text-gold">DEGENERATE</p>
          <p className="text-[9px] tracking-[0.35em] text-mute uppercase">
            {isGate ? "Gate" : "Bar ledger"}
          </p>
        </Link>
        <nav className="flex-1 min-w-0 overflow-x-auto overscroll-x-contain scrollbar-none">
          <ul className="flex items-center gap-1 w-max max-w-none">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <li key={link.href} className="shrink-0">
                  <Link
                    href={link.href}
                    prefetch
                    className={cn(
                      "block rounded-full px-3 py-1.5 text-sm whitespace-nowrap",
                      active ? "bg-gold text-ink font-semibold" : "text-mute hover:text-cream",
                    )}
                  >
                    {link.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <form action={logoutAction} className="shrink-0 flex items-center gap-2">
          <span className="hidden sm:block text-xs text-mute max-w-[7rem] truncate">
            {user.name} · {roleLabel}
          </span>
          <button className="text-xs uppercase tracking-wider text-mute hover:text-cream">Sign out</button>
        </form>
      </div>
    </header>
  );
}
