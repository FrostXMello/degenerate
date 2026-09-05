"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createFoodOrderAction } from "@/actions/food";
import { cn, formatInr, formatOrderNumber } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import type { PaymentMethod } from "@prisma/client";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
};

export function FoodOrderPad({
  user,
  initialMenu,
}: {
  user: SessionUser;
  initialMenu: MenuItem[];
}) {
  const [menu, setMenu] = useState(initialMenu);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH_UPI");
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const keyRef = useRef(crypto.randomUUID());

  useEffect(() => {
    setMenu(initialMenu);
  }, [initialMenu]);

  const lines = useMemo(
    () =>
      menu
        .filter((m) => (cart[m.id] || 0) > 0)
        .map((m) => {
          const quantity = cart[m.id];
          return {
            item: m,
            quantity,
            lineTotal: quantity * m.price,
          };
        }),
    [menu, cart],
  );
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);
  const count = lines.reduce((s, l) => s + l.quantity, 0);

  function setQty(id: string, next: number) {
    setCart((prev) => {
      const copy = { ...prev };
      const v = Math.max(0, next);
      if (v === 0) delete copy[id];
      else copy[id] = v;
      return copy;
    });
  }

  function submit() {
    if (lines.length === 0 || pending) return;
    const key = keyRef.current;
    keyRef.current = crypto.randomUUID();
    const snapshot = cart;
    const savedTotal = total;
    setCart({});
    setError(null);

    startTransition(async () => {
      const result = await createFoodOrderAction({
        idempotencyKey: key,
        paymentMethod,
        items: lines.map((l) => ({ menuItemId: l.item.id, quantity: l.quantity })),
      });
      if (!result.ok) {
        setCart((c) => (Object.keys(c).length ? c : snapshot));
        setError(result.error);
        return;
      }
      setFlash(
        `${formatOrderNumber(result.orderNumber)} · ${formatInr(result.total ?? savedTotal)} · ${
          paymentMethod === "COUPON" ? "Coupon" : "Cash/UPI"
        }`,
      );
      window.setTimeout(() => setFlash(null), 2500);
    });
  }

  const isAdmin = user.role === "ADMIN";

  return (
    <div className="space-y-4 pb-28 lg:pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold">Food</p>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Menu orders</h1>
          <p className="text-sm text-mute mt-1">Add dishes · cash/UPI or coupon</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/food/orders" className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-mute">
            Order history
          </Link>
          <Link href="/food/menu" className="rounded-full border border-gold/40 text-gold px-3 py-1.5 text-xs">
            Edit menu
          </Link>
          {isAdmin && (
            <Link href="/food/staff" className="rounded-full border border-gold/40 text-gold px-3 py-1.5 text-xs">
              Food staff
            </Link>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit">
        <button
          type="button"
          onClick={() => setPaymentMethod("CASH_UPI")}
          className={cn(
            "rounded-full text-xs font-medium px-3 py-1.5",
            paymentMethod === "CASH_UPI" ? "bg-gold text-ink" : "text-mute",
          )}
        >
          Cash / UPI
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethod("COUPON")}
          className={cn(
            "rounded-full text-xs font-medium px-3 py-1.5",
            paymentMethod === "COUPON" ? "bg-gold text-ink" : "text-mute",
          )}
        >
          Coupon
        </button>
      </div>

      {flash && (
        <p className="rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-3 text-emerald-200">
          {flash}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-red-500/15 border border-red-400/30 px-4 py-3 text-red-200">{error}</p>
      )}

      {menu.length === 0 ? (
        <p className="text-sm text-mute py-10 text-center">
          No menu items yet.{" "}
          <Link href="/food/menu" className="text-gold underline">
            Add dishes
          </Link>
        </p>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {menu.map((item) => {
            const qty = cart[item.id] || 0;
            return (
              <li key={item.id} className={cn("panel rounded-2xl p-4", qty > 0 && "border-gold/50")}>
                <div className="flex justify-between gap-2">
                  <h2 className="font-display text-2xl leading-none">{item.name}</h2>
                  <p className="text-gold tabular-nums">{formatInr(item.price)}</p>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    className="pressable h-11 w-11 rounded-xl bg-white/5 text-xl"
                    onClick={() => setQty(item.id, qty - 1)}
                  >
                    −
                  </button>
                  <div className="flex-1 text-center font-display text-3xl tabular-nums">{qty}</div>
                  <button
                    type="button"
                    className="pressable h-11 w-11 rounded-xl bg-white/5 text-xl"
                    onClick={() => setQty(item.id, qty + 1)}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur-xl p-3 lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:mt-4">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-mute">
            {count} item{count === 1 ? "" : "s"} · {formatInr(total)}
          </p>
          <button
            type="button"
            disabled={pending || lines.length === 0}
            onClick={submit}
            className="pressable rounded-xl bg-gold text-ink font-semibold px-5 py-3 disabled:opacity-40"
          >
            {pending ? "Saving…" : `Add food order · ${formatInr(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
