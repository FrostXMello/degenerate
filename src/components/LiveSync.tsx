"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

const LIVE_TABLES = [
  "Order",
  "OrderItem",
  "Stock",
  "StockAdjustment",
  "Product",
  "Price",
  "OfflinePass",
  "GuestListEntry",
  "ClosingReport",
  "GateAuditLog",
] as const;

/**
 * Keeps every open bar/gate screen in sync:
 * - Supabase Realtime for near-instant updates
 * - Pulse polling backup every 2s while the tab is visible
 */
export function LiveSync() {
  const router = useRouter();
  const lastPulse = useRef<string>("");
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      // Coalesce bursts (one order writes Order + OrderItem + Stock)
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        if (!cancelled && document.visibilityState === "visible") {
          router.refresh();
        }
      }, 120);
    };

    const supabase = getSupabaseBrowser();
    const channel = supabase
      ? (() => {
          let ch = supabase.channel("degenerate-live");
          for (const table of LIVE_TABLES) {
            ch = ch.on(
              "postgres_changes",
              { event: "*", schema: "public", table },
              () => refresh(),
            );
          }
          ch.subscribe();
          return ch;
        })()
      : null;

    const poll = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/live/pulse", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { v?: string };
        if (!data.v || data.v === "err") return;
        if (lastPulse.current && lastPulse.current !== data.v) refresh();
        lastPulse.current = data.v;
      } catch {
        // ignore transient network errors
      }
    };

    void poll();
    // Realtime is primary; pulse is a short backup (slower when Realtime is connected)
    const interval = window.setInterval(poll, channel ? 4000 : 2000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      document.removeEventListener("visibilitychange", onVisible);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
