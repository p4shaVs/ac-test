import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader, StatCard } from "@/components/ui";
import { formatMoney } from "@/lib/utils";
import { OrdersManager, type OrderRow, type SaleProduct } from "./orders-manager";

export const metadata: Metadata = { title: "Orders" };
export const dynamic = "force-dynamic";

export default async function AdminOrdersPage() {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [orders, products, paid30, refunded30] = await Promise.all([
    db.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        user: { select: { username: true, email: true } },
        product: { select: { name: true } },
        licenseKey: { select: { key: true, status: true } },
      },
    }),
    db.product.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.order.aggregate({
      where: { status: "PAID", createdAt: { gte: since30 } },
      _sum: { amountCents: true },
      _count: true,
    }),
    db.order.count({ where: { status: "REFUNDED", createdAt: { gte: since30 } } }),
  ]);

  const rows: OrderRow[] = orders.map((o) => ({
    id: o.id,
    createdAt: o.createdAt.toISOString(),
    customer: o.user.username,
    email: o.user.email,
    product: o.product.name,
    amountCents: o.amountCents,
    currency: o.currency,
    status: o.status,
    provider: o.provider,
    reference: o.externalRef,
    key: o.licenseKey?.key ?? null,
    keyStatus: o.licenseKey?.status ?? null,
  }));

  const saleProducts: SaleProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    priceCents: p.priceCents,
    currency: p.currency,
    interval: p.interval,
  }));

  return (
    <>
      <PageHeader
        title="Orders"
        description="Sales closed on Discord. Recording one puts a licence key straight onto the customer's account."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Revenue · 30 days" value={formatMoney(paid30._sum.amountCents ?? 0)} icon="chart" accent="emerald" />
        <StatCard label="Sales · 30 days" value={paid30._count} icon="cart" accent="brand" />
        <StatCard label="Refunds · 30 days" value={refunded30} icon="history" accent="amber" />
      </div>
      <OrdersManager orders={rows} products={saleProducts} />
    </>
  );
}
