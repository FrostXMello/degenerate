"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { updateFoodStaffAction } from "@/actions/food";
import { cn, formatDateTime } from "@/lib/format";

type Staff = {
  id: string;
  username: string;
  name: string;
  active: boolean;
  canAddFoodItems: boolean;
  canRemoveFoodItems: boolean;
  canChangeFoodPrices: boolean;
  canVoidFoodOrders: boolean;
  createdAt: string;
};

export function FoodStaffAdmin({ initialStaff }: { initialStaff: Staff[] }) {
  const [staff, setStaff] = useState(initialStaff);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setStaff(initialStaff);
  }, [initialStaff]);

  function patch(userId: string, patchData: Partial<Staff>) {
    startTransition(async () => {
      const result = await updateFoodStaffAction({
        userId,
        active: patchData.active,
        canAddFoodItems: patchData.canAddFoodItems,
        canRemoveFoodItems: patchData.canRemoveFoodItems,
        canChangeFoodPrices: patchData.canChangeFoodPrices,
        canVoidFoodOrders: patchData.canVoidFoodOrders,
      });
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      setStaff((prev) => prev.map((s) => (s.id === userId ? { ...s, ...patchData } : s)));
      setMessage("Permissions updated — staff must re-login to refresh session flags.");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[10px] tracking-[0.3em] uppercase text-gold">Admin</p>
          <h1 className="font-display text-4xl leading-none">Food staff</h1>
          <p className="text-sm text-mute mt-1">
            Lock who can add dishes, remove dishes, change prices, or void mistaken orders.
          </p>
        </div>
        <Link href="/food" className="text-sm text-mute hover:text-cream">
          ← Food
        </Link>
      </div>

      {message && <p className="text-sm text-gold">{message}</p>}

      <section className="space-y-2">
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
            <div className="mt-3 flex flex-wrap gap-2">
              <Toggle
                label="Add dishes"
                on={s.canAddFoodItems}
                onChange={(v) => patch(s.id, { canAddFoodItems: v })}
              />
              <Toggle
                label="Remove dishes"
                on={s.canRemoveFoodItems}
                onChange={(v) => patch(s.id, { canRemoveFoodItems: v })}
              />
              <Toggle
                label="Change prices"
                on={s.canChangeFoodPrices}
                onChange={(v) => patch(s.id, { canChangeFoodPrices: v })}
              />
              <Toggle
                label="Void orders"
                on={s.canVoidFoodOrders}
                onChange={(v) => patch(s.id, { canVoidFoodOrders: v })}
              />
            </div>
          </div>
        ))}
        {staff.length === 0 && <p className="text-sm text-mute">No food staff seeded yet.</p>}
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
