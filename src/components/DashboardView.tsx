"use client";

import { useMemo, useState } from "react";
import { StockBadge } from "@/components/StockBadge";
import { formatInr } from "@/lib/format";
import type { ProductCard } from "@/lib/data";
import type { StockLevel } from "@/lib/stock-math";

type Seller = {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  revenue: number;
};

type StatRow = ProductCard & {
  qtySold: number;
  revenue: number;
  mlConsumed: number;
  bottlesConsumed: number | null;
  orderCount: number;
  stockAdded: number;
  stockRemoved: number;
};

export function DashboardView({
  stats,
  sellers,
  products,
  productStats,
}: {
  stats: { revenue: number; orders: number; average: number; pegs: number; beer: number };
  sellers: Seller[];
  products: ProductCard[];
  productStats: StatRow[];
}) {
  const [sort, setSort] = useState<"quantity" | "revenue">("quantity");
  const ranked = useMemo(() => {
    return [...sellers].sort((a, b) => (sort === "revenue" ? b.revenue - a.revenue : b.quantity - a.quantity));
  }, [sellers, sort]);

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs tracking-[0.35em] text-gold uppercase">House view</p>
        <h1 className="font-display text-5xl sm:text-6xl leading-none">Dashboard</h1>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <HeroStat label="Total revenue" value={formatInr(stats.revenue)} wide />
        <HeroStat label="Orders" value={String(stats.orders)} />
        <HeroStat label="Average order" value={formatInr(stats.average, 2)} />
        <HeroStat label="Liquor pegs" value={String(stats.pegs)} />
        <HeroStat label="Beer units" value={String(stats.beer)} />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <section className="panel rounded-3xl p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-3xl text-gold">Top sellers</h2>
            <div className="flex rounded-full bg-white/5 p-1 text-xs">
              <button
                className={sort === "quantity" ? "bg-gold text-ink rounded-full px-3 py-1" : "px-3 py-1 text-mute"}
                onClick={() => setSort("quantity")}
              >
                Quantity
              </button>
              <button
                className={sort === "revenue" ? "bg-gold text-ink rounded-full px-3 py-1" : "px-3 py-1 text-mute"}
                onClick={() => setSort("revenue")}
              >
                Revenue
              </button>
            </div>
          </div>
          {ranked.length === 0 ? (
            <p className="text-mute text-sm mt-6">No completed orders yet.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {ranked.slice(0, 8).map((row, i) => (
                <li key={row.productId} className="flex items-center justify-between gap-3">
                  <span className="text-mute w-6">{i + 1}.</span>
                  <span className="flex-1">
                    {row.name}
                    <span className="text-mute">
                      {" "}
                      — {row.quantity} {row.unit === "peg" ? "pegs" : "units"}
                    </span>
                  </span>
                  <span className="tabular-nums text-gold">{formatInr(row.revenue)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="panel rounded-3xl p-5">
          <h2 className="font-display text-3xl text-gold">Stock overview</h2>
          <p className="text-xs text-mute mt-1">Estimate only. Never blocks orders.</p>
          <div className="mt-4 overflow-x-auto max-w-full">
            <table className="w-full text-sm">
              <thead className="text-mute text-left">
                <tr>
                  <th className="pb-2 font-normal">Product</th>
                  <th className="pb-2 font-normal text-right">Estimated remaining</th>
                  <th className="pb-2 font-normal text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-t border-white/5">
                    <td className="py-2">{p.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {p.stock.remainingLabel}
                      {p.stock.secondaryLabel ? (
                        <span className="block text-xs text-mute">~ {p.stock.secondaryLabel}</span>
                      ) : null}
                    </td>
                    <td className="py-2 text-right">
                      <StockBadge level={p.stock.level as StockLevel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel rounded-3xl p-5 overflow-x-auto max-w-full">
        <h2 className="font-display text-3xl text-gold">Product statistics</h2>
        <table className="w-full text-sm mt-4 min-w-[720px]">
          <thead className="text-mute text-left">
            <tr>
              <th className="pb-2 font-normal">Product</th>
              <th className="pb-2 font-normal text-right">Initial</th>
              <th className="pb-2 font-normal text-right">Added</th>
              <th className="pb-2 font-normal text-right">Removed</th>
              <th className="pb-2 font-normal text-right">Sold</th>
              <th className="pb-2 font-normal text-right">Revenue</th>
              <th className="pb-2 font-normal text-right">Orders</th>
              <th className="pb-2 font-normal text-right">Remaining</th>
            </tr>
          </thead>
          <tbody>
            {productStats.map((p) => (
              <tr key={p.id} className="border-t border-white/5">
                <td className="py-2">
                  {p.name}
                  {p.trackingType === "LIQUOR" && p.bottlesConsumed != null ? (
                    <span className="block text-xs text-mute">
                      {p.qtySold} pegs · {Math.round(p.mlConsumed)} ml · {p.bottlesConsumed.toFixed(2)} bottles used
                    </span>
                  ) : (
                    <span className="block text-xs text-mute">{p.qtySold} units</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {p.trackingType === "LIQUOR" ? `${p.initialBottles ?? 0} btls` : `${p.initialUnits ?? 0}`}
                </td>
                <td className="py-2 text-right tabular-nums">{p.stockAdded}</td>
                <td className="py-2 text-right tabular-nums">{p.stockRemoved}</td>
                <td className="py-2 text-right tabular-nums">{p.qtySold}</td>
                <td className="py-2 text-right tabular-nums">{formatInr(p.revenue)}</td>
                <td className="py-2 text-right tabular-nums">{p.orderCount}</td>
                <td className="py-2 text-right tabular-nums">{p.stock.remainingLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function HeroStat({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`panel rounded-3xl p-4 ${wide ? "sm:col-span-2 lg:col-span-1" : ""}`}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-mute">{label}</p>
      <p className="font-display text-4xl text-gold mt-1 leading-none">{value}</p>
    </div>
  );
}
