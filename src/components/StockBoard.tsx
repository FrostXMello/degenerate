"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { adjustStockAction } from "@/actions/stock";
import { StockBadge } from "@/components/StockBadge";
import { ADD_REASONS, REMOVE_REASONS } from "@/lib/stock-math";
import { formatDateTime } from "@/lib/format";
import type { ProductCard } from "@/lib/data";

type Adjustment = {
  id: string;
  productName: string;
  type: "ADD" | "REMOVE";
  quantity: number;
  unit: string;
  reason: string;
  note: string | null;
  createdAt: string;
  createdByName: string | null;
};

export function StockBoard({
  products,
  adjustments,
}: {
  products: ProductCard[];
  adjustments: Adjustment[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ProductCard | null>(null);
  const [mode, setMode] = useState<"ADD" | "REMOVE">("ADD");
  const [qty, setQty] = useState("1");
  const [reason, setReason] = useState<string>(ADD_REASONS[0]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reasons = mode === "ADD" ? ADD_REASONS : REMOVE_REASONS;
  const liquor = products.filter((p) => p.trackingType === "LIQUOR");
  const beer = products.filter((p) => p.trackingType === "BEER");

  function open(product: ProductCard, nextMode: "ADD" | "REMOVE") {
    setSelected(product);
    setMode(nextMode);
    setQty("1");
    setReason(nextMode === "ADD" ? ADD_REASONS[0] : REMOVE_REASONS[0]);
    setNote("");
    setError(null);
  }

  function submit() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const result = await adjustStockAction({
        productId: selected.id,
        type: mode,
        quantity: Number(qty),
        reason: reason === "Other" ? note.trim() || "Other" : reason,
        note: reason === "Other" ? note : note || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelected(null);
      router.refresh();
    });
  }

  const unitLabel = selected?.trackingType === "LIQUOR" ? "bottles" : "units";

  return (
    <div>
      <p className="text-xs tracking-[0.35em] text-gold uppercase">Estimate</p>
      <h1 className="font-display text-5xl leading-none">Stock</h1>
      <p className="text-sm text-mute mt-2 max-w-2xl">
        This is a reminder, not a lock. If the bar has more bottles than the system thinks, add a refill and keep taking orders.
      </p>

      <Section title="Liquor">
        <div className="grid md:grid-cols-2 gap-3">
          {liquor.map((product) => (
            <StockCard key={product.id} product={product} onAdd={() => open(product, "ADD")} onRemove={() => open(product, "REMOVE")} />
          ))}
        </div>
      </Section>

      <Section title="Beer">
        <div className="grid md:grid-cols-2 gap-3">
          {beer.map((product) => (
            <StockCard key={product.id} product={product} onAdd={() => open(product, "ADD")} onRemove={() => open(product, "REMOVE")} />
          ))}
        </div>
      </Section>

      <Section title="Adjustment history">
        {adjustments.length === 0 ? (
          <p className="text-sm text-mute">No refill or removal records yet.</p>
        ) : (
          <ul className="space-y-2">
            {adjustments.map((row) => (
              <li key={row.id} className="panel rounded-2xl px-4 py-3 flex flex-wrap justify-between gap-2 text-sm">
                <div>
                  <span className="text-mute">{formatDateTime(row.createdAt)}</span>
                  <span className="mx-2">{row.productName}</span>
                  <span className={row.type === "ADD" ? "text-emerald-300" : "text-red-300"}>
                    {row.type === "ADD" ? "+" : "−"}
                    {row.quantity} {row.unit}
                  </span>
                  <span className="text-mute"> · {row.reason}</span>
                </div>
                <span className="text-mute">{row.createdByName}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/70 p-4">
          <div className="panel rounded-3xl p-5 w-full max-w-md">
            <p className="text-xs uppercase tracking-[0.3em] text-mute">{mode === "ADD" ? "Add stock" : "Remove stock"}</p>
            <h2 className="font-display text-4xl mt-1">{selected.name}</h2>
            <p className="text-sm text-mute mt-1">
              Estimated now: {selected.stock.remainingLabel}
              {selected.stock.secondaryLabel ? ` · ~ ${selected.stock.secondaryLabel}` : ""}
            </p>
            {error && <p className="mt-3 text-sm text-red-200">{error}</p>}
            <label className="block mt-4">
              <span className="text-xs uppercase tracking-[0.2em] text-mute">Quantity ({unitLabel})</span>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-lg"
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-2">
              {reasons.map((item) => (
                <button
                  key={item}
                  onClick={() => setReason(item)}
                  className={`rounded-full px-3 py-1 text-xs ${reason === item ? "bg-gold text-ink" : "bg-white/5 text-mute"}`}
                >
                  {item}
                </button>
              ))}
            </div>
            {(reason === "Other" || note) && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note"
                className="mt-3 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm"
              />
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setSelected(null)} className="rounded-xl bg-white/5 py-3">
                Cancel
              </button>
              <button onClick={submit} disabled={pending} className="rounded-xl bg-gold text-ink font-semibold py-3">
                {pending ? "Saving…" : mode === "ADD" ? "ADD STOCK" : "REMOVE STOCK"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function StockCard({
  product,
  onAdd,
  onRemove,
}: {
  product: ProductCard;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const extra = useMemo(() => {
    if (product.trackingType !== "LIQUOR") return null;
    return `~ ${product.stock.secondaryLabel} remaining`;
  }, [product]);

  return (
    <div className="panel rounded-2xl p-4">
      <div className="flex justify-between gap-3">
        <div>
          <h3 className="font-display text-3xl leading-none">{product.name}</h3>
          <p className="text-sm text-mute mt-1">
            Initial: {product.trackingType === "LIQUOR" ? `${product.initialBottles} bottles` : `${product.initialUnits} units`}
          </p>
        </div>
        <StockBadge level={product.stock.level} />
      </div>
      <p className="mt-4 font-display text-4xl text-gold">{product.stock.remainingLabel}</p>
      {extra && <p className="text-sm text-mute">{extra}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={onAdd} className="pressable rounded-xl bg-gold text-ink font-semibold py-3">
          + ADD STOCK
        </button>
        <button onClick={onRemove} className="pressable rounded-xl bg-white/5 py-3">
          Remove
        </button>
      </div>
    </div>
  );
}
