"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  requireAdmin,
  requireGateAccess,
  requireGatePermission,
  requireSession,
} from "@/lib/auth";
import type { GateAuditAction } from "@prisma/client";

function revalidateGate() {
  revalidatePath("/gate");
  revalidatePath("/gate/staff");
}

async function audit(input: {
  action: GateAuditAction;
  actorId: string;
  passId?: string | null;
  targetUser?: string | null;
  detail?: string | null;
}) {
  await prisma.gateAuditLog.create({
    data: {
      action: input.action,
      actorId: input.actorId,
      passId: input.passId ?? null,
      targetUser: input.targetUser ?? null,
      detail: input.detail ?? null,
    },
  });
}

function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").trim();
}

function normalizePassId(passId: string) {
  return passId.trim().toUpperCase();
}

export async function getGateSnapshot(query?: string) {
  await requireGateAccess();
  const q = query?.trim() ?? "";

  const where = q
    ? {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { passId: { contains: q.toUpperCase() } },
        ],
      }
    : undefined;

  const [passes, total, checkedIn] = await Promise.all([
    prisma.offlinePass.findMany({
      where,
      orderBy: [{ checkedInAt: "asc" }, { name: "asc" }],
      include: {
        checkedInBy: { select: { name: true, username: true } },
        createdBy: { select: { name: true } },
      },
      take: 200,
    }),
    prisma.offlinePass.count(),
    prisma.offlinePass.count({ where: { checkedInAt: { not: null } } }),
  ]);

  return {
    passes: passes.map((p) => ({
      id: p.id,
      passId: p.passId,
      name: p.name,
      phone: p.phone,
      note: p.note,
      checkedInAt: p.checkedInAt?.toISOString() ?? null,
      checkedInByName: p.checkedInBy?.name ?? null,
      createdByName: p.createdBy?.name ?? null,
    })),
    stats: {
      total,
      checkedIn,
      notCheckedIn: total - checkedIn,
    },
  };
}

export async function checkInPassAction(passRecordId: string) {
  const user = await requireGateAccess();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.offlinePass.updateMany({
        where: { id: passRecordId, checkedInAt: null },
        data: {
          checkedInAt: new Date(),
          checkedInById: user.id,
        },
      });

      if (updated.count === 0) {
        const existing = await tx.offlinePass.findUnique({ where: { id: passRecordId } });
        if (!existing) return { status: "missing" as const };
        return {
          status: "already" as const,
          checkedInAt: existing.checkedInAt?.toISOString() ?? null,
        };
      }

      const pass = await tx.offlinePass.findUniqueOrThrow({ where: { id: passRecordId } });
      await tx.gateAuditLog.create({
        data: {
          action: "CHECK_IN",
          actorId: user.id,
          passId: pass.passId,
          detail: `${pass.name} · ${pass.phone}`,
        },
      });
      return {
        status: "ok" as const,
        checkedInAt: pass.checkedInAt?.toISOString() ?? new Date().toISOString(),
        passId: pass.passId,
        name: pass.name,
      };
    });

    revalidateGate();
    if (result.status === "missing") {
      return { ok: false as const, error: "Pass not found." };
    }
    if (result.status === "already") {
      return {
        ok: false as const,
        already: true as const,
        error: "ALREADY CHECKED IN",
        checkedInAt: result.checkedInAt,
      };
    }
    return {
      ok: true as const,
      checkedInAt: result.checkedInAt,
      passId: result.passId,
      name: result.name,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}

export async function undoCheckInAction(passRecordId: string) {
  const user = await requireAdmin();
  try {
    const pass = await prisma.offlinePass.findUnique({ where: { id: passRecordId } });
    if (!pass) return { ok: false as const, error: "Pass not found." };
    if (!pass.checkedInAt) return { ok: false as const, error: "Pass is not checked in." };

    await prisma.$transaction(async (tx) => {
      await tx.offlinePass.update({
        where: { id: passRecordId },
        data: { checkedInAt: null, checkedInById: null },
      });
      await tx.gateAuditLog.create({
        data: {
          action: "UNDO_CHECK_IN",
          actorId: user.id,
          passId: pass.passId,
          detail: `${pass.name} · reversed`,
        },
      });
    });

    revalidateGate();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}

export async function addPassAction(input: {
  passId: string;
  name: string;
  phone: string;
  note?: string;
}) {
  const user = await requireGatePermission("add");
  const passId = normalizePassId(input.passId);
  const name = input.name.trim();
  const phone = normalizePhone(input.phone);

  if (!passId || !name || !phone) {
    return { ok: false as const, error: "Pass ID, name, and phone are required." };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const pass = await tx.offlinePass.create({
        data: {
          passId,
          name,
          phone,
          note: input.note?.trim() || null,
          createdById: user.id,
        },
      });
      await tx.gateAuditLog.create({
        data: {
          action: "ADD_PASS",
          actorId: user.id,
          passId,
          detail: `${name} · ${phone}`,
        },
      });
      return pass;
    });
    revalidateGate();
    return {
      ok: true as const,
      pass: {
        id: created.id,
        passId: created.passId,
        name: created.name,
        phone: created.phone,
        note: created.note,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("unique")) {
      return { ok: false as const, error: "That Pass ID already exists." };
    }
    return { ok: false as const, error: message };
  }
}

export async function removePassAction(passRecordId: string) {
  const user = await requireGatePermission("remove");
  try {
    const pass = await prisma.offlinePass.findUnique({ where: { id: passRecordId } });
    if (!pass) return { ok: false as const, error: "Pass not found." };

    await prisma.$transaction(async (tx) => {
      await tx.offlinePass.delete({ where: { id: passRecordId } });
      await tx.gateAuditLog.create({
        data: {
          action: "REMOVE_PASS",
          actorId: user.id,
          passId: pass.passId,
          detail: `${pass.name} · ${pass.phone}`,
        },
      });
    });
    revalidateGate();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}

export async function createGateStaffAction(input: {
  username: string;
  name: string;
  password: string;
  canAddGateEntries: boolean;
  canRemoveGateEntries: boolean;
}) {
  const admin = await requireAdmin();
  const username = input.username.trim().toLowerCase();
  const name = input.name.trim();
  const password = input.password;

  if (!username || !name || password.length < 4) {
    return { ok: false as const, error: "Username, name, and password (4+ chars) required." };
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          username,
          name,
          passwordHash,
          role: "GATE_STAFF",
          active: true,
          canAddGateEntries: input.canAddGateEntries,
          canRemoveGateEntries: input.canRemoveGateEntries,
        },
      });
      await tx.gateAuditLog.create({
        data: {
          action: "CREATE_STAFF",
          actorId: admin.id,
          targetUser: username,
          detail: `add=${input.canAddGateEntries} remove=${input.canRemoveGateEntries}`,
        },
      });
    });
    revalidateGate();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.toLowerCase().includes("unique")) {
      return { ok: false as const, error: "Username already taken." };
    }
    return { ok: false as const, error: message };
  }
}

export async function updateGateStaffAction(input: {
  userId: string;
  canAddGateEntries?: boolean;
  canRemoveGateEntries?: boolean;
  active?: boolean;
}) {
  const admin = await requireAdmin();
  try {
    const existing = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!existing || existing.role !== "GATE_STAFF") {
      return { ok: false as const, error: "Gate staff not found." };
    }

    const data: {
      canAddGateEntries?: boolean;
      canRemoveGateEntries?: boolean;
      active?: boolean;
    } = {};
    if (typeof input.canAddGateEntries === "boolean") data.canAddGateEntries = input.canAddGateEntries;
    if (typeof input.canRemoveGateEntries === "boolean") {
      data.canRemoveGateEntries = input.canRemoveGateEntries;
    }
    if (typeof input.active === "boolean") data.active = input.active;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: input.userId }, data });
      if (typeof input.active === "boolean" && input.active !== existing.active) {
        await tx.gateAuditLog.create({
          data: {
            action: input.active ? "ENABLE_STAFF" : "DISABLE_STAFF",
            actorId: admin.id,
            targetUser: existing.username,
          },
        });
      }
      if (
        typeof input.canAddGateEntries === "boolean" ||
        typeof input.canRemoveGateEntries === "boolean"
      ) {
        await tx.gateAuditLog.create({
          data: {
            action: "PERMISSION_CHANGE",
            actorId: admin.id,
            targetUser: existing.username,
            detail: `add=${input.canAddGateEntries ?? existing.canAddGateEntries} remove=${input.canRemoveGateEntries ?? existing.canRemoveGateEntries}`,
          },
        });
      }
    });

    revalidateGate();
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}

export async function listGateStaffAction() {
  await requireAdmin();
  const staff = await prisma.user.findMany({
    where: { role: "GATE_STAFF" },
    orderBy: { username: "asc" },
    select: {
      id: true,
      username: true,
      name: true,
      active: true,
      canAddGateEntries: true,
      canRemoveGateEntries: true,
      createdAt: true,
    },
  });
  return staff.map((s) => ({
    ...s,
    createdAt: s.createdAt.toISOString(),
  }));
}

export async function listGateAuditAction() {
  await requireAdmin();
  const rows = await prisma.gateAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true, username: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    passId: row.passId,
    targetUser: row.targetUser,
    detail: row.detail,
    actorName: row.actor?.name ?? row.actor?.username ?? "Unknown",
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function refreshSessionPermissionsAction() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !user.active) throw new Error("Unauthorized");
  return {
    canAddGateEntries: user.role === "ADMIN" ? true : user.canAddGateEntries,
    canRemoveGateEntries: user.role === "ADMIN" ? true : user.canRemoveGateEntries,
  };
}
