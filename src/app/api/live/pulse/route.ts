import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Lightweight change fingerprint so open tabs can refresh without a full reload. */
export async function GET() {
  try {
    // Soft auth: middleware already requires a session cookie for /api/*
    const [orders, passes, guests, stock, products, prices, closing] = await Promise.all([
      prisma.order.aggregate({ _count: true, _max: { updatedAt: true } }),
      prisma.offlinePass.aggregate({ _count: true, _max: { updatedAt: true } }),
      prisma.guestListEntry.aggregate({ _count: true, _max: { updatedAt: true } }),
      prisma.stock.aggregate({ _count: true, _max: { updatedAt: true } }),
      prisma.product.aggregate({ _count: true, _max: { updatedAt: true } }),
      prisma.price.aggregate({ _count: true, _max: { createdAt: true } }),
      prisma.closingReport.aggregate({ _count: true, _max: { createdAt: true } }),
    ]);

    const v = [
      orders._count,
      orders._max.updatedAt?.toISOString() ?? "",
      passes._count,
      passes._max.updatedAt?.toISOString() ?? "",
      guests._count,
      guests._max.updatedAt?.toISOString() ?? "",
      stock._count,
      stock._max.updatedAt?.toISOString() ?? "",
      products._count,
      products._max.updatedAt?.toISOString() ?? "",
      prices._count,
      prices._max.createdAt?.toISOString() ?? "",
      closing._count,
      closing._max.createdAt?.toISOString() ?? "",
    ].join("|");

    return NextResponse.json(
      { v },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch {
    return NextResponse.json({ v: "err" }, { status: 500 });
  }
}
