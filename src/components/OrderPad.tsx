"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createOrderAction, type OrderStockDelta } from "@/actions/orders";
import { StockBadge } from "@/components/StockBadge";
import { cn, formatInr, formatOrderNumber } from "@/lib/format";
import { remainingDisplay, stockLevel } from "@/lib/stock-math";
import type { ProductCard } from "@/lib/data";
import type { PaymentMethod } from "@prisma/client";

type Stats = {
  revenue: number;
  orders: number;
  pegs: number;
  beer: number;
};

type Cart = Record<string, number>;

function pickUnitPrice(product: ProductCard, paymentMethod: PaymentMethod): number | null {
  if (paymentMethod === "COUPON") {
    if (product.couponPrice != null) return product.couponPrice;
    return product.price;
  }
  return product.price;
}

function applyDeltas(products: ProductCard[], deltas: OrderStockDelta[]): ProductCard[] {
  if (deltas.length === 0) return products;
  const byId = new Map(deltas.map((d) => [d.productId, d]));
  return products.map((product) => {
    const delta = byId.get(product.id);
    if (!delta) return product;
    const estimatedVolumeMl =
      product.trackingType === "LIQUOR"
        ? (product.stock.estimatedVolumeMl ?? 0) - (delta.volumeMl ?? 0)
        : product.stock.estimatedVolumeMl;
    const estimatedUnits =
      product.trackingType === "BEER"
        ? (product.stock.estimatedUnits ?? 0) - delta.quantity
        : product.stock.estimatedUnits;
    const display = remainingDisplay({
      trackingType: product.trackingType,
      estimatedVolumeMl: estimatedVolumeMl ?? 0,
      estimatedUnits: estimatedUnits ?? 0,
      bottleSizeMl: product.bottleSizeMl,
      pegSizeMl: product.pegSizeMl,
    });
    return {
      ...product,
      stock: {
        estimatedVolumeMl: estimatedVolumeMl ?? null,
        estimatedUnits: estimatedUnits ?? null,
        remaining: display.remaining,
        remainingLabel: display.remainingLabel,
        secondaryLabel: display.secondaryLabel,
        level: stockLevel(display.remaining, product.lowThreshold, product.veryLowThreshold),
        unit: display.unit,
      },
    };
  });
}

export function OrderPad({
  initialProducts,
  initialStats,
}: {
  initialProducts: ProductCard[];
  initialStats: Stats;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [stats, setStats] = useState(initialStats);
  const [cart, setCart] = useState<Cart>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH_UPI");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());

  useEffect(() => {
    setProducts(initialProducts);
    setStats(initialStats);
  }, [initialProducts, initialStats]);

  function setQty(id: string, next: number) {
    setCart((prev) => {
      const value = Math.max(0, next);
      const copy = { ...prev };
      if (value === 0) delete copy[id];
      else copy[id] = value;
      return copy;
    });
  }

  const lines = useMemo(() => {
    return products
      .filter((p) => cart[p.id] > 0)
      .map((p) => {
        const quantity = cart[p.id];
        const unit = p.trackingType === "LIQUOR" ? "peg" : "unit";
        const unitPrice = pickUnitPrice(p, paymentMethod);
        return {
          product: p,
          quantity,
          unit,
          unitPrice,
          lineTotal: unitPrice == null ? null : quantity * unitPrice,
        };
      });
  }, [products, cart, paymentMethod]);

  const total = lines.reduce((sum, line) => sum + (line.lineTotal ?? 0), 0);
  const unpricedCount = lines.filter((line) => line.unitPrice == null).length;
  const itemCount = lines.reduce((sum, line) => sum + line.quantity, 0);
  const pegsInCart = lines.filter((l) => l.unit === "peg").reduce((s, l) => s + l.quantity, 0);
  const beerInCart = lines.filter((l) => l.unit === "unit").reduce((s, l) => s + l.quantity, 0);
  const payLabel = paymentMethod === "COUPON" ? "Coupon" : "Cash/UPI";

  function submit() {
    if (lines.length === 0 || pending) return;

    const payload = lines.map((line) => ({ productId: line.product.id, quantity: line.quantity }));
    const key = idempotencyKey.current;
    idempotencyKey.current = crypto.randomUUID();
    const snapshotCart = cart;
    const savedTotal = total;
    const savedUnpriced = unpricedCount;
    const savedPegs = pegsInCart;
    const savedBeer = beerInCart;
    const savedMethod = paymentMethod;

    setCart({});
    setCartOpen(false);
    setError(null);
    setStats((s) => ({
      revenue: s.revenue + savedTotal,
      orders: s.orders + 1,
      pegs: s.pegs + savedPegs,
      beer: s.beer + savedBeer,
    }));

    startTransition(async () => {
      try {
        const result = await createOrderAction({
          idempotencyKey: key,
          items: payload,
          paymentMethod: savedMethod,
        });
        if (!result.ok) {
          setStats((s) => ({
            revenue: Math.max(0, s.revenue - savedTotal),
            orders: Math.max(0, s.orders - 1),
            pegs: Math.max(0, s.pegs - savedPegs),
            beer: Math.max(0, s.beer - savedBeer),
          }));
          setCart((current) => (Object.keys(current).length ? current : snapshotCart));
          setError(result.error);
          return;
        }
        const moneyNote =
          savedUnpriced > 0 && savedTotal === 0
            ? "qty recorded"
            : formatInr(result.total ?? savedTotal);
        const methodNote = savedMethod === "COUPON" ? "coupon" : "cash/UPI";
        setFlash(`${formatOrderNumber(result.orderNumber)} saved · ${moneyNote} · ${methodNote}`);
        if (result.deltas?.length) {
          setProducts((prev) => applyDeltas(prev, result.deltas));
        }
        window.setTimeout(() => setFlash(null), 2500);
      } catch {
        setStats((s) => ({
          revenue: Math.max(0, s.revenue - savedTotal),
          orders: Math.max(0, s.orders - 1),
          pegs: Math.max(0, s.pegs - savedPegs),
          beer: Math.max(0, s.beer - savedBeer),
        }));
        setCart((current) => (Object.keys(current).length ? current : snapshotCart));
        setError("ORDER NOT SAVED. Network or server error. Your cart is unchanged.");
      }
    });
  }

  const liquor = products.filter((p) => p.trackingType === "LIQUOR");
  const beer = products.filter((p) => p.trackingType === "BEER");

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-5">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs tracking-[0.35em] text-gold uppercase">Tonight</p>
            <h1 className="font-display text-5xl sm:text-6xl leading-none">DEGENERATE BAR</h1>
          </div>
          <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} />
        </div>

        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
          <MiniStat label="Revenue" value={formatInr(stats.revenue)} />
          <MiniStat label="Orders" value={String(stats.orders)} />
          <MiniStat label="Liquor pegs" value={String(stats.pegs)} />
          <MiniStat label="Beer units" value={String(stats.beer)} />
        </div>

        {flash && (
          <p className="mt-4 rounded-xl bg-emerald-500/15 border border-emerald-400/30 px-4 py-3 text-emerald-200">
            {flash}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-xl bg-red-500/15 border border-red-400/30 px-4 py-3 text-red-200">{error}</p>
        )}

        <Section title="Liquor">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {liquor.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                quantity={cart[product.id] || 0}
                paymentMethod={paymentMethod}
                onChange={setQty}
              />
            ))}
          </div>
        </Section>

        <Section title="Beer">
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {beer.map((product) => (
              <ProductTile
                key={product.id}
                product={product}
                quantity={cart[product.id] || 0}
                paymentMethod={paymentMethod}
                onChange={setQty}
              />
            ))}
          </div>
        </Section>
      </div>

      <aside className="hidden lg:block">
        <CartPanel
          lines={lines}
          total={total}
          pending={pending}
          unpricedCount={unpricedCount}
          payLabel={payLabel}
          paymentMethod={paymentMethod}
          onPaymentChange={setPaymentMethod}
          onChange={setQty}
          onSubmit={submit}
        />
      </aside>

      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 backdrop-blur-xl p-3">
        {cartOpen && (
          <div className="max-h-[50vh] overflow-y-auto mb-3">
            <CartLines lines={lines} onChange={setQty} />
          </div>
        )}
        <PaymentToggle value={paymentMethod} onChange={setPaymentMethod} compact />
        <button
          type="button"
          onClick={() => setCartOpen((v) => !v)}
          className="w-full text-left text-sm text-mute mb-2 mt-2"
        >
          Current order · {itemCount} {itemCount === 1 ? "item" : "items"} · {formatInr(total)} · {payLabel}
        </button>
        <button
          onClick={submit}
          disabled={pending || lines.length === 0}
          className="pressable w-full rounded-xl bg-gold text-ink font-semibold py-3.5 text-lg disabled:opacity-40"
        >
          {pending
            ? "Saving…"
            : unpricedCount > 0 && total === 0
              ? "ADD ORDER · qty only"
              : `ADD ORDER · ${formatInr(total)}`}
        </button>
      </div>
    </div>
  );
}

function PaymentToggle({
  value,
  onChange,
  compact,
}: {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex gap-1 rounded-full bg-white/5 p-1", compact && "w-full")}>
      <button
        type="button"
        onClick={() => onChange("CASH_UPI")}
        className={cn(
          "rounded-full text-xs font-medium px-3 py-1.5",
          compact && "flex-1",
          value === "CASH_UPI" ? "bg-gold text-ink" : "text-mute",
        )}
      >
        Cash / UPI
      </button>
      <button
        type="button"
        onClick={() => onChange("COUPON")}
        className={cn(
          "rounded-full text-xs font-medium px-3 py-1.5",
          compact && "flex-1",
          value === "COUPON" ? "bg-gold text-ink" : "text-mute",
        )}
      >
        Coupon
      </button>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-2xl px-3 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-mute">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-gold-2">{value}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-display text-3xl text-gold">{title}</h2>
        <div className="gold-line flex-1" />
      </div>
      {children}
    </section>
  );
}

function ProductTile({
  product,
  quantity,
  paymentMethod,
  onChange,
}: {
  product: ProductCard;
  quantity: number;
  paymentMethod: PaymentMethod;
  onChange: (id: string, qty: number) => void;
}) {
  const warn = product.stock.level !== "HEALTHY";
  const unit = product.trackingType === "LIQUOR" ? "peg" : "unit";
  const unitPrice = pickUnitPrice(product, paymentMethod);
  const priceHint =
    unitPrice == null
      ? "No price · qty only"
      : paymentMethod === "COUPON"
        ? `${formatInr(unitPrice)} coupon / ${unit}`
        : `${formatInr(unitPrice)} / ${unit}`;

  return (
    <div
      className={cn(
        "panel rounded-2xl p-4",
        quantity > 0 && "border-gold/50",
        product.stock.level === "OUT" || product.stock.level === "EXCEEDED"
          ? "border-red-500/40"
          : product.stock.level === "VERY_LOW" || product.stock.level === "LOW"
            ? "border-amber-400/30"
            : "",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-2xl leading-none">{product.name}</h3>
          <p className="text-sm text-mute mt-1">{priceHint}</p>
          {product.price != null && product.couponPrice != null && (
            <p className="text-[10px] text-mute/80 mt-0.5">
              Cash {formatInr(product.price)} · Coupon {formatInr(product.couponPrice)}
            </p>
          )}
        </div>
        <StockBadge level={product.stock.level} compact />
      </div>
      {warn && (
        <p className="mt-2 text-xs text-amber-200">
          ⚠️ Estimated stock is{" "}
          {product.stock.level === "EXCEEDED" || product.stock.level === "OUT" ? "low/out" : "low"} — orders
          still allowed
        </p>
      )}
      <p className="mt-2 text-xs text-mute">
        est. {product.stock.remainingLabel}
        {product.stock.secondaryLabel ? ` · ${product.stock.secondaryLabel}` : ""}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          className="pressable h-12 w-12 rounded-xl bg-white/5 text-2xl"
          onClick={() => onChange(product.id, quantity - 1)}
        >
          −
        </button>
        <div className="flex-1 text-center font-display text-3xl tabular-nums">{quantity}</div>
        <button
          type="button"
          className="pressable h-12 w-12 rounded-xl bg-white/5 text-2xl"
          onClick={() => onChange(product.id, quantity + 1)}
        >
          +
        </button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          className="pressable rounded-lg bg-gold/15 py-2 text-sm text-gold"
          onClick={() => onChange(product.id, quantity + 1)}
        >
          +1
        </button>
        <button
          type="button"
          className="pressable rounded-lg bg-gold/15 py-2 text-sm text-gold"
          onClick={() => onChange(product.id, quantity + 5)}
        >
          +5
        </button>
      </div>
    </div>
  );
}

function CartLines({
  lines,
  onChange,
}: {
  lines: Array<{
    product: ProductCard;
    quantity: number;
    unit: string;
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
  onChange: (id: string, qty: number) => void;
}) {
  if (lines.length === 0) {
    return <p className="text-sm text-mute">Tap products to build the order.</p>;
  }
  return (
    <ul className="space-y-3">
      {lines.map((line) => (
        <li key={line.product.id} className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">
              {line.product.name} × {line.quantity}
            </p>
            <p className="text-xs text-mute">
              {line.unitPrice == null
                ? "qty only · no price"
                : `${formatInr(line.unitPrice)} / ${line.unit === "peg" ? "peg" : "unit"}`}
            </p>
          </div>
          <div className="text-right">
            <p className="tabular-nums">{line.lineTotal == null ? "qty" : formatInr(line.lineTotal)}</p>
            <div className="flex gap-1 justify-end mt-1">
              <button className="h-7 w-7 rounded bg-white/5" onClick={() => onChange(line.product.id, line.quantity - 1)}>
                −
              </button>
              <button className="h-7 w-7 rounded bg-white/5" onClick={() => onChange(line.product.id, line.quantity + 1)}>
                +
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CartPanel({
  lines,
  total,
  pending,
  unpricedCount,
  payLabel,
  paymentMethod,
  onPaymentChange,
  onChange,
  onSubmit,
}: {
  lines: Array<{
    product: ProductCard;
    quantity: number;
    unit: string;
    unitPrice: number | null;
    lineTotal: number | null;
  }>;
  total: number;
  pending: boolean;
  unpricedCount: number;
  payLabel: string;
  paymentMethod: PaymentMethod;
  onPaymentChange: (v: PaymentMethod) => void;
  onChange: (id: string, qty: number) => void;
  onSubmit: () => void;
}) {
  return (
    <div className="panel rounded-3xl p-5 sticky top-24">
      <p className="text-xs tracking-[0.3em] uppercase text-mute">Current order</p>
      <div className="mt-3">
        <PaymentToggle value={paymentMethod} onChange={onPaymentChange} compact />
      </div>
      <div className="mt-4 min-h-40">
        <CartLines lines={lines} onChange={onChange} />
      </div>
      <div className="gold-line my-4" />
      <div className="flex items-end justify-between">
        <span className="text-mute text-sm">
          {unpricedCount > 0 && total === 0 ? "Qty only" : `Total · ${payLabel}`}
        </span>
        <span className="font-display text-4xl text-gold">{formatInr(total)}</span>
      </div>
      <button
        onClick={onSubmit}
        disabled={pending || lines.length === 0}
        className="pressable mt-5 w-full rounded-xl bg-gold text-ink font-semibold py-4 text-lg disabled:opacity-40"
      >
        {pending
          ? "Saving…"
          : unpricedCount > 0 && total === 0
            ? "ADD ORDER · qty only"
            : "ADD ORDER"}
      </button>
    </div>
  );
}
