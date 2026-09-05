import { PrismaClient, TrackingType, UserRole, GuestType } from "@prisma/client";
import bcrypt from "bcryptjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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

type GuestSeed = {
  name: string;
  phone: string | null;
  email: string | null;
  reg_no: string | null;
  guest_type: string;
  cover_charge: number;
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

/** Cash/UPI + coupon (×50) unit prices */
const PRICE_TABLE: Record<string, { cash: number; coupon: number }> = {
  kingfisher: { cash: 269, coupon: 300 },
  heineken: { cash: 299, coupon: 300 },
  "red-label": { cash: 219, coupon: 250 },
  jameson: { cash: 279, coupon: 300 },
  "smirnoff-plain": { cash: 119, coupon: 150 },
  "smirnoff-minty-jamun": { cash: 169, coupon: 200 },
  "smirnoff-mango": { cash: 169, coupon: 200 },
  absolut: { cash: 219, coupon: 250 },
};

function normalizePhone(phone: string | null | undefined) {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, "");
  return digits || null;
}

function mapGuestType(raw: string): GuestType {
  if (raw === "paid" || raw === "paid_verified") return GuestType.PAID;
  if (raw === "backstage_special" || raw === "backstage") return GuestType.BACKSTAGE;
  return GuestType.REGULAR;
}

function defaultCover(type: GuestType, cover: number | null | undefined) {
  if (typeof cover === "number") return cover;
  return type === GuestType.REGULAR ? 1000 : 0;
}

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
      canAddGateEntries: true,
      canRemoveGateEntries: false,
    },
    create: {
      username: "gate1",
      name: "Gate 1",
      passwordHash: gateHash,
      role: UserRole.GATE_STAFF,
      active: true,
      canAddGateEntries: true,
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

  const foodHash = await bcrypt.hash("food456", 10);
  const foodStaff = [
    { username: "food1", name: "Food 1" },
    { username: "food2", name: "Food 2" },
    { username: "food3", name: "Food 3" },
  ];
  for (const staff of foodStaff) {
    await prisma.user.upsert({
      where: { username: staff.username },
      update: {
        name: staff.name,
        passwordHash: foodHash,
        role: UserRole.FOOD_STAFF,
        active: true,
        canAddFoodItems: true,
        canRemoveFoodItems: true,
        canChangeFoodPrices: true,
        canVoidFoodOrders: true,
      },
      create: {
        username: staff.username,
        name: staff.name,
        passwordHash: foodHash,
        role: UserRole.FOOD_STAFF,
        active: true,
        canAddFoodItems: true,
        canRemoveFoodItems: true,
        canChangeFoodPrices: true,
        canVoidFoodOrders: true,
      },
    });
  }

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

  // Apply / refresh cash + coupon prices
  for (const [slug, amounts] of Object.entries(PRICE_TABLE)) {
    const product = await prisma.product.findUnique({ where: { slug } });
    if (!product) continue;
    await prisma.price.updateMany({
      where: { productId: product.id, active: true },
      data: { active: false },
    });
    await prisma.price.create({
      data: {
        productId: product.id,
        price: amounts.cash,
        couponPrice: amounts.coupon,
        active: true,
      },
    });
  }
  console.log(`Prices set for ${Object.keys(PRICE_TABLE).length} drinks`);

  // Guest list seed (idempotent by phone / regNo / name)
  const guestPath = join(__dirname, "guest-list.json");
  const guests = JSON.parse(readFileSync(guestPath, "utf8").replace(/^\uFEFF/, "")) as GuestSeed[];
  for (const g of guests) {
    const phone = normalizePhone(g.phone);
    const email = g.email?.trim() || null;
    const regNo = g.reg_no?.trim() || null;
    const guestType = mapGuestType(g.guest_type);
    const coverCharge = defaultCover(guestType, g.cover_charge);

    const existing =
      (phone
        ? await prisma.guestListEntry.findFirst({ where: { phone } })
        : null) ||
      (regNo
        ? await prisma.guestListEntry.findFirst({ where: { regNo } })
        : null) ||
      (await prisma.guestListEntry.findFirst({
        where: { name: g.name, phone: phone, regNo: regNo },
      }));

    if (existing) {
      await prisma.guestListEntry.update({
        where: { id: existing.id },
        data: {
          name: g.name,
          phone,
          email,
          regNo,
          guestType,
          coverCharge,
          coverCollected: guestType !== GuestType.REGULAR ? true : existing.coverCollected,
        },
      });
    } else {
      await prisma.guestListEntry.create({
        data: {
          name: g.name,
          phone,
          email,
          regNo,
          guestType,
          coverCharge,
          coverCollected: guestType !== GuestType.REGULAR,
        },
      });
    }
  }
  console.log(`Guest list seeded: ${guests.length} entries`);
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
