const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const rows = await p.guestListEntry.findMany({
    where: {
      OR: [
        { name: { contains: "Kevin" } },
        { name: { contains: "Akshita" } },
        { regNo: "2503130025" },
      ],
    },
  });
  console.log(JSON.stringify(rows, null, 2));
  console.log("total", await p.guestListEntry.count());
  await p.$disconnect();
})();
