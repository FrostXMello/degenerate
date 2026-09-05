"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie, homeForRole, setSessionCookie, signSession } from "@/lib/auth";

function foodFlags(user: {
  role: string;
  canAddFoodItems: boolean;
  canRemoveFoodItems: boolean;
  canChangeFoodPrices: boolean;
  canVoidFoodOrders: boolean;
}) {
  if (user.role === "ADMIN") {
    return {
      canAddFoodItems: true,
      canRemoveFoodItems: true,
      canChangeFoodPrices: true,
      canVoidFoodOrders: true,
    };
  }
  return {
    canAddFoodItems: user.canAddFoodItems,
    canRemoveFoodItems: user.canRemoveFoodItems,
    canChangeFoodPrices: user.canChangeFoodPrices,
    canVoidFoodOrders: user.canVoidFoodOrders,
  };
}

export async function loginAction(formData: FormData) {
  const username = String(formData.get("username") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");

  if (!username || !password) {
    redirect("/login?error=missing");
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.active) {
    redirect("/login?error=invalid");
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    redirect("/login?error=invalid");
  }

  const food = foodFlags(user);
  const token = await signSession({
    id: user.id,
    username: user.username,
    name: user.name,
    role: user.role,
    canAddGateEntries: user.role === "ADMIN" ? true : user.canAddGateEntries,
    canRemoveGateEntries: user.role === "ADMIN" ? true : user.canRemoveGateEntries,
    ...food,
  });
  await setSessionCookie(token);
  redirect(homeForRole(user.role));
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
