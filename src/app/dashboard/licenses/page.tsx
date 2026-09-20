import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, Badge, LinkButton } from "@/components/ui";
import { SecretField } from "@/components/copy-button";
import { Icons } from "@/components/icons";
import { featureLabel } from "@/lib/features";
import { parseJson, formatDate, relativeDays } from "@/lib/utils";
import { ActivateLicense } from "./activate";

export const metadata: Metadata = { title: "My Licences" };
export const dynamic = "force-dynamic";

export default async function LicensesPage() {
  const user = (await getCurrentUser())!;
  const keys = await db.licenseKey.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: { product: true, servers: { select: { id: true, name: true } } },
  });

  return (
    <>
      <PageHeader
        title="My Licences"
        description="Licence keys you have bought or been assigned."
        actions={
          <LinkButton href="/pricing" icon="cart" variant="secondary">
            New licence
          </LinkButton>
        }
      />

      {keys.length === 0 ? (
        <EmptyState
          icon="key"
          title="You have no licences yet"
          description="Buy a plan, or activate a code you already have under Redeem Key."
          action={
            <div className="flex gap-2">
              <LinkButton href="/pricing" icon="cart">
                Buy a licence
              </LinkButton>
              <LinkButton href="/dashboard/redeem" variant="secondary" icon="gift">
                Redeem key
              </LinkButton>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {keys.map((k) => {
            const features = parseJson<string[]>(k.features, []);
            const usable = k.status === "UNUSED" || k.status === "ACTIVE";
            const canCreate = k.servers.length < k.maxServers && usable;
            return (
              <Card key={k.id} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {k.product?.name ?? "Custom Licence"}
                      </span>
                      <StatusBadge status={k.status} />
                      <Badge tone="gray">
                        <Icons.server size={12} />
                        {k.servers.length}/{k.maxServers} sunucu
                      </Badge>
                    </div>

                    <div className="max-w-xl">
                      <SecretField value={k.key} />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {features.length ? (
                        features.map((f) => (
                          <span
                            key={f}
                            className="rounded-md bg-white/5 px-2 py-1 text-[11px] text-slate-400 ring-1 ring-inset ring-white/10"
                          >
                            {featureLabel(f)}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500">No features set</span>
                      )}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
                      <span>Createma: {formatDate(k.createdAt)}</span>
                      <span>
                        Expires:{" "}
                        <span className="text-slate-300">{relativeDays(k.expiresAt)}</span>
                      </span>
                      {k.servers.length > 0 && (
                        <span>
                          Servers:{" "}
                          {k.servers.map((s) => s.name).join(", ")}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {canCreate ? (
                      <ActivateLicense licenseKeyId={k.id} />
                    ) : k.servers.length > 0 ? (
                      <LinkButton
                        href={`/dashboard/servers/${k.servers[0].id}`}
                        variant="secondary"
                      >
                        Open server
                      </LinkButton>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
