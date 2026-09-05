const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const p = new PrismaClient();

(async () => {
  // Deduplicate exact Akshita duplicates — keep oldest
  const akshitas = await p.guestListEntry.findMany({
    where: { name: "Akshita Gupta" },
    orderBy: { createdAt: "asc" },
  });
  if (akshitas.length > 1) {
    const [, ...dupes] = akshitas;
    for (const d of dupes) {
      await p.guestListEntry.delete({ where: { id: d.id } });
      console.log("deleted dupe Akshita", d.id);
    }
  }

  let kevin = await p.guestListEntry.findFirst({ where: { name: "Kevin Dhuria" } });
  if (!kevin) {
    kevin = await p.guestListEntry.create({
      data: {
        name: "Kevin Dhuria",
        phone: "9992300606",
        email: "kevin.2503130025@muj.manipal.edu",
        regNo: "2503130025",
        guestType: "PAID",
        coverCharge: 0,
        coverCollected: true,
      },
    });
    console.log("created Kevin", kevin.id);
  } else {
    console.log("kevin exists", kevin.id);
  }

  const all = await p.guestListEntry.findMany({
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

  const byType = await p.guestListEntry.groupBy({ by: ["guestType"], _count: true });
  console.log(JSON.stringify({ total: all.length, byType }, null, 2));
  await p.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await p.$disconnect();
  process.exit(1);
});
