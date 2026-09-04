"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addPassAction,
  checkInPassAction,
  removePassAction,
  undoCheckInAction,
} from "@/actions/gate";
import { cn, formatDateTime } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";
import Link from "next/link";

export type GatePassRow = {
  id: string;
  passId: string;
  name: string;
  phone: string;
  note: string | null;
  checkedInAt: string | null;
  checkedInByName: string | null;
  createdByName: string | null;
};

export function GateDesk({
  user,
  initialPasses,
  initialStats,
}: {
  user: SessionUser;
  initialPasses: GatePassRow[];
  initialStats: { total: number; checkedIn: number; notCheckedIn: number };
}) {
  const [passes, setPasses] = useState(initialPasses);
  const [stats, setStats] = useState(initialStats);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "in" | "out">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"ok" | "warn" | "err">("ok");
  const [pending, startTransition] = useTransition();

  const canAdd = user.role === "ADMIN" || user.canAddGateEntries;
  const canRemove = user.role === "ADMIN" || user.canRemoveGateEntries;
  const isAdmin = user.role === "ADMIN";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return passes.filter((p) => {
      if (filter === "in" && !p.checkedInAt) return false;
      if (filter === "out" && p.checkedInAt) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.passId.toLowerCase().includes(q)
      );
    });
  }, [passes, query, filter]);

  function flash(text: string, kind: "ok" | "warn" | "err" = "ok") {
    setMessage(text);
    setMessageKind(kind);
  }

  function checkIn(pass: GatePassRow) {
    startTransition(async () => {
      const result = await checkInPassAction(pass.id);
      if (result.ok) {
        const at = result.checkedInAt!;
        setPasses((prev) =>
          prev.map((p) =>
            p.id === pass.id
              ? { ...p, checkedInAt: at, checkedInByName: user.name }
              : p,
          ),
        );
        setStats((s) => ({
          ...s,
          checkedIn: s.checkedIn + 1,
          notCheckedIn: Math.max(0, s.notCheckedIn - 1),
        }));
        flash(`✓ CHECKED IN · ${pass.name} · ${formatDateTime(at)}`, "ok");
        return;
      }
      if ("already" in result && result.already) {
        setPasses((prev) =>
          prev.map((p) =>
            p.id === pass.id
              ? { ...p, checkedInAt: result.checkedInAt ?? p.checkedInAt }
              : p,
          ),
        );
        flash(
          `⚠️ ALREADY CHECKED IN${result.checkedInAt ? ` · ${formatDateTime(result.checkedInAt)}` : ""}`,
          "warn",
        );
        return;
      }
      flash(result.error, "err");
    });
  }

  function undo(pass: GatePassRow) {
    startTransition(async () => {
      const result = await undoCheckInAction(pass.id);
      if (!result.ok) {
        flash(result.error, "err");
        return;
      }
      setPasses((prev) =>
        prev.map((p) => (p.id === pass.id ? { ...p, checkedInAt: null, checkedInByName: null } : p)),
      );
      setStats((s) => ({
        ...s,
        checkedIn: Math.max(0, s.checkedIn - 1),
        notCheckedIn: s.notCheckedIn + 1,
      }));
      flash(`Check-in reversed for ${pass.name}`, "ok");
    });
  }

  function remove(pass: GatePassRow) {
    if (!window.confirm(`Remove pass ${pass.passId} · ${pass.name}?`)) return;
    startTransition(async () => {
      const result = await removePassAction(pass.id);
      if (!result.ok) {
        flash(result.error, "err");
        return;
      }
      setPasses((prev) => prev.filter((p) => p.id !== pass.id));
      setStats((s) => ({
        total: Math.max(0, s.total - 1),
        checkedIn: pass.checkedInAt ? Math.max(0, s.checkedIn - 1) : s.checkedIn,
        notCheckedIn: pass.checkedInAt ? s.notCheckedIn : Math.max(0, s.notCheckedIn - 1),
      }));
      flash(`Removed ${pass.passId}`, "ok");
    });
  }

  return (
    <div className="space-y-3 pb-24 sm:pb-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold">Offline passes</p>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Gate Entry</h1>
        </div>
        {isAdmin && (
          <Link href="/gate/staff" className="rounded-full border border-gold/40 text-gold px-3 py-1.5 text-xs">
            Manage gate staff
          </Link>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Total" value={String(stats.total)} />
        <Stat label="Checked in" value={String(stats.checkedIn)} />
        <Stat label="Not in" value={String(stats.notCheckedIn)} />
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, or pass ID"
          className="flex-1 rounded-xl bg-black/40 border border-white/10 px-3 py-3 text-base outline-none focus:border-gold"
          autoFocus
        />
        <div className="flex gap-1">
          {(
            [
              ["all", "All"],
              ["out", "Not in"],
              ["in", "In"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFilter(id)}
              className={cn(
                "flex-1 sm:flex-none rounded-xl px-3 py-2 text-xs",
                filter === id ? "bg-gold text-ink font-semibold" : "bg-white/5 text-mute",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p
          className={cn(
            "rounded-xl px-3 py-2.5 text-sm font-medium",
            messageKind === "ok" && "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30",
            messageKind === "warn" && "bg-amber-500/15 text-amber-100 border border-amber-400/30",
            messageKind === "err" && "bg-red-500/15 text-red-200 border border-red-400/30",
          )}
        >
          {message}
        </p>
      )}

      {canAdd && (
        <AddPassForm
          pending={pending}
          onAdded={(row) => {
            setPasses((prev) => [row, ...prev]);
            setStats((s) => ({
              total: s.total + 1,
              checkedIn: s.checkedIn,
              notCheckedIn: s.notCheckedIn + 1,
            }));
            flash(`Added ${row.passId}`, "ok");
          }}
          onError={(err) => flash(err, "err")}
        />
      )}

      <ul className="space-y-2">
        {visible.map((pass) => {
          const inGate = Boolean(pass.checkedInAt);
          return (
            <li key={pass.id} className="panel rounded-2xl p-3 sm:p-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-2xl leading-none">{pass.name}</p>
                    <span className="text-[10px] uppercase tracking-wider text-gold">{pass.passId}</span>
                  </div>
                  <p className="text-sm text-mute mt-1">{pass.phone}</p>
                  {inGate ? (
                    <p className="text-sm text-emerald-300 mt-1">
                      ✓ CHECKED IN · {formatDateTime(pass.checkedInAt!)}
                      {pass.checkedInByName ? ` · ${pass.checkedInByName}` : ""}
                    </p>
                  ) : (
                    <p className="text-sm text-mute mt-1">Not checked in</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {!inGate ? (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => checkIn(pass)}
                      className="pressable flex-1 sm:flex-none rounded-xl bg-gold text-ink font-semibold px-5 py-3.5 text-base"
                    >
                      CHECK IN
                    </button>
                  ) : (
                    <span className="rounded-xl bg-emerald-500/15 text-emerald-200 px-4 py-3 text-sm font-semibold">
                      ✓ CHECKED IN
                    </span>
                  )}
                  {isAdmin && inGate && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => undo(pass)}
                      className="rounded-xl bg-white/5 px-3 py-3 text-xs text-mute"
                    >
                      Undo
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(pass)}
                      className="rounded-xl bg-red-500/10 text-red-200 px-3 py-3 text-xs"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="text-sm text-mute py-8 text-center">No passes match this search.</li>
        )}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel rounded-xl px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.2em] text-mute">{label}</p>
      <p className="font-display text-3xl text-gold leading-none mt-1">{value}</p>
    </div>
  );
}

function AddPassForm({
  pending,
  onAdded,
  onError,
}: {
  pending: boolean;
  onAdded: (row: GatePassRow) => void;
  onError: (error: string) => void;
}) {
  const [passId, setPassId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const [localPending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await addPassAction({ passId, name, phone, note });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onAdded({
        id: result.pass.id,
        passId: result.pass.passId,
        name: result.pass.name,
        phone: result.pass.phone,
        note: result.pass.note,
        checkedInAt: null,
        checkedInByName: null,
        createdByName: "You",
      });
      setPassId("");
      setName("");
      setPhone("");
      setNote("");
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-gold/40 text-gold px-3 py-2 text-sm"
      >
        + Add offline pass
      </button>
    );
  }

  return (
    <div className="panel rounded-2xl p-3 space-y-2">
      <p className="text-xs uppercase tracking-[0.2em] text-mute">New offline pass</p>
      <div className="grid sm:grid-cols-3 gap-2">
        <input
          value={passId}
          onChange={(e) => setPassId(e.target.value)}
          placeholder="Pass ID"
          className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
        />
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl bg-white/5 px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          type="button"
          disabled={pending || localPending}
          onClick={submit}
          className="rounded-xl bg-gold text-ink font-semibold px-4 py-2 text-sm"
        >
          Save pass
        </button>
      </div>
    </div>
  );
}
