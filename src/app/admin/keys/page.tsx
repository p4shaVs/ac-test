import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { parseJson } from "@/lib/utils";
import { KeyManager, type KeyRow, type ProductOption } from "./key-manager";

export const metadata: Metadata = { title: "Licence Keys" };
export const dynamic = "force-dynamic";

export default async function AdminKeysPage() {
  const [keys, products] = await Promise.all([
    db.licenseKey.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        product: { select: { name: true } },
        owner: { select: { email: true, username: true } },
        _count: { select: { servers: true } },
      },
    }),
    db.product.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const rows: KeyRow[] = keys.map((k) => ({
    id: k.id,
    key: k.key,
    status: k.status,
    features: parseJson<string[]>(k.features, []),
    maxServers: k.maxServers,
    serverCount: k._count.servers,
    productName: k.product?.name ?? null,
    ownerEmail: k.owner?.email ?? null,
    ownerUsername: k.owner?.username ?? null,
    note: k.note,
    createdAt: k.createdAt.toISOString(),
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
  }));

  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    features: parseJson<string[]>(p.features, []),
  }));

  return (
    <>
      <PageHeader
        title="Licence Keys"
        description="Generate keys with the features you choose, assign them and manage their status."
      />
      <KeyManager keys={rows} products={productOptions} />
    </>
  );
}
