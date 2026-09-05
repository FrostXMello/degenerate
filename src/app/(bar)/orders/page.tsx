import { prisma } from "@/lib/prisma";
import { OrdersBrowser } from "@/components/OrdersBrowser";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const [orders, products] = await Promise.all([
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
        createdBy: true,
      },
    }),
    prisma.product.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <OrdersBrowser
      products={products}
      orders={orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        paymentMethod: order.paymentMethod,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        createdByName: order.createdBy?.name ?? null,
        voidReason: order.voidReason,
        items: order.items.map((item) => ({
          productId: item.productId,
          name: item.productNameSnapshot,
          quantity: item.quantity,
          unit: item.unit,
        })),
      }))}
    />
  );
}
