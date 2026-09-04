"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  clearPriceAction,
  createProductAction,
  setPriceAction,
  updateProductAction,
} from "@/actions/products";
import type { ProductCard } from "@/lib/data";
import type { TrackingType } from "@prisma/client";

export function ProductsAdmin({ products }: { products: ProductCard[] }) {
  return (
    <div>
      <p className="text-xs tracking-[0.35em] text-gold uppercase">Catalog</p>
      <h1 className="font-display text-5xl leading-none">Products & Pricing</h1>
      <p className="text-sm text-mute mt-2 max-w-2xl">
        Add any drink that shows up at the bar. Prices are optional — you can still record quantities tonight and set money later.
      </p>

      <AddDrinkForm />

      <div className="mt-6 space-y-3">
        {products.map((product) => (
          <ProductRow key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}

function AddDrinkForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [trackingType, setTrackingType] = useState<TrackingType>("LIQUOR");
  const [opening, setOpening] = useState("0");
  const [sizeMl, setSizeMl] = useState("750");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const priceValue = price.trim() === "" ? null : Number(price);
      const result = await createProductAction({
        name,
        trackingType,
        bottleSizeMl: trackingType === "LIQUOR" ? Number(sizeMl) || 750 : null,
        sizeMl: trackingType === "BEER" ? (sizeMl.trim() === "" ? null : Number(sizeMl)) : Number(sizeMl) || 750,
        initialBottles: trackingType === "LIQUOR" ? Number(opening) || 0 : undefined,
        initialUnits: trackingType === "BEER" ? Number(opening) || 0 : undefined,
        price: priceValue != null && Number.isFinite(priceValue) ? Math.round(priceValue) : null,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setName("");
      setOpening("0");
      setPrice("");
      setMessage("Drink added — it is now on New Order and Stock.");
      router.refresh();
    });
  }

  return (
    <section className="panel rounded-3xl p-5 mt-6">
      <h2 className="font-display text-3xl text-gold">Add drink</h2>
      <p className="text-xs text-mute mt-1">Liquor is sold in 30 ml pegs. Beer / other drinks are sold by unit.</p>
      {message && <p className="mt-3 text-sm text-gold">{message}</p>}
      <div className="mt-4 grid md:grid-cols-2 gap-3">
        <label className="block md:col-span-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Drink name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Black Dog, Corona, Red Bull"
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-lg"
          />
        </label>
        <div>
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Type</span>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setTrackingType("LIQUOR");
                setSizeMl("750");
              }}
              className={`flex-1 rounded-xl py-3 text-sm ${trackingType === "LIQUOR" ? "bg-gold text-ink font-semibold" : "bg-white/5 text-mute"}`}
            >
              Liquor (pegs)
            </button>
            <button
              type="button"
              onClick={() => {
                setTrackingType("BEER");
                setSizeMl("");
              }}
              className={`flex-1 rounded-xl py-3 text-sm ${trackingType === "BEER" ? "bg-gold text-ink font-semibold" : "bg-white/5 text-mute"}`}
            >
              Beer / unit
            </button>
          </div>
        </div>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">
            Opening stock ({trackingType === "LIQUOR" ? "bottles" : "units"})
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-3"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">
            {trackingType === "LIQUOR" ? "Bottle ml" : "Can / bottle ml (optional)"}
          </span>
          <input
            type="number"
            min="1"
            value={sizeMl}
            onChange={(e) => setSizeMl(e.target.value)}
            placeholder={trackingType === "LIQUOR" ? "750" : "Optional"}
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-3"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">
            Price ₹ (optional)
          </span>
          <input
            type="number"
            min="0"
            step="1"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Leave blank to track qty only"
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-3"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={pending || !name.trim()}
        className="pressable mt-4 rounded-xl bg-gold text-ink font-semibold px-5 py-3 disabled:opacity-40"
      >
        {pending ? "Adding…" : "Add drink"}
      </button>
    </section>
  );
}

function ProductRow({ product }: { product: ProductCard }) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [price, setPrice] = useState(product.price == null ? "" : String(product.price));
  const [bottle, setBottle] = useState(String(product.bottleSizeMl || product.sizeMl || ""));
  const [low, setLow] = useState(String(product.lowThreshold));
  const [veryLow, setVeryLow] = useState(String(product.veryLowThreshold));
  const [active, setActive] = useState(product.active);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unit = product.trackingType === "LIQUOR" ? "30 ml peg" : "unit";

  function savePrice() {
    startTransition(async () => {
      if (price.trim() === "") {
        const result = await clearPriceAction(product.id);
        setMessage(result.ok ? "Price cleared — qty-only orders allowed" : result.error);
        if (result.ok) router.refresh();
        return;
      }
      const value = Number(price);
      const result = await setPriceAction(product.id, value);
      setMessage(result.ok ? "Price saved" : result.error);
      if (result.ok) router.refresh();
    });
  }

  function saveMeta() {
    startTransition(async () => {
      const size = bottle === "" ? null : Number(bottle);
      const result = await updateProductAction({
        productId: product.id,
        name,
        bottleSizeMl: product.trackingType === "LIQUOR" ? size : null,
        sizeMl: size,
        lowThreshold: Number(low),
        veryLowThreshold: Number(veryLow),
        active,
      });
      setMessage(result.ok ? "Product updated" : result.error);
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className={`panel rounded-2xl p-4 ${active ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap justify-between gap-3">
        <div className="flex-1 min-w-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-display text-3xl leading-none w-full bg-transparent border-b border-transparent focus:border-gold outline-none"
          />
          <p className="text-xs text-mute mt-1">
            {product.fullName && product.fullName !== product.name ? `${product.fullName} · ` : ""}
            {unit}
            {!active ? " · hidden from order pad" : ""}
          </p>
        </div>
        {message && <p className="text-xs text-gold">{message}</p>}
      </div>
      <div className="mt-4 grid md:grid-cols-5 gap-3 items-end">
        <label className="block md:col-span-2">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Price (₹ / {unit})</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              min="0"
              step="1"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Qty only if blank"
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
            />
            <button onClick={savePrice} disabled={pending} className="rounded-xl bg-gold text-ink px-3 font-semibold">
              Save
            </button>
          </div>
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">
            {product.trackingType === "LIQUOR" ? "Bottle ml" : "Can/bottle ml"}
          </span>
          <input
            type="number"
            min="1"
            value={bottle}
            onChange={(e) => setBottle(e.target.value)}
            placeholder="Configurable"
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Low at</span>
          <input
            type="number"
            value={low}
            onChange={(e) => setLow(e.target.value)}
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Very low / active</span>
          <div className="mt-1 flex gap-2">
            <input
              type="number"
              value={veryLow}
              onChange={(e) => setVeryLow(e.target.value)}
              className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2"
            />
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              className={`rounded-xl px-3 text-xs ${active ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-mute"}`}
            >
              {active ? "On" : "Off"}
            </button>
            <button onClick={saveMeta} disabled={pending} className="rounded-xl bg-white/10 px-3">
              Update
            </button>
          </div>
        </label>
      </div>
    </div>
  );
}
