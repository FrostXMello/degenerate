"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOrderAction, voidOrderAction } from "@/actions/orders";
import { VOID_REASONS } from "@/lib/stock-math";
import { formatDateTime, formatInr, formatOrderNumber } from "@/lib/format";
import type { ProductCard } from "@/lib/data";

type Item = {
  productId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
};

export function OrderDetail({
  order,
  products,
}: {
  order: {
    id: string;
    orderNumber: number;
    total: number;
    paymentMethod: "CASH_UPI" | "COUPON";
    status: "COMPLETED" | "VOID";
    createdAt: string;
    createdByName: string | null;
    voidedByName: string | null;
    voidReason: string | null;
    voidedAt: string | null;
    items: Item[];
  };
  products: ProductCard[];
}) {
  const router = useRouter();
  const [qty, setQty] = useState<Record<string, number>>(() =>
    Object.fromEntries(order.items.map((i) => [i.productId, i.quantity])),
  );
  const [reason, setReason] = useState<string>(VOID_REASONS[0]);
  const [other, setOther] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const locked = order.status === "VOID";

  const lines = products
    .filter((p) => (qty[p.id] || 0) > 0)
    .map((p) => {
      const existing = order.items.find((i) => i.productId === p.id);
      const quantity = qty[p.id];
      const catalogPrice =
        order.paymentMethod === "COUPON"
          ? (p.couponPrice ?? p.price ?? 0)
          : (p.price ?? 0);
      const unitPrice = existing?.unitPrice ?? catalogPrice;
      return {
        productId: p.id,
        name: existing?.name ?? p.name,
        quantity,
        unit: p.trackingType === "LIQUOR" ? "peg" : "unit",
        unitPrice,
        lineTotal: quantity * unitPrice,
      };
    });
  const total = lines.reduce((sum, line) => sum + line.lineTotal, 0);

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await updateOrderAction(
        order.id,
        lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
      );
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  function voidOrder() {
    const text = reason === "Other" ? other.trim() : reason;
    setError(null);
    startTransition(async () => {
      const result = await voidOrderAction(order.id, text);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-6">
      <div>
        <p className="text-xs tracking-[0.35em] text-gold uppercase">Order</p>
        <h1 className="font-display text-5xl leading-none">{formatOrderNumber(order.orderNumber)}</h1>
        <p className="text-sm text-mute mt-2">
          {formatDateTime(order.createdAt)} · {order.createdByName || "Unknown"} · {order.status} ·{" "}
          {order.paymentMethod === "COUPON" ? "Coupon" : "Cash/UPI"}
        </p>
        {order.status === "VOID" && (
          <p className="mt-3 rounded-xl bg-red-500/15 border border-red-400/30 px-4 py-3 text-sm text-red-200">
            VOID · {order.voidReason} {order.voidedByName ? `· by ${order.voidedByName}` : ""}
          </p>
        )}
        {error && <p className="mt-3 rounded-xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>}

        <div className="mt-6 grid sm:grid-cols-2 gap-3">
          {products.map((product) => (
            <div key={product.id} className="panel rounded-2xl p-4">
              <div className="flex justify-between">
                <div>
                  <h2 className="font-display text-2xl leading-none">{product.name}</h2>
                  <p className="text-xs text-mute mt-1">{product.trackingType === "LIQUOR" ? "peg" : "unit"}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  disabled={locked}
                  className="h-10 w-10 rounded-xl bg-white/5"
                  onClick={() => setQty((p) => ({ ...p, [product.id]: Math.max(0, (p[product.id] || 0) - 1) }))}
                >
                  −
                </button>
                <div className="flex-1 text-center font-display text-3xl">{qty[product.id] || 0}</div>
                <button
                  disabled={locked}
                  className="h-10 w-10 rounded-xl bg-white/5"
                  onClick={() => setQty((p) => ({ ...p, [product.id]: (p[product.id] || 0) + 1 }))}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside className="panel rounded-3xl p-5 h-fit">
        <p className="text-xs uppercase tracking-[0.3em] text-mute">Ticket</p>
        <ul className="mt-4 space-y-2 text-sm">
          {lines.map((line) => (
            <li key={line.productId} className="flex justify-between">
              <span>
                {line.name} × {line.quantity}
              </span>
              <span className="tabular-nums">{formatInr(line.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="gold-line my-4" />
        <div className="flex justify-between items-end">
          <span className="text-mute">Total</span>
          <span className="font-display text-4xl text-gold">{formatInr(total)}</span>
        </div>
        {!locked && (
          <button
            onClick={save}
            disabled={pending || lines.length === 0}
            className="pressable mt-5 w-full rounded-xl bg-gold text-ink font-semibold py-3 disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save changes"}
          </button>
        )}

        {!locked && (
          <div className="mt-8">
            <p className="text-xs uppercase tracking-[0.3em] text-red-300">Void order</p>
            <p className="text-xs text-mute mt-1">Keeps the record. Drops it from revenue and consumption.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {VOID_REASONS.map((item) => (
                <button
                  key={item}
                  onClick={() => setReason(item)}
                  className={`rounded-full px-3 py-1 text-xs ${reason === item ? "bg-red-500 text-white" : "bg-white/5 text-mute"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            {reason === "Other" && (
              <input
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="Reason"
                className="mt-3 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm"
              />
            )}
            <button
              onClick={voidOrder}
              disabled={pending}
              className="pressable mt-3 w-full rounded-xl border border-red-400/40 text-red-200 py-3"
            >
              Mark VOID
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
