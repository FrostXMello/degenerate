import { PrismaClient } from "@prisma/client";
import {
  bottlesFromVolume,
  liquorVolumeFromPegs,
  pegsFromVolume,
  stockLevel,
} from "../src/lib/stock-math";

const prisma = new PrismaClient();

async function main() {
  const products = await prisma.product.findMany({ include: { stock: true }, orderBy: { sortOrder: "asc" } });
  const expected = [
    ["jameson", 17, 12750],
    ["red-label", 10, 7500],
    ["absolut", 17, 12750],
    ["smirnoff-plain", 17, 12750],
    ["smirnoff-mango", 5, 3750],
    ["smirnoff-minty-jamun", 10, 7500],
  ] as const;

  for (const [slug, bottles, volume] of expected) {
    const product = products.find((p) => p.slug === slug);
    if (!product) throw new Error(`Missing ${slug}`);
    if (product.trackingType !== "LIQUOR") throw new Error(`${slug} should be liquor`);
    if (product.pegSizeMl !== 30) throw new Error(`${slug} peg size`);
    if (product.bottleSizeMl !== 750) throw new Error(`${slug} bottle size`);
    if (product.initialBottles !== bottles) throw new Error(`${slug} initial bottles`);
    if (product.stock?.estimatedVolumeMl !== volume) throw new Error(`${slug} volume`);
  }

  const heineken = products.find((p) => p.slug === "heineken");
  const kingfisher = products.find((p) => p.slug === "kingfisher");
  if (!heineken || heineken.stock?.estimatedUnits !== 96 || heineken.sizeMl !== 500) {
    throw new Error("Heineken seed mismatch");
  }
  if (!kingfisher || kingfisher.stock?.estimatedUnits !== 120 || kingfisher.sizeMl !== null) {
    throw new Error("Kingfisher seed mismatch");
  }

  const consumed = liquorVolumeFromPegs(3, 30);
  if (consumed !== 90) throw new Error("3 pegs should be 90 ml");
  const remaining = 12750 - consumed;
  if (remaining !== 12660) throw new Error("Jameson remaining volume");
  if (Number(bottlesFromVolume(remaining, 750).toFixed(2)) !== 16.88) throw new Error("bottle display");
  if (Math.round(pegsFromVolume(remaining, 30)) !== 422) throw new Error("peg display");
  if (stockLevel(-0.2, 4, 1) !== "EXCEEDED") throw new Error("negative stock should warn, not block");
  if (stockLevel(0, 4, 1) !== "OUT") throw new Error("zero stock status");

  console.log("Seed and calculation checks passed.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
