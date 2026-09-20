import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { parseJson } from "@/lib/utils";
import { ProductManager, type ProductRow } from "./product-manager";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default async function AdminProductsPage() {
  const products = await db.product.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { orders: true, licenseKeys: true } } },
  });

  const rows: ProductRow[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    priceCents: p.priceCents,
    currency: p.currency,
    interval: p.interval,
    features: parseJson<string[]>(p.features, []),
    active: p.active,
    orders: p._count.orders,
    keys: p._count.licenseKeys,
  }));

  return (
    <>
      <PageHeader
        title="Products"
        description="Manage the plans you sell."
      />
      <ProductManager products={rows} />
    </>
  );
}
