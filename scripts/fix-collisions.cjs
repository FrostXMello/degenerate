const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const prisma = new PrismaClient();
const incoming = JSON.parse(fs.readFileSync("scripts/_incoming-guests.json", "utf8"));

function normalizePhone(p) {
  if (!p) return null;
  const d = String(p).replace(/[^\d]/g, "");
  return d || null;
}
function mapType(g) {
  if (g.guest_type === "backstage_special" || g.entry_status === "special_table") return "BACKSTAGE";
  if (g.entry_status === "paid_verified" || g.guest_type === "paid") return "PAID";
  return "REGULAR";
}
function normalize(g) {
  const guestType = mapType(g);
  return {
    name: String(g.name).trim(),
    phone: normalizePhone(g.phone),
    email: g.email ? String(g.email).trim() : null,
    regNo: g.reg_no ? String(g.reg_no).trim() : null,
    guestType,
    coverCharge: guestType === "REGULAR" ? (g.cover_charge ?? 1000) : 0,
  };
}
function fingerprint(n) {
  const name = n.name.toLowerCase();
  if (n.phone) return `pn:${name}:${n.phone}`;
  if (n.regNo) return `rn:${name}:${n.regNo.toUpperCase()}`;
  if (n.email) return `en:${name}:${n.email.toLowerCase()}`;
  return `n:${name}`;
}
function findExisting(n, all) {
  const name = n.name.toLowerCase();
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
    const byEmail = all.find((x) => (x.email || "").toLowerCase() === n.email.toLowerCase());
    if (byEmail) return byEmail;
  }
  if (n.phone) {
    const phoneHits = all.filter((x) => normalizePhone(x.phone) === n.phone);
    if (phoneHits.length === 1) return phoneHits[0];
  }
  if (n.regNo) {
    const regHits = all.filter((x) => (x.regNo || "").toUpperCase() === n.regNo.toUpperCase());
    if (regHits.length === 1) return regHits[0];
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
  const uniq = new Map();
  for (const raw of incoming) uniq.set(fingerprint(normalize(raw)), normalize(raw));
  const unique = [...uniq.values()];
  let existing = await prisma.guestListEntry.findMany();
  const matchedIds = new Map();
  const collisions = [];
  const missing = [];
  for (const n of unique) {
    const hit = findExisting(n, existing);
    if (!hit) missing.push(n);
    else if (matchedIds.has(hit.id)) {
      collisions.push({
        first: matchedIds.get(hit.id),
        second: n,
        db: { id: hit.id, name: hit.name, phone: hit.phone, regNo: hit.regNo, email: hit.email },
      });
    } else matchedIds.set(hit.id, n);
  }
  console.log(JSON.stringify({ unique: unique.length, db: existing.length, missing, collisions }, null, 2));

  const toCreate = [...missing, ...collisions.map((c) => c.second)];
  for (const n of toCreate) {
    const created = await prisma.guestListEntry.create({
      data: {
        name: n.name,
        phone: n.phone,
        email: n.email,
        regNo: n.regNo,
        guestType: n.guestType,
        coverCharge: n.coverCharge,
        coverCollected: n.guestType !== "REGULAR",
      },
    });
    existing.push(created);
    console.log("CREATED", n.name, n.guestType, n.phone || n.regNo || n.email);
  }

  // Sync JSON
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

  const byType = await prisma.guestListEntry.groupBy({ by: ["guestType"], _count: true });
  console.log(JSON.stringify({ total: all.length, byType, created: toCreate.length }, null, 2));
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
