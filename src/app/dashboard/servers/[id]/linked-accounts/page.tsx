import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

// Ban atlatma tespiti: aynı IP'den bağlanan BİRDEN FAZLA farklı hesap (license)
// şüphelidir — biri banlanıp yeni hesapla dönme (alt account) klasik örüntüsü.
// NOT: paylaşımlı ağlar (okul/işyeri/mobil operatör CGNAT) yanlış eşleşme
// yaratabilir; bu yüzden ban ATMAZ, yalnızca incelemen için gruplayıp gösterir.
export default async function LinkedAccountsPage({
  params,
}: {
  params: { id: string };
}) {
  const { server } = await getOwnedServer(params.id);

  const players = await db.player.findMany({
    where: { serverId: server.id, ip: { not: null } },
    select: {
      id: true, name: true, license: true, discord: true, ip: true,
      trustScore: true, online: true, lastSeenAt: true,
      bans: { where: { active: true }, select: { id: true }, take: 1 },
    },
    orderBy: { lastSeenAt: "desc" },
  });

  const byIp = new Map<string, typeof players>();
  for (const p of players) {
    if (!p.ip) continue;
    const list = byIp.get(p.ip) ?? [];
    list.push(p);
    byIp.set(p.ip, list);
  }

  const groups = [...byIp.entries()]
    .filter(([, list]) => list.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  return (
    <>
      <PageHeader
        title="Linked Accounts"
        description="Multiple accounts connecting from one IP — a possible ban-evasion alt. Nothing is done automatically; it is listed for you to review."
      />

      {groups.length === 0 ? (
        <EmptyState
          icon="link"
          title="No linked accounts"
          description="Accounts that share an IP address are grouped here."
        />
      ) : (
        <div className="space-y-4">
          {groups.map(([ip, list]) => {
            const hasBanned = list.some((p) => p.bans.length > 0);
            return (
              <div key={ip} className="overflow-hidden rounded-2xl border border-white/5 bg-base-850/60">
                <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Icons.link size={15} className="text-slate-500" />
                    <span className="font-mono text-sm text-slate-300">{ip}</span>
                    <Badge tone="violet">{list.length} hesap</Badge>
                  </div>
                  {hasBanned && (
                    <Badge tone="red" dot>
                      Includes a banned account
                    </Badge>
                  )}
                </div>
                <div className="divide-y divide-white/5">
                  {list.map((p) => (
                    <div key={p.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${p.online ? "bg-emerald-400" : "bg-slate-600"}`} />
                        <span className="truncate font-medium text-slate-200">{p.name}</span>
                        {p.discord && (
                          <span className="truncate font-mono text-xs text-slate-500">
                            {p.discord.replace("discord:", "")}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        {p.bans.length > 0 && <Badge tone="red">Banned</Badge>}
                        <span className="text-xs text-slate-500">Trust: {p.trustScore}</span>
                        <span className="text-xs text-slate-600">{formatDateTime(p.lastSeenAt)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
