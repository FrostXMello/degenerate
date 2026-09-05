import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const COOKIE = "degenerate_session";
const TTL_HOURS = 16;

export type SessionUser = {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  canAddGateEntries: boolean;
  canRemoveGateEntries: boolean;
  canAddFoodItems: boolean;
  canRemoveFoodItems: boolean;
  canChangeFoodPrices: boolean;
  canVoidFoodOrders: boolean;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

export async function signSession(user: SessionUser) {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_HOURS}h`)
    .sign(secret());
}

export async function readSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.id),
      username: String(payload.username),
      name: String(payload.name),
      role: payload.role as UserRole,
      canAddGateEntries: Boolean(payload.canAddGateEntries),
      canRemoveGateEntries: Boolean(payload.canRemoveGateEntries),
      canAddFoodItems: Boolean(payload.canAddFoodItems),
      canRemoveFoodItems: Boolean(payload.canRemoveFoodItems),
      canChangeFoodPrices: Boolean(payload.canChangeFoodPrices),
      canVoidFoodOrders: Boolean(payload.canVoidFoodOrders),
    };
  } catch {
    return null;
  }
}

export async function requireSession() {
  const session = await readSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.role !== "ADMIN") throw new Error("Forbidden");
  return session;
}

export async function requireGateAccess() {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "GATE_STAFF") {
    throw new Error("Forbidden");
  }
  if (session.role === "GATE_STAFF") {
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user || !user.active || user.role !== "GATE_STAFF") {
      throw new Error("Forbidden");
    }
    return {
      ...session,
      canAddGateEntries: user.canAddGateEntries,
      canRemoveGateEntries: user.canRemoveGateEntries,
    };
  }
  return {
    ...session,
    canAddGateEntries: true,
    canRemoveGateEntries: true,
  };
}

/** Fresh DB permissions — never trust JWT alone for mutating gate data. */
export async function requireGatePermission(kind: "add" | "remove") {
  const session = await requireSession();
  if (session.role === "ADMIN") return session;

  if (session.role !== "GATE_STAFF") throw new Error("Forbidden");

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !user.active || user.role !== "GATE_STAFF") {
    throw new Error("Forbidden");
  }
  if (kind === "add" && !user.canAddGateEntries) {
    throw new Error("You do not have permission to add entries.");
  }
  if (kind === "remove" && !user.canRemoveGateEntries) {
    throw new Error("You do not have permission to remove entries.");
  }
  return {
    ...session,
    canAddGateEntries: user.canAddGateEntries,
    canRemoveGateEntries: user.canRemoveGateEntries,
  };
}

export async function requireFoodAccess() {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "FOOD_STAFF") {
    throw new Error("Forbidden");
  }
  if (session.role === "FOOD_STAFF") {
    const user = await prisma.user.findUnique({ where: { id: session.id } });
    if (!user || !user.active || user.role !== "FOOD_STAFF") {
      throw new Error("Forbidden");
    }
    return foodPerms(session, user);
  }
  return {
    ...session,
    canAddFoodItems: true,
    canRemoveFoodItems: true,
    canChangeFoodPrices: true,
    canVoidFoodOrders: true,
  };
}

export type FoodPermission = "addItem" | "removeItem" | "changePrice" | "voidOrder";

/** Fresh DB permissions for food menu / voids. */
export async function requireFoodPermission(kind: FoodPermission) {
  const session = await requireSession();
  if (session.role === "ADMIN") {
    return {
      ...session,
      canAddFoodItems: true,
      canRemoveFoodItems: true,
      canChangeFoodPrices: true,
      canVoidFoodOrders: true,
    };
  }

  if (session.role !== "FOOD_STAFF") throw new Error("Forbidden");

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !user.active || user.role !== "FOOD_STAFF") {
    throw new Error("Forbidden");
  }
  if (kind === "addItem" && !user.canAddFoodItems) {
    throw new Error("You do not have permission to add menu items.");
  }
  if (kind === "removeItem" && !user.canRemoveFoodItems) {
    throw new Error("You do not have permission to remove menu items.");
  }
  if (kind === "changePrice" && !user.canChangeFoodPrices) {
    throw new Error("You do not have permission to change prices.");
  }
  if (kind === "voidOrder" && !user.canVoidFoodOrders) {
    throw new Error("You do not have permission to void food orders.");
  }
  return foodPerms(session, user);
}

function foodPerms(
  session: SessionUser,
  user: {
    canAddFoodItems: boolean;
    canRemoveFoodItems: boolean;
    canChangeFoodPrices: boolean;
    canVoidFoodOrders: boolean;
  },
) {
  return {
    ...session,
    canAddFoodItems: user.canAddFoodItems,
    canRemoveFoodItems: user.canRemoveFoodItems,
    canChangeFoodPrices: user.canChangeFoodPrices,
    canVoidFoodOrders: user.canVoidFoodOrders,
  };
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_HOURS * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

export function homeForRole(role: UserRole) {
  if (role === "GATE_STAFF") return "/guests";
  if (role === "FOOD_STAFF") return "/food";
  return "/order";
}

export const SESSION_COOKIE = COOKIE;
