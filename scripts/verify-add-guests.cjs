const { PrismaClient, GuestType } = require("@prisma/client");
const fs = require("fs");

const prisma = new PrismaClient();
const incoming = JSON.parse(
  fs.readFileSync("scripts/_incoming-guests.json", "utf8").replace(/^\uFEFF/, ""),
);

function normalizePhone(p) {
  if (!p) return null;
  const d = String(p).replace(/[^\d]/g, "");
  return d || null;
}

function mapType(g) {
  if (g.guest_type === "backstage_special" || g.entry_status === "special_table") {
    return GuestType.BACKSTAGE;
  }
  if (g.entry_status === "paid_verified" || g.guest_type === "paid") {
    return GuestType.PAID;
  }
  return GuestType.REGULAR;
}

function coverFor(type, cover) {
  if (typeof cover === "number") return cover;
  return type === GuestType.REGULAR ? 1000 : 0;
}

function fingerprint(n) {
  const name = n.name.toLowerCase();
  // Include name so two people sharing a phone/reg stay distinct
  if (n.phone) return `pn:${name}:${n.phone}`;
  if (n.regNo) return `rn:${name}:${n.regNo.toUpperCase()}`;
  if (n.email) return `en:${name}:${n.email.toLowerCase()}`;
  return `n:${name}`;
}

function normalize(g) {
  const guestType = mapType(g);
  return {
    name: String(g.name).trim(),
    phone: normalizePhone(g.phone),
    email: g.email ? String(g.email).trim() : null,
    regNo: g.reg_no || g.regNo ? String(g.reg_no || g.regNo).trim() : null,
    guestType,
    coverCharge: coverFor(guestType, g.cover_charge),
  };
}

function findExisting(n, all) {
  const name = n.name.toLowerCase();
  // Never match on phone/reg alone across different names
  if (n.phone) {
    const byPhoneName = all.find(
      (x) => normalizePhone(x.phone) === n.phone && x.name.trim().toLowerCase() === name,
    );
    if (byPhoneName) return byPhoneName;
  }
  if (n.regNo) {
    const byRegName = all.find(
      (x) =>
        (x.regNo || "").toUpperCase() === n.regNo.toUpperCase() &&
        x.name.trim().toLowerCase() === name,
    );
    if (byRegName) return byRegName;
  }
  if (n.email) {
    const byEmail = all.find(
      (x) =>
        (x.email || "").toLowerCase() === n.email.toLowerCase() &&
        x.name.trim().toLowerCase() === name,
    );
    if (byEmail) return byEmail;
  }
  return (
    all.find(
      (x) =>
        x.name.trim().toLowerCase() === name &&
        normalizePhone(x.phone) === n.phone &&
        (x.regNo || null) === n.regNo,
    ) || null
  );
}

(async () => {
  const uniqMap = new Map();
  for (const raw of incoming) {
    const n = normalize(raw);
    uniqMap.set(fingerprint(n), n);
  }
  const unique = [...uniqMap.values()];

  let existing = await prisma.guestListEntry.findMany();
  let added = 0;
  let present = 0;
  const addedNames = [];

  for (const n of unique) {
    const hit = findExisting(n, existing);
    if (hit) {
      await prisma.guestListEntry.update({
        where: { id: hit.id },
        data: {
          name: n.name,
          phone: n.phone ?? hit.phone,
          email: n.email ?? hit.email,
          regNo: n.regNo ?? hit.regNo,
          guestType: n.guestType,
          coverCharge: n.coverCharge,
          coverCollected: n.guestType !== GuestType.REGULAR ? true : hit.coverCollected,
        },
      });
      Object.assign(hit, {
        name: n.name,
        phone: n.phone ?? hit.phone,
        email: n.email ?? hit.email,
        regNo: n.regNo ?? hit.regNo,
      });
      present++;
      continue;
    }

    const created = await prisma.guestListEntry.create({
      data: {
        name: n.name,
        phone: n.phone,
        email: n.email,
        regNo: n.regNo,
        guestType: n.guestType,
        coverCharge: n.coverCharge,
        coverCollected: n.guestType !== GuestType.REGULAR,
      },
    });
    existing.push(created);
    added++;
    addedNames.push(n.name);
  }

  const total = await prisma.guestListEntry.count();
  const byType = await prisma.guestListEntry.groupBy({ by: ["guestType"], _count: true });
  const all = await prisma.guestListEntry.findMany({
    orderBy: [{ guestType: "asc" }, { name: "asc" }],
  });
  fs.writeFileSync(
    "prisma/guest-list.json",
    JSON.stringify(
      all.map((g) => ({
        name: g.name,
        phone: g.phone,
        email: g.email,
        reg_no: g.regNo,
        guest_type:
          g.guestType === "PAID" ? "paid" : g.guestType === "BACKSTAGE" ? "backstage_special" : "regular",
        cover_charge: g.coverCharge,
      })),
      null,
      2,
    ) + "\n",
  );

  console.log(
    JSON.stringify(
      {
        incomingRaw: incoming.length,
        uniqueIncoming: unique.length,
        alreadyPresent: present,
        newlyAdded: added,
        addedNames,
        totalInDb: total,
        byType,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
