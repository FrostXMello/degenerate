import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getProducts } from "@/lib/data";
import { OrderDetail } from "@/components/OrderDetail";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, products] = await Promise.all([
    prisma.order.findUnique({
      where: { id },
      include: { items: true, createdBy: true, voidedBy: true },
    }),
    getProducts(true),
  ]);
  if (!order) notFound();

  return (
    <OrderDetail
      products={products}
      order={{
        id: order.id,
        orderNumber: order.orderNumber,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        createdByName: order.createdBy?.name ?? null,
        voidedByName: order.voidedBy?.name ?? null,
        voidReason: order.voidReason,
        voidedAt: order.voidedAt?.toISOString() ?? null,
        items: order.items.map((item) => ({
          productId: item.productId,
          name: item.productNameSnapshot,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
        })),
      }}
    />
  );
}
