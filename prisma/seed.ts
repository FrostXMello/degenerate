import { PrismaClient, TrackingType, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PEG_ML = 30;
const BOTTLE_ML = 750;

type LiquorSeed = {
  name: string;
  fullName: string;
  slug: string;
  bottles: number;
  bottleSizeMl?: number;
};

type BeerSeed = {
  name: string;
  fullName: string;
  slug: string;
  units: number;
  sizeMl: number | null;
};

const liquor: LiquorSeed[] = [
  { name: "Jameson", fullName: "Jameson Irish Whiskey", slug: "jameson", bottles: 17 },
  { name: "Red Label", fullName: "Johnnie Walker Red Label", slug: "red-label", bottles: 10 },
  { name: "Absolut", fullName: "Absolut Vodka", slug: "absolut", bottles: 17 },
  { name: "Smirnoff Plain", fullName: "Smirnoff Triple Distilled Vodka", slug: "smirnoff-plain", bottles: 17 },
  { name: "Smirnoff Mango", fullName: "Smirnoff Mango", slug: "smirnoff-mango", bottles: 5 },
  { name: "Smirnoff Minty Jamun", fullName: "Smirnoff Minty Jamun", slug: "smirnoff-minty-jamun", bottles: 10 },
];

const beer: BeerSeed[] = [
  { name: "Heineken", fullName: "Heineken", slug: "heineken", units: 96, sizeMl: 500 },
  { name: "Kingfisher", fullName: "Kingfisher", slug: "kingfisher", units: 120, sizeMl: null },
];

async function main() {
  const adminHash = await bcrypt.hash("admin6969", 10);
  const barHash = await bcrypt.hash("bar456", 10);

  await prisma.user.upsert({
    where: { username: "admin" },
    update: {
      active: true,
      role: UserRole.ADMIN,
      passwordHash: adminHash,
      name: "Admin",
    },
    create: {
      username: "admin",
      name: "Admin",
      passwordHash: adminHash,
      role: UserRole.ADMIN,
      active: true,
    },
  });

  const barStaff = [
    { username: "bar1", name: "Bar 1" },
    { username: "bar2", name: "Bar 2" },
    { username: "bar3", name: "Bar 3" },
    { username: "bar4", name: "Bar 4" },
  ];

  for (const staff of barStaff) {
    await prisma.user.upsert({
      where: { username: staff.username },
      update: {
        name: staff.name,
        passwordHash: barHash,
        role: UserRole.BAR_OPERATOR,
        active: true,
      },
      create: {
        username: staff.username,
        name: staff.name,
        passwordHash: barHash,
        role: UserRole.BAR_OPERATOR,
        active: true,
      },
    });
  }

  const gateHash = await bcrypt.hash("gate456", 10);
  await prisma.user.upsert({
    where: { username: "gate1" },
    update: {
      name: "Gate 1",
      passwordHash: gateHash,
      role: UserRole.GATE_STAFF,
      active: true,
      canAddGateEntries: false,
      canRemoveGateEntries: false,
    },
    create: {
      username: "gate1",
      name: "Gate 1",
      passwordHash: gateHash,
      role: UserRole.GATE_STAFF,
      active: true,
      canAddGateEntries: false,
      canRemoveGateEntries: false,
    },
  });
  await prisma.user.upsert({
    where: { username: "gate2" },
    update: {
      name: "Gate 2",
      passwordHash: gateHash,
      role: UserRole.GATE_STAFF,
      active: true,
      canAddGateEntries: true,
      canRemoveGateEntries: false,
    },
    create: {
      username: "gate2",
      name: "Gate 2",
      passwordHash: gateHash,
      role: UserRole.GATE_STAFF,
      active: true,
      canAddGateEntries: true,
      canRemoveGateEntries: false,
    },
  });

  let sort = 0;
  for (const item of liquor) {
    const bottleSizeMl = item.bottleSizeMl ?? BOTTLE_ML;
    const volumeMl = item.bottles * bottleSizeMl;
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {},
      create: {
        name: item.name,
        fullName: item.fullName,
        slug: item.slug,
        category: "LIQUOR",
        trackingType: TrackingType.LIQUOR,
        bottleSizeMl,
        pegSizeMl: PEG_ML,
        sizeMl: bottleSizeMl,
        sortOrder: sort++,
        initialBottles: item.bottles,
        initialVolumeMl: volumeMl,
        lowThreshold: 4,
        veryLowThreshold: 1,
      },
    });

    await prisma.stock.upsert({
      where: { productId: product.id },
      update: {},
      create: {
        productId: product.id,
        estimatedVolumeMl: volumeMl,
        estimatedUnits: null,
      },
    });
  }

  for (const item of beer) {
    const product = await prisma.product.upsert({
      where: { slug: item.slug },
      update: {},
      create: {
        name: item.name,
        fullName: item.fullName,
        slug: item.slug,
        category: "BEER",
        trackingType: TrackingType.BEER,
        bottleSizeMl: null,
        pegSizeMl: null,
        sizeMl: item.sizeMl,
        sortOrder: sort++,
        initialUnits: item.units,
        lowThreshold: 24,
        veryLowThreshold: 8,
      },
    });

    await prisma.stock.upsert({
      where: { productId: product.id },
      update: {},
      create: {
        productId: product.id,
        estimatedVolumeMl: null,
        estimatedUnits: item.units,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
