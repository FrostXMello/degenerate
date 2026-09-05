"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  addGuestAction,
  checkInGuestAction,
  removeGuestAction,
  setGuestCoverCollectedAction,
  undoGuestCheckInAction,
} from "@/actions/guests";
import { cn, formatDateTime, formatInr } from "@/lib/format";
import type { SessionUser } from "@/lib/auth";

export type GuestRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  regNo: string | null;
  guestType: "REGULAR" | "PAID" | "BACKSTAGE";
  coverCharge: number;
  coverCollected: boolean;
  note: string | null;
  checkedInAt: string | null;
  checkedInByName: string | null;
  createdByName: string | null;
};

type Stats = {
  total: number;
  checkedIn: number;
  notCheckedIn: number;
  regular: number;
  paid: number;
  backstage: number;
  coverDue: number;
};

const TYPE_META: Record<
  GuestRow["guestType"],
  { label: string; className: string; hint: string }
> = {
  REGULAR: {
    label: "Guest list · ₹1k",
    className: "bg-gold/15 text-gold border-gold/30",
    hint: "Free entry · collect ₹1000 cover",
  },
  PAID: {
    label: "Offline pass",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
    hint: "Paid / offline pass · no cover at door",
  },
  BACKSTAGE: {
    label: "Backstage",
    className: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-400/30",
    hint: "Backstage special · VIP entry",
  },
};

export function GuestListBoard({
  user,
  initialGuests,
  initialStats,
}: {
  user: SessionUser;
  initialGuests: GuestRow[];
  initialStats: Stats;
}) {
  const [guests, setGuests] = useState(initialGuests);
  const [stats, setStats] = useState(initialStats);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | GuestRow["guestType"]>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "in" | "out">("all");
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"ok" | "warn" | "err">("ok");
  const [pending, startTransition] = useTransition();
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    setGuests(initialGuests);
    setStats(initialStats);
  }, [initialGuests, initialStats]);

  const canAdd = user.role === "ADMIN" || user.canAddGateEntries;
  const canRemove = user.role === "ADMIN" || user.canRemoveGateEntries;
  const isAdmin = user.role === "ADMIN";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return guests.filter((g) => {
      if (typeFilter !== "all" && g.guestType !== typeFilter) return false;
      if (statusFilter === "in" && !g.checkedInAt) return false;
      if (statusFilter === "out" && g.checkedInAt) return false;
      if (!q) return true;
      const hay = [g.name, g.phone, g.email, g.regNo, g.note, g.guestType, String(g.coverCharge)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [guests, query, typeFilter, statusFilter]);

  function flash(text: string, kind: "ok" | "warn" | "err" = "ok") {
    setMessage(text);
    setMessageKind(kind);
  }

  function checkIn(guest: GuestRow, collectCover: boolean) {
    startTransition(async () => {
      const result = await checkInGuestAction(guest.id, collectCover);
      if (result.ok) {
        const at = result.checkedInAt!;
        const nowCovered = collectCover || guest.coverCollected || guest.guestType !== "REGULAR";
        setGuests((prev) =>
          prev.map((g) =>
            g.id === guest.id
              ? {
                  ...g,
                  checkedInAt: at,
                  checkedInByName: user.name,
                  coverCollected: nowCovered ? true : g.coverCollected,
                }
              : g,
          ),
        );
        setStats((s) => ({
          ...s,
          checkedIn: s.checkedIn + 1,
          notCheckedIn: Math.max(0, s.notCheckedIn - 1),
          coverDue:
            guest.guestType === "REGULAR" && collectCover && !guest.coverCollected
              ? Math.max(0, s.coverDue - guest.coverCharge)
              : s.coverDue,
        }));
        flash(
          collectCover
            ? `✓ COVER + CHECKED IN · ${guest.name}`
            : `✓ CHECKED IN · ${guest.name}`,
          "ok",
        );
        return;
      }
      if ("already" in result && result.already) {
        setGuests((prev) =>
          prev.map((g) =>
            g.id === guest.id ? { ...g, checkedInAt: result.checkedInAt ?? g.checkedInAt } : g,
          ),
        );
        flash(`⚠️ ALREADY CHECKED IN`, "warn");
        return;
      }
      flash(result.error, "err");
    });
  }

  function markCoverPaid(guest: GuestRow) {
    if (guest.coverCollected) {
      flash(`Cover already marked paid for ${guest.name}`, "warn");
      return;
    }
    startTransition(async () => {
      const result = await setGuestCoverCollectedAction(guest.id, true);
      if (!result.ok) {
        flash(result.error, "err");
        return;
      }
      setGuests((prev) =>
        prev.map((g) => (g.id === guest.id ? { ...g, coverCollected: true } : g)),
      );
      setStats((s) => ({
        ...s,
        coverDue: Math.max(0, s.coverDue - guest.coverCharge),
      }));
      flash(`Cover paid · ${guest.name}`, "ok");
    });
  }

  function undo(guest: GuestRow) {
    startTransition(async () => {
      const result = await undoGuestCheckInAction(guest.id);
      if (!result.ok) {
        flash(result.error, "err");
        return;
      }
      setGuests((prev) =>
        prev.map((g) =>
          g.id === guest.id ? { ...g, checkedInAt: null, checkedInByName: null } : g,
        ),
      );
      setStats((s) => ({
        ...s,
        checkedIn: Math.max(0, s.checkedIn - 1),
        notCheckedIn: s.notCheckedIn + 1,
      }));
      flash(`Unchecked · ${guest.name}`, "ok");
    });
  }

  function remove(guest: GuestRow) {
    if (!window.confirm(`Remove ${guest.name} from guest list?`)) return;
    startTransition(async () => {
      const result = await removeGuestAction(guest.id);
      if (!result.ok) {
        flash(result.error, "err");
        return;
      }
      setGuests((prev) => prev.filter((g) => g.id !== guest.id));
      setStats((s) => ({
        total: Math.max(0, s.total - 1),
        checkedIn: guest.checkedInAt ? Math.max(0, s.checkedIn - 1) : s.checkedIn,
        notCheckedIn: guest.checkedInAt ? s.notCheckedIn : Math.max(0, s.notCheckedIn - 1),
        regular: guest.guestType === "REGULAR" ? Math.max(0, s.regular - 1) : s.regular,
        paid: guest.guestType === "PAID" ? Math.max(0, s.paid - 1) : s.paid,
        backstage: guest.guestType === "BACKSTAGE" ? Math.max(0, s.backstage - 1) : s.backstage,
        coverDue:
          guest.guestType === "REGULAR" && !guest.coverCollected
            ? Math.max(0, s.coverDue - guest.coverCharge)
            : s.coverDue,
      }));
      flash(`Removed ${guest.name}`, "ok");
    });
  }

  function toggleCover(guest: GuestRow) {
    const next = !guest.coverCollected;
    startTransition(async () => {
      const result = await setGuestCoverCollectedAction(guest.id, next);
      if (!result.ok) {
        flash(result.error, "err");
        return;
      }
      setGuests((prev) =>
        prev.map((g) => (g.id === guest.id ? { ...g, coverCollected: next } : g)),
      );
      setStats((s) => ({
        ...s,
        coverDue: next
          ? Math.max(0, s.coverDue - guest.coverCharge)
          : s.coverDue + guest.coverCharge,
      }));
      flash(next ? `Cover paid · ${guest.name}` : `Cover marked due · ${guest.name}`, "ok");
    });
  }

  return (
    <div className="space-y-3 pb-24 sm:pb-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold">Guest list</p>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Guests</h1>
          <p className="text-sm text-mute mt-1">Guest list · Offline passes · Backstage — one search</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <Link href="/guests/staff" className="rounded-full border border-gold/40 text-gold px-3 py-1.5 text-xs">
              Door staff
            </Link>
          )}
          {canAdd && (
            <button
              type="button"
              onClick={() => setShowAdd((v) => !v)}
              className="rounded-full bg-gold text-ink px-3 py-1.5 text-xs font-semibold"
            >
              {showAdd ? "Close" : "+ Add entry"}
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Total" value={String(stats.total)} />
        <Stat label="In" value={String(stats.checkedIn)} />
        <Stat label="Out" value={String(stats.notCheckedIn)} />
        <Stat label="Cover due" value={formatInr(stats.coverDue)} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Guest list" value={String(stats.regular)} />
        <Stat label="Offline pass" value={String(stats.paid)} />
        <Stat label="Backstage" value={String(stats.backstage)} />
      </div>

      {message && (
        <p
          className={cn(
            "rounded-xl px-3 py-2 text-sm border",
            messageKind === "ok" && "bg-emerald-500/10 border-emerald-400/30 text-emerald-200",
            messageKind === "warn" && "bg-amber-500/10 border-amber-400/30 text-amber-100",
            messageKind === "err" && "bg-red-500/10 border-red-400/30 text-red-200",
          )}
        >
          {message}
        </p>
      )}

      {showAdd && canAdd && (
        <AddGuestForm
          pending={pending}
          onAdded={(guest) => {
            setGuests((prev) => [guest, ...prev]);
            setStats((s) => ({
              ...s,
              total: s.total + 1,
              notCheckedIn: s.notCheckedIn + 1,
              regular: guest.guestType === "REGULAR" ? s.regular + 1 : s.regular,
              paid: guest.guestType === "PAID" ? s.paid + 1 : s.paid,
              backstage: guest.guestType === "BACKSTAGE" ? s.backstage + 1 : s.backstage,
              coverDue:
                guest.guestType === "REGULAR" ? s.coverDue + guest.coverCharge : s.coverDue,
            }));
            setShowAdd(false);
            flash(`Added ${guest.name}`, "ok");
          }}
          onError={(e) => flash(e, "err")}
          startTransition={startTransition}
        />
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, phone, email, reg no…"
          className="flex-1 rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-base outline-none focus:border-gold"
        />
        <div className="flex gap-1 overflow-x-auto">
          {(
            [
              ["all", "All"],
              ["REGULAR", "Guest list"],
              ["PAID", "Offline pass"],
              ["BACKSTAGE", "Backstage"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTypeFilter(key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-2 text-xs",
                typeFilter === key ? "bg-gold text-ink font-semibold" : "bg-white/5 text-mute",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(
            [
              ["all", "Any"],
              ["out", "Out"],
              ["in", "In"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setStatusFilter(key)}
              className={cn(
                "rounded-full px-3 py-2 text-xs",
                statusFilter === key ? "bg-cream text-ink font-semibold" : "bg-white/5 text-mute",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-mute">{visible.length} showing</p>

      <ul className="space-y-2">
        {visible.map((guest) => {
          const meta = TYPE_META[guest.guestType];
          return (
            <li
              key={guest.id}
              className={cn(
                "panel rounded-2xl p-3 sm:p-4",
                guest.checkedInAt && "opacity-70",
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-lg text-cream truncate">{guest.name}</p>
                    <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider", meta.className)}>
                      {meta.label}
                    </span>
                    {guest.checkedInAt && (
                      <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-2 py-0.5 text-[10px] uppercase">
                        In
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-mute mt-1">{meta.hint}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-mute">
                    {guest.phone && <span>{guest.phone}</span>}
                    {guest.email && <span className="truncate max-w-[16rem]">{guest.email}</span>}
                    {guest.regNo && <span>Reg {guest.regNo}</span>}
                    {guest.guestType === "REGULAR" && (
                      <span className={guest.coverCollected ? "text-emerald-300" : "text-gold"}>
                        Cover {formatInr(guest.coverCharge)}
                        {guest.coverCollected ? " · paid" : " · due"}
                      </span>
                    )}
                  </div>
                  {guest.checkedInAt && (
                    <p className="text-xs text-mute mt-1">
                      Checked in {formatDateTime(guest.checkedInAt)}
                      {guest.checkedInByName ? ` · ${guest.checkedInByName}` : ""}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 justify-end">
                  {!guest.checkedInAt && guest.guestType === "REGULAR" && (
                    <>
                      <button
                        type="button"
                        disabled={pending || guest.coverCollected}
                        onClick={() => markCoverPaid(guest)}
                        className={cn(
                          "rounded-xl border px-3 py-2 text-xs font-medium",
                          guest.coverCollected
                            ? "border-emerald-400/30 text-emerald-300"
                            : "border-gold/40 text-gold",
                        )}
                      >
                        {guest.coverCollected ? "Cover paid ✓" : "Cover paid"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => checkIn(guest, false)}
                        className="pressable rounded-xl border border-white/20 text-cream px-3 py-2 text-xs font-medium"
                      >
                        Check in
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => checkIn(guest, true)}
                        className="pressable rounded-xl bg-gold text-ink font-semibold px-3 py-2 text-xs"
                      >
                        Both
                      </button>
                    </>
                  )}
                  {!guest.checkedInAt && guest.guestType !== "REGULAR" && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => checkIn(guest, false)}
                      className="pressable rounded-xl bg-gold text-ink font-semibold px-4 py-2 text-sm"
                    >
                      Check in
                    </button>
                  )}
                  {guest.checkedInAt && isAdmin && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => undo(guest)}
                      className="rounded-xl border border-amber-400/40 text-amber-100 px-3 py-2 text-xs font-medium"
                    >
                      Uncheck
                    </button>
                  )}
                  {guest.guestType === "REGULAR" && guest.coverCollected && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggleCover(guest)}
                      className="rounded-xl border border-white/10 text-mute px-3 py-2 text-xs"
                    >
                      Undo cover
                    </button>
                  )}
                  {canRemove && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => remove(guest)}
                      className="rounded-xl border border-red-400/30 text-red-200 px-3 py-2 text-xs"
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
          <li className="text-center text-mute py-10 text-sm">No guests match this search.</li>
        )}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-mute">{label}</p>
      <p className="font-display text-2xl text-cream leading-none mt-1">{value}</p>
    </div>
  );
}

function AddGuestForm({
  pending,
  onAdded,
  onError,
  startTransition,
}: {
  pending: boolean;
  onAdded: (guest: GuestRow) => void;
  onError: (error: string) => void;
  startTransition: (fn: () => void) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [regNo, setRegNo] = useState("");
  const [guestType, setGuestType] = useState<"REGULAR" | "PAID" | "BACKSTAGE">("REGULAR");
  const [coverCharge, setCoverCharge] = useState("1000");

  useEffect(() => {
    if (guestType === "REGULAR") setCoverCharge("1000");
    else setCoverCharge("0");
  }, [guestType]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await addGuestAction({
        name,
        phone,
        email,
        regNo,
        guestType,
        coverCharge: Number(coverCharge) || 0,
      });
      if (!result.ok) {
        onError(result.error);
        return;
      }
      onAdded(result.guest);
      setName("");
      setPhone("");
      setEmail("");
      setRegNo("");
      setGuestType("REGULAR");
      setCoverCharge("1000");
    });
  }

  return (
    <form onSubmit={submit} className="panel rounded-2xl p-4 space-y-3">
      <p className="text-xs uppercase tracking-[0.2em] text-gold">Add guest</p>
      <p className="text-xs text-mute">All fields optional — add whatever you have (name, phone, email, or reg no).</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="block sm:col-span-2">
          <span className="text-xs text-mute">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="text-xs text-mute">Phone</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="text-xs text-mute">Reg no</span>
          <input
            value={regNo}
            onChange={(e) => setRegNo(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-gold"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs text-mute">Email</span>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-gold"
          />
        </label>
        <label className="block">
          <span className="text-xs text-mute">Type</span>
          <select
            value={guestType}
            onChange={(e) => setGuestType(e.target.value as typeof guestType)}
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-gold"
          >
            <option value="REGULAR">Guest list (₹1k cover)</option>
            <option value="PAID">Offline pass (no cover)</option>
            <option value="BACKSTAGE">Backstage special</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs text-mute">Cover charge</span>
          <input
            type="number"
            min={0}
            value={coverCharge}
            onChange={(e) => setCoverCharge(e.target.value)}
            className="mt-1 w-full rounded-xl bg-black/40 border border-white/10 px-3 py-2 outline-none focus:border-gold"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={pending}
        className="pressable w-full rounded-xl bg-gold text-ink font-semibold py-3"
      >
        Add guest
      </button>
    </form>
  );
}
