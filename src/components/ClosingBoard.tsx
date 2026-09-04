"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveClosingAction } from "@/actions/closing";
import { formatDateTime, formatInr } from "@/lib/format";
import type { ProductCard } from "@/lib/data";

type Report = {
  id: string;
  createdAt: string;
  createdByName: string | null;
  notes: string | null;
  lines: {
    productName: string;
    estimatedStock: number;
    physicalStock: number;
    variance: number;
    unit: string;
  }[];
};

type SaleRow = ProductCard & { qtySold: number };

export function ClosingBoard({
  products,
  sales,
  stats,
  reports,
}: {
  products: ProductCard[];
  sales: SaleRow[];
  stats: { revenue: number; orders: number; average: number; pegs: number; beer: number };
  reports: Report[];
}) {
  const router = useRouter();
  const [physical, setPhysical] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const rows = useMemo(
    () =>
      products.map((product) => {
        const entered = physical[product.id];
        const physicalValue = entered === undefined || entered === "" ? null : Number(entered);
        const variance =
          physicalValue == null || !Number.isFinite(physicalValue) ? null : physicalValue - product.stock.remaining;
        return { product, physicalValue, variance };
      }),
    [products, physical],
  );

  function save() {
    const lines = rows
      .filter((row) => row.physicalValue != null && Number.isFinite(row.physicalValue))
      .map((row) => ({ productId: row.product.id, physicalStock: row.physicalValue as number }));
    setError(null);
    startTransition(async () => {
      const result = await saveClosingAction({ notes, lines });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setFlash("Closing snapshot saved. Estimates were not overwritten.");
      router.refresh();
    });
  }

  const liquorSales = sales.filter((p) => p.trackingType === "LIQUOR");
  const beerSales = sales.filter((p) => p.trackingType === "BEER");

  return (
    <div>
      <p className="text-xs tracking-[0.35em] text-gold uppercase">End of night</p>
      <h1 className="font-display text-5xl sm:text-6xl leading-none">DEGENERATE — Bar Closing Report</h1>

      <div className="mt-6 grid sm:grid-cols-3 gap-3">
        <div className="panel rounded-3xl p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-mute">Total revenue</p>
          <p className="font-display text-5xl text-gold">{formatInr(stats.revenue)}</p>
        </div>
        <div className="panel rounded-3xl p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-mute">Total orders</p>
          <p className="font-display text-5xl text-gold">{stats.orders}</p>
        </div>
        <div className="panel rounded-3xl p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-mute">Average order</p>
          <p className="font-display text-5xl text-gold">{formatInr(stats.average, 2)}</p>
        </div>
      </div>

      <section className="mt-8 grid md:grid-cols-2 gap-5">
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-3xl text-gold">Liquor sales</h2>
          <ul className="mt-3 space-y-2">
            {liquorSales.map((product) => (
              <li key={product.id} className="flex justify-between text-sm">
                <span>{product.name}</span>
                <span className="tabular-nums">{product.qtySold} pegs</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel rounded-3xl p-5">
          <h2 className="font-display text-3xl text-gold">Beer sales</h2>
          <ul className="mt-3 space-y-2">
            {beerSales.map((product) => (
              <li key={product.id} className="flex justify-between text-sm">
                <span>{product.name}</span>
                <span className="tabular-nums">{product.qtySold} units</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-8 panel rounded-3xl p-5">
        <h2 className="font-display text-3xl text-gold">Stock reconciliation</h2>
        <p className="text-sm text-mute mt-1">
          Enter the physical count. This snapshot is stored separately from the live estimate.
        </p>
        {error && <p className="mt-3 text-sm text-red-200">{error}</p>}
        {flash && <p className="mt-3 text-sm text-emerald-200">{flash}</p>}
        <div className="overflow-x-auto mt-4 max-w-full">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-mute text-left">
              <tr>
                <th className="pb-2 font-normal">Product</th>
                <th className="pb-2 font-normal text-right">System estimate</th>
                <th className="pb-2 font-normal text-right">Physical count</th>
                <th className="pb-2 font-normal text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.product.id} className="border-t border-white/5">
                  <td className="py-2">{row.product.name}</td>
                  <td className="py-2 text-right tabular-nums">
                    {row.product.stock.remaining.toFixed(2)} {row.product.stock.unit}
                  </td>
                  <td className="py-2 text-right">
                    <input
                      type="number"
                      step="0.01"
                      value={physical[row.product.id] ?? ""}
                      onChange={(e) => setPhysical((p) => ({ ...p, [row.product.id]: e.target.value }))}
                      className="w-28 rounded-lg bg-black/40 border border-white/10 px-2 py-1 text-right"
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {row.variance == null ? "—" : `${row.variance > 0 ? "+" : ""}${row.variance.toFixed(2)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Closing notes"
          className="mt-4 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 text-sm min-h-20"
        />
        <button onClick={save} disabled={pending} className="pressable mt-4 rounded-xl bg-gold text-ink font-semibold px-5 py-3">
          {pending ? "Saving…" : "Save closing snapshot"}
        </button>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-3xl text-gold">Previous snapshots</h2>
        {reports.length === 0 ? (
          <p className="text-sm text-mute mt-2">None yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reports.map((report) => (
              <li key={report.id} className="panel rounded-2xl p-4">
                <p className="text-sm">
                  {formatDateTime(report.createdAt)} · {report.createdByName}
                </p>
                {report.notes && <p className="text-sm text-mute mt-1">{report.notes}</p>}
                <ul className="mt-3 grid sm:grid-cols-2 gap-1 text-sm">
                  {report.lines.map((line) => (
                    <li key={line.productName} className="flex justify-between gap-3">
                      <span>{line.productName}</span>
                      <span className="text-mute tabular-nums">
                        est {line.estimatedStock.toFixed(2)} / phys {line.physicalStock.toFixed(2)} / Δ{" "}
                        {line.variance.toFixed(2)} {line.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
