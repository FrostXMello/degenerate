"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { cn, formatDateTime, formatInr, formatOrderNumber } from "@/lib/format";

export type OrderRow = {
  id: string;
  orderNumber: number;
  total: number;
  paymentMethod: "CASH_UPI" | "COUPON";
  status: "COMPLETED" | "VOID";
  createdAt: string;
  createdByName: string | null;
  voidReason: string | null;
  items: { productId: string; name: string; quantity: number; unit: string }[];
};

export function OrdersBrowser({
  orders,
  products,
}: {
  orders: OrderRow[];
  products: { id: string; name: string }[];
}) {
  const [q, setQ] = useState("");
  const [productId, setProductId] = useState("all");
  const [status, setStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(() => {
    return orders.filter((order) => {
      if (status !== "all" && order.status !== status) return false;
      if (productId !== "all" && !order.items.some((i) => i.productId === productId)) return false;
      if (from && new Date(order.createdAt) < new Date(from)) return false;
      if (to && new Date(order.createdAt) > new Date(to)) return false;
      if (q.trim()) {
        const hay = [
          formatOrderNumber(order.orderNumber),
          order.createdByName || "",
          ...order.items.map((i) => `${i.name} ${i.quantity}`),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [orders, q, productId, status, from, to]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.35em] text-gold uppercase">History</p>
          <h1 className="font-display text-5xl leading-none">Orders</h1>
        </div>
        <p className="text-sm text-mute">{filtered.length} shown</p>
      </div>

      <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search order, product, user"
          className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm outline-none focus:border-gold lg:col-span-2"
        />
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm"
        >
          <option value="all">All products</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="VOID">Void</option>
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs" />
          <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-xl bg-black/40 border border-white/10 px-2 py-2 text-xs" />
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {filtered.map((order) => (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="panel rounded-2xl p-4 flex flex-wrap items-start justify-between gap-3 hover:border-gold/40"
            >
              <div>
                <p className="font-display text-2xl leading-none">{formatOrderNumber(order.orderNumber)}</p>
                <p className="text-xs text-mute mt-1">
                  {formatDateTime(order.createdAt)} · {order.createdByName || "Unknown"} ·{" "}
                  {order.paymentMethod === "COUPON" ? "Coupon" : "Cash/UPI"}
                </p>
                <p className="text-sm mt-2">
                  {order.items.map((i) => `${i.name} × ${i.quantity}`).join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("font-display text-3xl", order.status === "VOID" ? "text-mute line-through" : "text-gold")}>
                  {formatInr(order.total)}
                </p>
                <span
                  className={cn(
                    "text-xs uppercase tracking-wider",
                    order.status === "VOID" ? "text-red-300" : "text-emerald-300",
                  )}
                >
                  {order.status}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
