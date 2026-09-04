"use server";

import { getProducts } from "@/lib/data";
import { requireSession } from "@/lib/auth";

export async function getLiveProducts() {
  await requireSession();
  try {
    const products = await getProducts(true);
    return { ok: true as const, products };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false as const, error: message };
  }
}
