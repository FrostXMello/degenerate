"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  createGateStaffAction,
  updateGateStaffAction,
} from "@/actions/gate";
import { cn, formatDateTime } from "@/lib/format";

type Staff = {
  id: string;
  username: string;
  name: string;
  active: boolean;
  canAddGateEntries: boolean;
  canRemoveGateEntries: boolean;
  createdAt: string;
};

type Audit = {
  id: string;
  action: string;
  passId: string | null;
  targetUser: string | null;
  detail: string | null;
  actorName: string;
  createdAt: string;
};

export function GateStaffAdmin({
  initialStaff,
  initialAudit,
}: {
  initialStaff: Staff[];
  initialAudit: Audit[];
}) {
  const [staff, setStaff] = useState(initialStaff);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("gate456");
  const [canAdd, setCanAdd] = useState(false);
  const [canRemove, setCanRemove] = useState(false);

  function create() {
    startTransition(async () => {
      const result = await createGateStaffAction({
        username,
        name,
        password,
        canAddGateEntries: canAdd,
        canRemoveGateEntries: canRemove,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setMessage(`Created ${username}`);
      setUsername("");
      setName("");
      setPassword("gate456");
      setCanAdd(false);
      setCanRemove(false);
      window.location.reload();
    });
  }

  function patch(userId: string, patchData: Partial<Staff>) {
    startTransition(async () => {
      const result = await updateGateStaffAction({
        userId,
        canAddGateEntries: patchData.canAddGateEntries,
        canRemoveGateEntries: patchData.canRemoveGateEntries,
        active: patchData.active,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setStaff((prev) => prev.map((s) => (s.id === userId ? { ...s, ...patchData } : s)));
      setMessage("Updated");
    });
  }

  return (
    <div className="space-y-5 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold">Admin</p>
          <h1 className="font-display text-4xl sm:text-5xl leading-none">Gate Staff</h1>
        </div>
        <Link href="/gate" className="text-sm text-mute hover:text-cream">
          ← Back to gate
        </Link>
      </div>

      {message && <p className="text-sm text-gold">{message}</p>}

      <section className="panel rounded-2xl p-4 space-y-3">
        <h2 className="font-display text-2xl text-gold">Create gate staff</h2>
        <div className="grid sm:grid-cols-2 gap-2">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-xl bg-black/40 border border-white/10 px-3 py-2.5 sm:col-span-2"
          />
        </div>
        <div className="flex flex-wrap gap-3 text-sm">
          <Toggle label="Can Add Entries" on={canAdd} onChange={setCanAdd} />
          <Toggle label="Can Remove Entries" on={canRemove} onChange={setCanRemove} />
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={create}
          className="rounded-xl bg-gold text-ink font-semibold px-4 py-2.5"
        >
          Create account
        </button>
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-2xl text-gold">Accounts</h2>
        {staff.map((s) => (
          <div key={s.id} className={cn("panel rounded-2xl p-4", !s.active && "opacity-60")}>
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <p className="font-display text-2xl leading-none">{s.name}</p>
                <p className="text-xs text-mute mt-1">
                  {s.username} · created {formatDateTime(s.createdAt)}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => patch(s.id, { active: !s.active })}
                className={cn(
                  "rounded-full px-3 py-1 text-xs",
                  s.active ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-mute",
                )}
              >
                {s.active ? "Enabled" : "Disabled"}
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-3">
              <Toggle
                label="Can Add Entries"
                on={s.canAddGateEntries}
                onChange={(v) => patch(s.id, { canAddGateEntries: v })}
              />
              <Toggle
                label="Can Remove Entries"
                on={s.canRemoveGateEntries}
                onChange={(v) => patch(s.id, { canRemoveGateEntries: v })}
              />
            </div>
          </div>
        ))}
        {staff.length === 0 && <p className="text-sm text-mute">No gate staff yet.</p>}
      </section>

      <section className="space-y-2">
        <h2 className="font-display text-2xl text-gold">Audit log</h2>
        <ul className="space-y-1.5 text-sm">
          {initialAudit.map((row) => (
            <li key={row.id} className="panel rounded-xl px-3 py-2 flex flex-wrap justify-between gap-2">
              <span>
                <span className="text-gold">{row.action}</span>
                {row.passId ? ` · ${row.passId}` : ""}
                {row.targetUser ? ` · ${row.targetUser}` : ""}
                {row.detail ? ` · ${row.detail}` : ""}
              </span>
              <span className="text-mute text-xs">
                {row.actorName} · {formatDateTime(row.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs border",
        on ? "bg-gold text-ink border-gold font-semibold" : "bg-white/5 text-mute border-white/10",
      )}
    >
      {label}: {on ? "ON" : "OFF"}
    </button>
  );
}
