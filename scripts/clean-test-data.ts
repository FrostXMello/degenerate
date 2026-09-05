/**
 * One-shot cleanup after testing:
 * - clear all door check-ins
 * - delete all orders
 * - reset stock to opening amounts
 * - clear closing reports / stock adjustments from orders night
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [guestsCleared, passesCleared, ordersDeleted, closingsDeleted, adjDeleted] =
    await prisma.$transaction([
      prisma.guestListEntry.updateMany({
        data: { checkedInAt: null, checkedInById: null, coverCollected: false },
      }),
      prisma.offlinePass.updateMany({
        data: { checkedInAt: null, checkedInById: null },
      }),
      prisma.order.deleteMany({}),
      prisma.closingReport.deleteMany({}),
      prisma.stockAdjustment.deleteMany({}),
    ]);

  // Paid / backstage don't owe cover — mark coverCollected true again for those
  await prisma.guestListEntry.updateMany({
    where: { guestType: { in: ["PAID", "BACKSTAGE"] } },
    data: { coverCollected: true },
  });

  const products = await prisma.product.findMany({
    select: {
      id: true,
      trackingType: true,
      initialVolumeMl: true,
      initialUnits: true,
    },
  });

  for (const p of products) {
    await prisma.stock.upsert({
      where: { productId: p.id },
      update: {
        estimatedVolumeMl: p.trackingType === "LIQUOR" ? (p.initialVolumeMl ?? 0) : null,
        estimatedUnits: p.trackingType === "BEER" ? (p.initialUnits ?? 0) : null,
      },
      create: {
        productId: p.id,
        estimatedVolumeMl: p.trackingType === "LIQUOR" ? (p.initialVolumeMl ?? 0) : null,
        estimatedUnits: p.trackingType === "BEER" ? (p.initialUnits ?? 0) : null,
      },
    });
  }

  const guestCount = await prisma.guestListEntry.count();
  const orderCount = await prisma.order.count();
  const inCount = await prisma.guestListEntry.count({ where: { checkedInAt: { not: null } } });

  console.log(
    JSON.stringify({
      guestsCleared: guestsCleared.count,
      passesCleared: passesCleared.count,
      ordersDeleted: ordersDeleted.count,
      closingsDeleted: closingsDeleted.count,
      adjustmentsDeleted: adjDeleted.count,
      stockReset: products.length,
      guestCount,
      orderCount,
      stillCheckedIn: inCount,
    }),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
