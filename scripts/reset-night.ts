import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.closingLine.deleteMany();
  await prisma.closingReport.deleteMany();
  await prisma.price.deleteMany();

  const products = await prisma.product.findMany();
  for (const product of products) {
    await prisma.stock.update({
      where: { productId: product.id },
      data: {
        estimatedVolumeMl: product.initialVolumeMl,
        estimatedUnits: product.initialUnits,
      },
    });
  }

  console.log("Operational data cleared. Stock restored to opening inventory.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
