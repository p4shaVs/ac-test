import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getUserOverview, detectionTypeLabel } from "@/lib/stats";
import { StatCard, Card, PageHeader, EmptyState, LinkButton, StatusBadge, Badge } from "@/components/ui";
import { AreaTrend, DonutChart } from "@/components/charts";
import { DONUT_PALETTE } from "@/lib/palette";
import { Icons } from "@/components/icons";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const user = (await getCurrentUser())!;

  const servers = await db.server.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
  });
  const serverIds = servers.map((s) => s.id);
  const overview = await getUserOverview(serverIds);

  // Son aktivite: en yeni tespitler
  const recent = serverIds.length
    ? await db.detection.findMany({
        where: { serverId: { in: serverIds } },
        orderBy: { createdAt: "desc" },
        take: 6,
      })
    : [];

  const hasServers = servers.length > 0;

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.username} 👋`}
        description="Overall status of your servers and activity over the last 24 hours."
        actions={
          <LinkButton href="/dashboard/redeem" icon="gift" variant="secondary">
            Redeem key
          </LinkButton>
        }
      />

      {!hasServers ? (
        <EmptyState
          icon="server"
          title="You have no servers yet"
          description="Activate a licence key to protect your first server."
          action={
            <div className="flex gap-2">
              <LinkButton href="/dashboard/redeem" icon="gift">
                Redeem key
              </LinkButton>
              <LinkButton href="/pricing" variant="secondary" icon="cart">
                Buy a licence
              </LinkButton>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* Stat kartları */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Active servers"
              value={`${overview.onlineServers}/${overview.serverCount}`}
              icon="server"
              accent="brand"
              sub="online"
            />
            <StatCard
              label="Total players"
              value={overview.totalPlayers.toLocaleString("en-US")}
              icon="users"
              accent="violet"
            />
            <StatCard
              label="Total bans"
              value={overview.totalBans}
              icon="ban"
              accent="rose"
              sub={`${overview.activeBans} active`}
            />
            <StatCard
              label="Online now"
              value={overview.onlinePlayers}
              icon="activity"
              accent="emerald"
            />
          </div>

          {/* Grafik + tespit donut */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Activity analytics</h3>
                  <p className="text-xs text-slate-500">Last 24 hours — detections & bans</p>
                </div>
                <Badge tone="blue" dot>
                  Live
                </Badge>
              </div>
              <AreaTrend data={overview.series} />
            </Card>

            <Card>
              <div className="mb-2 flex items-center gap-2">
                <Icons.shield size={16} className="text-brand-300" />
                <h3 className="text-sm font-semibold text-white">Detections</h3>
              </div>
              <p className="mb-3 text-xs text-slate-500">Last 24 hours</p>
              {overview.detectionsByType.length ? (
                <>
                  <DonutChart
                    data={overview.detectionsByType}
                    centerValue={overview.detections24h}
                    centerLabel="detections"
                  />
                  <ul className="mt-4 space-y-2">
                    {overview.detectionsByType.slice(0, 5).map((d, i) => (
                      <li key={d.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-400">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }}
                          />
                          {d.name}
                        </span>
                        <span className="font-medium text-slate-200">{d.value}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="grid h-[200px] place-items-center text-center text-sm text-slate-500">
                  No detections in the last 24 hours
                </div>
              )}
            </Card>
          </div>

          {/* Sunucular + son aktivite */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">My Servers</h3>
                <Link href="/dashboard/servers" className="text-xs text-brand-300 hover:text-brand-200">
                  All →
                </Link>
              </div>
              <div className="space-y-2">
                {servers.map((s) => (
                  <Link
                    key={s.id}
                    href={`/dashboard/servers/${s.id}`}
                    className="flex items-center justify-between rounded-xl border border-white/5 bg-base-900/40 px-4 py-3 transition hover:border-brand-500/20 hover:bg-base-900/70"
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/5 text-brand-300">
                        <Icons.server size={18} />
                      </span>
                      <div>
                        <p className="text-sm font-medium text-slate-200">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.ip ?? "IP not set"}</p>
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </Link>
                ))}
              </div>
            </Card>

            <Card>
              <h3 className="mb-4 text-sm font-semibold text-white">Recent detections</h3>
              {recent.length ? (
                <ul className="space-y-3">
                  {recent.map((d) => (
                    <li key={d.id} className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-300">
                        <Icons.warn size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-slate-200">{d.playerName}</p>
                        <p className="text-xs text-slate-500">
                          {detectionTypeLabel(d.type)} · {timeAgo(d.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-slate-500">No activity</p>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
}
