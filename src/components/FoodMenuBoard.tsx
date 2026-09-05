"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  addFoodItemAction,
  removeFoodItemAction,
  updateFoodItemAction,
} from "@/actions/food";
import { formatInr } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";

type MenuItem = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  sortOrder: number;
};

export function FoodMenuBoard({
  user,
  initialItems,
}: {
  user: SessionUser;
  initialItems: MenuItem[];
}) {
  const [items, setItems] = useState(initialItems);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  const canAdd = user.role === "ADMIN" || user.canAddFoodItems;
  const canRemove = user.role === "ADMIN" || user.canRemoveFoodItems;
  const canPrice = user.role === "ADMIN" || user.canChangeFoodPrices;

  function add() {
    startTransition(async () => {
      const result = await addFoodItemAction({
        name,
        price: Math.round(Number(price)),
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setItems((prev) => [...prev, result.item]);
      setName("");
      setPrice("");
      setMessage(`Added ${result.item.name}`);
    });
  }

  function savePrice(item: MenuItem, nextPrice: string) {
    startTransition(async () => {
      const value = Math.round(Number(nextPrice));
      const result = await updateFoodItemAction({ id: item.id, price: value });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? result.item : i)));
      setMessage(`Price updated · ${item.name}`);
    });
  }

  function saveName(item: MenuItem, nextName: string) {
    startTransition(async () => {
      const result = await updateFoodItemAction({ id: item.id, name: nextName });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? result.item : i)));
      setMessage(`Renamed · ${result.item.name}`);
    });
  }

  function remove(item: MenuItem) {
    if (!window.confirm(`Remove ${item.name} from the menu?`)) return;
    startTransition(async () => {
      const result = await removeFoodItemAction(item.id);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, active: false } : i)));
      setMessage(`Removed ${item.name}`);
    });
  }

  function restore(item: MenuItem) {
    startTransition(async () => {
      const result = await updateFoodItemAction({ id: item.id, active: true });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? result.item : i)));
      setMessage(`Restored ${item.name}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold">Food</p>
          <h1 className="font-display text-4xl leading-none">Menu</h1>
          <p className="text-sm text-mute mt-1">Names & prices — admin can lock who may edit</p>
        </div>
        <Link href="/food" className="text-sm text-mute hover:text-cream">
          ← Orders
        </Link>
      </div>

      {message && <p className="text-sm text-gold">{message}</p>}

      {canAdd && (
        <section className="panel rounded-2xl p-4 space-y-3">
          <h2 className="font-display text-2xl text-gold">Add dish</h2>
          <div className="grid sm:grid-cols-[1fr_140px_auto] gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Dish name"
              className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
            />
            <input
              type="number"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="Price ₹"
              className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
            />
            <button
              type="button"
              disabled={pending || !name.trim() || price.trim() === ""}
              onClick={add}
              className="rounded-xl bg-gold text-ink font-semibold px-4 py-2.5 disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </section>
      )}

      <ul className="space-y-2">
        {items.map((item) => (
          <MenuRow
            key={item.id}
            item={item}
            canPrice={canPrice}
            canRemove={canRemove}
            canAdd={canAdd}
            pending={pending}
            onSaveName={saveName}
            onSavePrice={savePrice}
            onRemove={remove}
            onRestore={restore}
          />
        ))}
        {items.length === 0 && <li className="text-sm text-mute py-8 text-center">No dishes yet.</li>}
      </ul>
    </div>
  );
}

function MenuRow({
  item,
  canPrice,
  canRemove,
  canAdd,
  pending,
  onSaveName,
  onSavePrice,
  onRemove,
  onRestore,
}: {
  item: MenuItem;
  canPrice: boolean;
  canRemove: boolean;
  canAdd: boolean;
  pending: boolean;
  onSaveName: (item: MenuItem, name: string) => void;
  onSavePrice: (item: MenuItem, price: string) => void;
  onRemove: (item: MenuItem) => void;
  onRestore: (item: MenuItem) => void;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(String(item.price));

  useEffect(() => {
    setName(item.name);
    setPrice(String(item.price));
  }, [item.name, item.price]);

  return (
    <li className={`panel rounded-2xl p-4 ${item.active ? "" : "opacity-50"}`}>
      <div className="grid sm:grid-cols-[1fr_120px_auto] gap-2 items-end">
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!canAdd || !item.active}
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 disabled:opacity-60"
          />
        </label>
        <label className="block">
          <span className="text-[10px] uppercase tracking-[0.2em] text-mute">Price</span>
          <input
            type="number"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!canPrice || !item.active}
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 disabled:opacity-60"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {item.active && canAdd && name !== item.name && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onSaveName(item, name)}
              className="rounded-xl bg-white/10 px-3 py-2 text-xs"
            >
              Save name
            </button>
          )}
          {item.active && canPrice && Number(price) !== item.price && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onSavePrice(item, price)}
              className="rounded-xl bg-gold text-ink font-semibold px-3 py-2 text-xs"
            >
              Save price
            </button>
          )}
          {item.active && canRemove && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onRemove(item)}
              className="rounded-xl border border-red-400/30 text-red-200 px-3 py-2 text-xs"
            >
              Remove
            </button>
          )}
          {!item.active && canRemove && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onRestore(item)}
              className="rounded-xl border border-emerald-400/30 text-emerald-200 px-3 py-2 text-xs"
            >
              Restore
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-mute mt-2">
        {formatInr(item.price)}
        {!item.active ? " · inactive" : ""}
      </p>
    </li>
  );
}
