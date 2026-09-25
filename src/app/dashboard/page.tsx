import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { getUserOverview, detectionTypeLabel } from "@/lib/stats";
import { StatCard, Card, EmptyState, LinkButton, Badge } from "@/components/ui";
import { AreaTrend, DonutChart } from "@/components/charts";
import { DONUT_PALETTE } from "@/lib/palette";
import { Icons, type IconName } from "@/components/icons";
import { timeAgo, parseJson, cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

interface HealthItem {
  tone: "red" | "amber" | "blue";
  icon: IconName;
  title: string;
  text: string;
  href: string;
  cta: string;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const ACTION_TONE: Record<string, "red" | "amber" | "gray"> = { BAN: "red", KICK: "amber", LOG: "gray" };

export default async function DashboardHome() {
  const user = (await getCurrentUser())!;

  const servers = await db.server.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: { licenseKey: { select: { status: true, expiresAt: true } } },
  });
  const serverIds = servers.map((s) => s.id);
  const since = new Date(Date.now() - DAY);

  const [overview, recent, onlineByServer, detByServer, bans24h] = await Promise.all([
    getUserOverview(serverIds),
    serverIds.length
      ? db.detection.findMany({
          where: { serverId: { in: serverIds } },
          orderBy: { createdAt: "desc" },
          take: 7,
          include: { server: { select: { name: true } } },
        })
      : Promise.resolve([]),
    serverIds.length
      ? db.player.groupBy({ by: ["serverId"], where: { serverId: { in: serverIds }, online: true }, _count: true })
      : Promise.resolve([]),
    serverIds.length
      ? db.detection.groupBy({ by: ["serverId"], where: { serverId: { in: serverIds }, createdAt: { gte: since } }, _count: true })
      : Promise.resolve([]),
    serverIds.length ? db.ban.count({ where: { serverId: { in: serverIds }, createdAt: { gte: since } } }) : Promise.resolve(0),
  ]);

  const onlineMap = new Map(onlineByServer.map((r) => [r.serverId, r._count]));
  const detMap = new Map(detByServer.map((r) => [r.serverId, r._count]));

  // ---- Health checks: things the owner should act on, most urgent first.
  const health: HealthItem[] = [];
  const now = Date.now();
  for (const s of servers) {
    const base = `/dashboard/servers/${s.id}`;
    const lic = s.licenseKey;
    if (!lic || lic.status === "REVOKED" || lic.status === "SUSPENDED") {
      health.push({ tone: "red", icon: "key", title: `${s.name}: licence ${lic ? lic.status.toLowerCase() : "missing"}`, text: "The anti-cheat on this server is rejected by the panel until the licence is active again.", href: "/purchase", cta: "Get help" });
    } else if (lic.expiresAt && lic.expiresAt.getTime() < now) {
      health.push({ tone: "red", icon: "clock", title: `${s.name}: licence expired`, text: "Protection stopped when the licence expired. Renew it on Discord to turn it back on.", href: "/purchase", cta: "Renew" });
    } else if (lic.expiresAt && lic.expiresAt.getTime() - now < 7 * DAY) {
      const days = Math.max(1, Math.ceil((lic.expiresAt.getTime() - now) / DAY));
      health.push({ tone: "amber", icon: "clock", title: `${s.name}: licence ends in ${days} day${days === 1 ? "" : "s"}`, text: "Renew before it lapses so protection never stops.", href: "/purchase", cta: "Renew" });
    }
    if (!s.lastSeenAt) {
      health.push({ tone: "blue", icon: "download", title: `${s.name} has never connected`, text: "Run the one-click installer next to your server.cfg and restart the server.", href: "/dashboard/download", cta: "Install" });
    } else if (s.status !== "ONLINE" && now - s.lastSeenAt.getTime() > 10 * 60 * 1000) {
      health.push({ tone: "amber", icon: "server", title: `${s.name} is offline`, text: `Last heartbeat ${timeAgo(s.lastSeenAt)}. If the server is running, check coreac_api and coreac_token.`, href: `${base}/settings`, cta: "Check" });
    }
    const cfg = parseJson<{ ac?: { Settings?: { LogOnly?: boolean } } }>(s.config, {});
    if (cfg.ac?.Settings?.LogOnly === true) {
      health.push({ tone: "blue", icon: "shield", title: `${s.name}: Log-Only mode is on`, text: "Detections are recorded but nobody is kicked or banned.", href: `${base}/rules`, cta: "Review" });
    }
  }
  const order = { red: 0, amber: 1, blue: 2 };
  health.sort((a, b) => order[a.tone] - order[b.tone]);

  const hasServers = servers.length > 0;
  const allGood = hasServers && health.length === 0;

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-brand-600/25 via-base-850 to-purple-600/15 p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-purple-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-brand-200/80">{greeting()},</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{user.username}</h1>
            <div className="mt-4 flex flex-wrap gap-2">
              <HeroChip icon="server" tone={overview.onlineServers > 0 ? "green" : "gray"}>
                {overview.onlineServers}/{overview.serverCount} servers online
              </HeroChip>
              <HeroChip icon="users" tone="blue">{overview.onlinePlayers} players online</HeroChip>
              <HeroChip icon="shield" tone={overview.detections24h > 0 ? "amber" : "gray"}>
                {overview.detections24h} detections today
              </HeroChip>
              <HeroChip icon="ban" tone={bans24h > 0 ? "red" : "gray"}>{bans24h} bans today</HeroChip>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/dashboard/servers/new" icon="plus">Add server</LinkButton>
            <LinkButton href="/dashboard/download" icon="download" variant="secondary">Installer</LinkButton>
            <LinkButton href="/dashboard/redeem" icon="gift" variant="secondary">Redeem key</LinkButton>
          </div>
        </div>
      </section>

      {!hasServers ? (
        <EmptyState
          icon="server"
          title="You have no servers yet"
          description="Activate a licence key to protect your first server."
          action={
            <div className="flex gap-2">
              <LinkButton href="/dashboard/servers/new" icon="plus">Add a server</LinkButton>
              <LinkButton href="/purchase" variant="secondary" icon="cart">Buy a licence</LinkButton>
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {/* ------------------------------------------------------ health */}
          {allGood ? (
            <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-300">
                <Icons.shieldCheck size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-emerald-200">Everything is protected</p>
                <p className="text-xs text-emerald-200/60">All servers are online with active licences and enforcement on.</p>
              </div>
            </div>
          ) : (
            <Card className="p-0">
              <div className="flex items-center justify-between border-b border-white/5 px-5 py-3.5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Icons.bell size={16} className="text-amber-300" /> Needs your attention
                </h3>
                <Badge tone="amber">{health.length}</Badge>
              </div>
              <ul className="divide-y divide-white/5">
                {health.slice(0, 6).map((h, i) => {
                  const Icon = Icons[h.icon];
                  return (
                    <li key={i} className="flex items-center gap-4 px-5 py-3.5">
                      <span
                        className={cn(
                          "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                          h.tone === "red" && "bg-rose-500/10 text-rose-300",
                          h.tone === "amber" && "bg-amber-500/10 text-amber-300",
                          h.tone === "blue" && "bg-brand-500/10 text-brand-300"
                        )}
                      >
                        <Icon size={17} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-200">{h.title}</p>
                        <p className="truncate text-xs text-slate-500">{h.text}</p>
                      </div>
                      <Link href={h.href} className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10">
                        {h.cta}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {/* ------------------------------------------------------ stats */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Servers online" value={`${overview.onlineServers}/${overview.serverCount}`} icon="server" accent="brand" sub="right now" />
            <StatCard label="Players seen" value={overview.totalPlayers.toLocaleString("en-US")} icon="users" accent="violet" sub={`${overview.onlinePlayers} online now`} />
            <StatCard label="Active bans" value={overview.activeBans} icon="ban" accent="rose" sub={`${overview.totalBans} all time`} />
            <StatCard label="Detections · 24 h" value={overview.detections24h} icon="shield" accent="emerald" sub={`${overview.actions.KICK} kicks · ${overview.actions.BAN} bans`} />
          </div>

          {/* ------------------------------------------------------ charts */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">Detection activity</h3>
                  <p className="text-xs text-slate-500">Last 24 hours, per hour — detections and bans</p>
                </div>
                <Badge tone="blue" dot>Live</Badge>
              </div>
              <AreaTrend data={overview.series} />
            </Card>

            <Card>
              <div className="mb-2 flex items-center gap-2">
                <Icons.shield size={16} className="text-brand-300" />
                <h3 className="text-sm font-semibold text-white">What was caught</h3>
              </div>
              <p className="mb-3 text-xs text-slate-500">Last 24 hours, by type</p>
              {overview.detectionsByType.length ? (
                <>
                  <DonutChart data={overview.detectionsByType} centerValue={overview.detections24h} centerLabel="detections" />
                  <ul className="mt-4 space-y-2">
                    {overview.detectionsByType.slice(0, 5).map((d, i) => (
                      <li key={d.name} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2 text-slate-400">
                          <span className="h-2 w-2 rounded-full" style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
                          {d.name}
                        </span>
                        <span className="font-medium text-slate-200">{d.value}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <div className="grid h-[200px] place-items-center text-center text-sm text-slate-500">
                  <div>
                    <Icons.shieldCheck size={26} className="mx-auto mb-2 text-emerald-400/70" />
                    Nothing caught in the last 24 hours
                  </div>
                </div>
              )}
            </Card>
          </div>

          {/* ------------------------------------------------------ lists */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white">My servers</h3>
                <Link href="/dashboard/servers" className="text-xs text-brand-300 hover:text-brand-200">All →</Link>
              </div>
              <div className="space-y-2">
                {servers.map((s) => {
                  const online = s.status === "ONLINE";
                  return (
                    <Link
                      key={s.id}
                      href={`/dashboard/servers/${s.id}`}
                      className="group flex items-center gap-4 rounded-xl border border-white/5 bg-base-900/40 px-4 py-3 transition hover:border-brand-500/25 hover:bg-base-900/70"
                    >
                      <span className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/5 text-brand-300">
                        <Icons.server size={18} />
                        <span className={cn("absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-base-900", online ? "bg-emerald-400" : "bg-slate-600")} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-200">{s.name}</p>
                        <p className="text-xs text-slate-500">
                          {online ? "Online" : s.lastSeenAt ? `Offline · seen ${timeAgo(s.lastSeenAt)}` : "Not connected yet"}
                          {s.acVersion ? ` · v${s.acVersion}` : ""}
                        </p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p className="text-sm font-semibold text-slate-200">{onlineMap.get(s.id) ?? 0}</p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">players</p>
                      </div>
                      <div className="hidden text-right sm:block">
                        <p className={cn("text-sm font-semibold", (detMap.get(s.id) ?? 0) > 0 ? "text-amber-300" : "text-slate-200")}>
                          {detMap.get(s.id) ?? 0}
                        </p>
                        <p className="text-[10px] uppercase tracking-wider text-slate-500">det. 24h</p>
                      </div>
                      <Icons.arrowRight size={16} className="shrink-0 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-brand-300" />
                    </Link>
                  );
                })}
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
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-200">{d.playerName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {detectionTypeLabel(d.type)} · {timeAgo(d.createdAt)}
                          {servers.length > 1 ? ` · ${d.server.name}` : ""}
                        </p>
                      </div>
                      <Badge tone={ACTION_TONE[d.action ?? "LOG"] ?? "gray"}>{d.action ?? "LOG"}</Badge>
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

function HeroChip({
  icon,
  tone,
  children,
}: {
  icon: IconName;
  tone: "green" | "blue" | "amber" | "red" | "gray";
  children: React.ReactNode;
}) {
  const Icon = Icons[icon];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
        tone === "green" && "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
        tone === "blue" && "border-brand-400/25 bg-brand-400/10 text-brand-100",
        tone === "amber" && "border-amber-400/25 bg-amber-400/10 text-amber-200",
        tone === "red" && "border-rose-400/25 bg-rose-400/10 text-rose-200",
        tone === "gray" && "border-white/10 bg-white/5 text-slate-300"
      )}
    >
      <Icon size={13} />
      {children}
    </span>
  );
}
