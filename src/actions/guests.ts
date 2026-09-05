"use server";

import { revalidatePath } from "next/cache";
import { GuestType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireGateAccess, requireGatePermission, requireSession } from "@/lib/auth";
import type { GateAuditAction } from "@prisma/client";

function revalidateGuests() {
  revalidatePath("/guests");
}

async function audit(input: {
  action: GateAuditAction;
  actorId: string;
  passId?: string | null;
  detail?: string | null;
}) {
  await prisma.gateAuditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId,
      passId: input.passId ?? null,
      detail: input.detail ?? null,
    },
  });
}

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits || null;
}

function mapType(raw: string): GuestType {
  const v = raw.trim().toUpperCase();
  if (v === "PAID") return GuestType.PAID;
  if (v === "BACKSTAGE" || v === "BACKSTAGE_SPECIAL") return GuestType.BACKSTAGE;
  return GuestType.REGULAR;
}

function defaultCover(type: GuestType) {
  return type === GuestType.REGULAR ? 1000 : 0;
}

function toRow(g: {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  regNo: string | null;
  guestType: GuestType;
  coverCharge: number;
  coverCollected: boolean;
  note: string | null;
  checkedInAt: Date | null;
  checkedInBy: { name: string } | null;
  createdBy: { name: string } | null;
}) {
  return {
    id: g.id,
    name: g.name,
    phone: g.phone,
    email: g.email,
    regNo: g.regNo,
    guestType: g.guestType,
    coverCharge: g.coverCharge,
    coverCollected: g.coverCollected,
    note: g.note,
    checkedInAt: g.checkedInAt?.toISOString() ?? null,
    checkedInByName: g.checkedInBy?.name ?? null,
    createdByName: g.createdBy?.name ?? null,
  };
}

export async function getGuestSnapshot() {
  await requireGateAccess();
  const guests = await prisma.guestListEntry.findMany({
    orderBy: [{ guestType: "asc" }, { name: "asc" }],
    include: {
      checkedInBy: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });

  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checkedInAt).length;
  const regular = guests.filter((g) => g.guestType === "REGULAR").length;
  const paid = guests.filter((g) => g.guestType === "PAID").length;
  const backstage = guests.filter((g) => g.guestType === "BACKSTAGE").length;
  const coverDue = guests
    .filter((g) => g.guestType === "REGULAR" && !g.coverCollected)
    .reduce((sum, g) => sum + g.coverCharge, 0);

  return {
    guests: guests.map(toRow),
    stats: {
      total,
      checkedIn,
      notCheckedIn: total - checkedIn,
      regular,
      paid,
      backstage,
      coverDue,
    },
  };
}

export async function addGuestAction(input: {
  name: string;
  phone?: string;
  email?: string;
  regNo?: string;
  guestType: string;
  coverCharge?: number;
  note?: string;
}) {
  try {
    const session = await requireGatePermission("add");
    const name = input.name.trim();
    if (!name) return { ok: false as const, error: "Name is required." };

    const guestType = mapType(input.guestType);
    const coverCharge =
      typeof input.coverCharge === "number" && !Number.isNaN(input.coverCharge)
        ? Math.max(0, Math.round(input.coverCharge))
        : defaultCover(guestType);

    const guest = await prisma.guestListEntry.create({
      data: {
        name,
        phone: normalizePhone(input.phone),
        email: input.email?.trim() || null,
        regNo: input.regNo?.trim() || null,
        guestType,
        coverCharge,
        note: input.note?.trim() || null,
        createdById: session.id,
      },
      include: {
        checkedInBy: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });

    await audit({
      action: "ADD_GUEST",
      actorId: session.id,
      detail: `${name} · ${guestType}`,
    });
    revalidateGuests();
    return { ok: true as const, guest: toRow(guest) };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not add guest." };
  }
}

export async function removeGuestAction(id: string) {
  try {
    const session = await requireGatePermission("remove");
    const existing = await prisma.guestListEntry.findUnique({ where: { id } });
    if (!existing) return { ok: false as const, error: "Guest not found." };

    await prisma.guestListEntry.delete({ where: { id } });
    await audit({
      action: "REMOVE_GUEST",
      actorId: session.id,
      detail: `${existing.name} · ${existing.guestType}`,
    });
    revalidateGuests();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Could not remove guest." };
  }
}

export async function checkInGuestAction(id: string, collectCover = true) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN" && session.role !== "GATE_STAFF") {
      return { ok: false as const, error: "Forbidden" };
    }

    const existing = await prisma.guestListEntry.findUnique({ where: { id } });
    if (!existing) return { ok: false as const, error: "Guest not found." };
    if (existing.checkedInAt) {
      return {
        ok: false as const,
        already: true as const,
        checkedInAt: existing.checkedInAt.toISOString(),
        error: "Already checked in.",
      };
    }

    const now = new Date();
    const updated = await prisma.guestListEntry.updateMany({
      where: { id, checkedInAt: null },
      data: {
        checkedInAt: now,
        checkedInById: session.id,
        coverCollected:
          existing.guestType === "REGULAR"
            ? collectCover || existing.coverCollected
            : true,
      },
    });

    if (updated.count === 0) {
      const again = await prisma.guestListEntry.findUnique({ where: { id } });
      return {
        ok: false as const,
        already: true as const,
        checkedInAt: again?.checkedInAt?.toISOString() ?? null,
        error: "Already checked in.",
      };
    }

    await audit({
      action: "GUEST_CHECK_IN",
      actorId: session.id,
      detail: existing.name,
    });
    revalidateGuests();
    return { ok: true as const, checkedInAt: now.toISOString() };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Check-in failed." };
  }
}

export async function undoGuestCheckInAction(id: string) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN") {
      return { ok: false as const, error: "Only admin can undo guest check-in." };
    }
    await prisma.guestListEntry.update({
      where: { id },
      data: { checkedInAt: null, checkedInById: null },
    });
    await audit({
      action: "GUEST_UNDO_CHECK_IN",
      actorId: session.id,
      detail: id,
    });
    revalidateGuests();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Undo failed." };
  }
}

export async function setGuestCoverCollectedAction(id: string, collected: boolean) {
  try {
    const session = await requireSession();
    if (session.role !== "ADMIN" && session.role !== "GATE_STAFF") {
      return { ok: false as const, error: "Forbidden" };
    }
    await prisma.guestListEntry.update({
      where: { id },
      data: { coverCollected: collected },
    });
    revalidateGuests();
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "Update failed." };
  }
}
