"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { voidFoodOrderAction } from "@/actions/food";
import { cn, formatDateTime, formatInr, formatOrderNumber } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";

type FoodOrderRow = {
  id: string;
  orderNumber: number;
  total: number;
  paymentMethod: "CASH_UPI" | "COUPON";
  status: "COMPLETED" | "VOID";
  voidReason: string | null;
  voidedAt: string | null;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
  voidedByName: string | null;
  items: { name: string; quantity: number; unitPrice: number; lineTotal: number }[];
};

const VOID_REASONS = ["Mistaken entry", "Duplicate", "Customer cancelled", "Wrong items", "Other"];

export function FoodOrdersBoard({
  user,
  initialOrders,
}: {
  user: SessionUser;
  initialOrders: FoodOrderRow[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [status, setStatus] = useState<"all" | "COMPLETED" | "VOID">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [voidId, setVoidId] = useState<string | null>(null);
  const [reason, setReason] = useState(VOID_REASONS[0]);
  const [other, setOther] = useState("");

  const canVoid = user.role === "ADMIN" || user.canVoidFoodOrders;

  const visible = useMemo(
    () => orders.filter((o) => (status === "all" ? true : o.status === status)),
    [orders, status],
  );

  const completedRevenue = orders
    .filter((o) => o.status === "COMPLETED")
    .reduce((s, o) => s + o.total, 0);
  const voidedCount = orders.filter((o) => o.status === "VOID").length;

  function confirmVoid() {
    if (!voidId) return;
    const text = reason === "Other" ? other.trim() : reason;
    startTransition(async () => {
      const result = await voidFoodOrderAction(voidId, text);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === voidId
            ? {
                ...o,
                status: "VOID" as const,
                voidReason: text,
                voidedAt: new Date().toISOString(),
                voidedByName: user.name,
              }
            : o,
        ),
      );
      setVoidId(null);
      setMessage("Order voided — kept in history for accountants.");
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold">Accountants</p>
          <h1 className="font-display text-4xl leading-none">Food orders</h1>
          <p className="text-sm text-mute mt-1">
            Voided orders stay listed — never deleted — so mistakes remain auditable.
          </p>
        </div>
        <Link href="/food" className="text-sm text-mute hover:text-cream">
          ← New order
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Stat label="Listed" value={String(orders.length)} />
        <Stat label="Revenue (live)" value={formatInr(completedRevenue)} />
        <Stat label="Voided (kept)" value={String(voidedCount)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "COMPLETED", "VOID"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs",
              status === s ? "bg-gold text-ink font-semibold" : "bg-white/5 text-mute",
            )}
          >
            {s === "all" ? "All" : s === "COMPLETED" ? "Active" : "Voided"}
          </button>
        ))}
      </div>

      {message && <p className="text-sm text-gold">{message}</p>}

      <ul className="space-y-2">
        {visible.map((order) => (
          <li key={order.id} className={cn("panel rounded-2xl p-4", order.status === "VOID" && "opacity-80")}>
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-display text-2xl leading-none">{formatOrderNumber(order.orderNumber)}</p>
                <p className="text-xs text-mute mt-1">
                  {formatDateTime(order.createdAt)} · {order.createdByName || "Unknown"} ·{" "}
                  {order.paymentMethod === "COUPON" ? "Coupon" : "Cash/UPI"}
                </p>
                <p className="text-sm mt-2">
                  {order.items.map((i) => `${i.name} × ${i.quantity}`).join(" · ")}
                </p>
                {order.status === "VOID" && (
                  <p className="text-xs text-amber-200 mt-2">
                    VOID · {order.voidReason}
                    {order.voidedByName ? ` · by ${order.voidedByName}` : ""}
                    {order.voidedAt ? ` · ${formatDateTime(order.voidedAt)}` : ""}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p
                  className={cn(
                    "font-display text-3xl",
                    order.status === "VOID" ? "text-mute line-through" : "text-gold",
                  )}
                >
                  {formatInr(order.total)}
                </p>
                <p className={cn("text-xs uppercase", order.status === "VOID" ? "text-amber-200" : "text-emerald-300")}>
                  {order.status === "VOID" ? "VOID (kept)" : "COMPLETED"}
                </p>
                {canVoid && order.status === "COMPLETED" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => setVoidId(order.id)}
                    className="mt-2 rounded-full border border-amber-400/40 text-amber-100 px-3 py-1 text-xs"
                  >
                    Void (mistake)
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
        {visible.length === 0 && (
          <li className="text-center text-mute py-10 text-sm">No food orders in this filter.</li>
        )}
      </ul>

      {voidId && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center p-4">
          <div className="panel rounded-2xl p-5 w-full max-w-md space-y-3">
            <h2 className="font-display text-2xl text-gold">Void order</h2>
            <p className="text-sm text-mute">
              Removes it from revenue but keeps the full record for accountants.
            </p>
            <div className="flex flex-wrap gap-2">
              {VOID_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs",
                    reason === r ? "bg-amber-400 text-ink font-semibold" : "bg-white/5 text-mute",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
            {reason === "Other" && (
              <input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="Reason"
                className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm"
              />
            )}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setVoidId(null)} className="rounded-xl px-4 py-2 text-sm text-mute">
                Cancel
              </button>
              <button
                type="button"
                disabled={pending || (reason === "Other" && !other.trim())}
                onClick={confirmVoid}
                className="rounded-xl bg-amber-400 text-ink font-semibold px-4 py-2 text-sm disabled:opacity-40"
              >
                Confirm void
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-mute">{label}</p>
      <p className="font-display text-2xl text-cream leading-none mt-1">{value}</p>
    </div>
  );
}
