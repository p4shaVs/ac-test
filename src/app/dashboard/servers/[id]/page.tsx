import Link from "next/link";
import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { getUserOverview } from "@/lib/stats";
import { Card } from "@/components/ui";
import { AreaTrend, DonutChart } from "@/components/charts";
import { DONUT_PALETTE } from "@/lib/palette";
import { Icons, type IconName } from "@/components/icons";
import { ServerInfoCards } from "./server-info-cards";
import { detectionLabel } from "@/lib/detection-actions";
import { cn, timeAgo, formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ACCENTS: Record<string, { border: string; text: string }> = {
  blue: { border: "#6366f1", text: "text-brand-300" },
  purple: { border: "#a855f7", text: "text-purple-300" },
  red: { border: "#ef4444", text: "text-rose-300" },
  green: { border: "#10b981", text: "text-emerald-300" },
};

const SEV: Record<string, string> = {
  CRITICAL: "text-rose-300 bg-rose-500/10 ring-rose-500/25",
  HIGH: "text-amber-300 bg-amber-500/10 ring-amber-500/25",
  MEDIUM: "text-brand-300 bg-brand-500/10 ring-brand-500/25",
  LOW: "text-slate-400 bg-white/5 ring-white/10",
};
const SEV_DOT: Record<string, string> = {
  CRITICAL: "bg-rose-400",
  HIGH: "bg-amber-400",
  MEDIUM: "bg-brand-400",
  LOW: "bg-slate-500",
};
const ACT: Record<string, string> = {
  BAN: "text-rose-300 bg-rose-500/10",
  KICK: "text-amber-300 bg-amber-500/10",
  LOG: "text-slate-400 bg-white/5",
};

export default async function ServerOverview({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const overview = await getUserOverview([server.id]);
  const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [connections, recentDetections, recentBans, dets24] = await Promise.all([
    db.player.count({ where: { serverId: server.id } }),
    db.detection.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: "desc" },
      take: 11,
      select: { id: true, playerName: true, type: true, severity: true, action: true, details: true, createdAt: true },
    }),
    db.ban.findMany({
      where: { serverId: server.id, active: true },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, code: true, playerName: true, reason: true, bannedBy: true, permanent: true, expiresAt: true, createdAt: true },
    }),
    db.detection.findMany({
      where: { serverId: server.id, createdAt: { gte: since24 } },
      select: { playerName: true },
      take: 1000,
    }),
  ]);

  // Top flagged players (last 24h), computed in JS to avoid a groupBy.
  const topMap = new Map<string, number>();
  for (const d of dets24) topMap.set(d.playerName, (topMap.get(d.playerName) ?? 0) + 1);
  const topDetected = [...topMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const topMax = topDetected[0]?.count ?? 1;

  // License expiry
  const expiresAt = server.licenseKey?.expiresAt ? new Date(server.licenseKey.expiresAt) : null;
  const days = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)) : null;
  const expiryText = days === null ? "No expiry" : `${days} days`;
  const expirySoon = days !== null && days <= 7;

  // Analytics peak/avg
  const peak = overview.series.reduce((m, p) => Math.max(m, p.detections), 0);
  const avg = overview.series.length
    ? Math.round(overview.series.reduce((s, p) => s + p.detections, 0) / overview.series.length)
    : 0;

  const base = `/dashboard/servers/${server.id}`;
  const enforcement = overview.actions;
  const online = server.status === "ONLINE";

  return (
    <div className="space-y-4">
      {!server.lastSeenAt && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <Icons.bolt size={18} className="mt-0.5 shrink-0 text-amber-300" />
          <div className="text-sm">
            <p className="font-medium text-amber-200">Server not connected yet</p>
            <p className="text-amber-200/70">
              Install the FiveM resource and set the API token in{" "}
              <Link href={`${base}/settings`} className="underline">Settings</Link>{" "}
              and this server comes online automatically.
            </p>
          </div>
        </div>
      )}

      {/* Row 1 — info cards */}
      <ServerInfoCards
        serverName={server.name}
        online={online}
        ip={server.ip}
        licenseKey={(server.licenseKey as { key?: string } | null)?.key ?? null}
        expiryText={expiryText}
        expirySoon={expirySoon}
        settingsHref={`${base}/settings`}
      />

      {/* Row 2 — colorful stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AccentStat label="Connections" value={connections.toLocaleString("en-US")} icon="activity" accent="blue" />
        <AccentStat label="Total Players" value={overview.totalPlayers.toLocaleString("en-US")} icon="users" accent="purple" />
        <AccentStat label="Total Bans" value={overview.totalBans.toLocaleString("en-US")} icon="ban" accent="red" />
        <AccentStat label="Online Now" value={`${overview.onlinePlayers}`} sub={`/${server.maxSlots} slots`} icon="server" accent="green" />
      </div>

      {/* Row 3 — analytics + two donuts */}
      <div className="grid gap-4 xl:grid-cols-4">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Detection activity</h3>
              <p className="text-xs text-slate-500">Last 24 hours, per hour</p>
            </div>
            <div className="flex gap-5 text-right">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Peak / h</p>
                <p className="text-sm font-bold text-white">{peak}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Avg / h</p>
                <p className="text-sm font-bold text-white">{avg}</p>
              </div>
            </div>
          </div>
          <AreaTrend data={overview.series} />
          <div className="mt-2 flex items-center justify-center gap-5 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" /> Detections</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Bans</span>
          </div>
        </Card>

        <DonutCard title="Drop Reasons" sub="Last 24 hours" data={overview.dropReasons} centerValue={overview.drops24h} centerLabel="drops" />
        <DonutCard title="Detections" sub="Last 24 hours" data={overview.detectionsByType} centerValue={overview.detections24h} centerLabel="detections" />
      </div>

      {/* Row 4 — recent detections + side column */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2 flex flex-col">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icons.shieldCheck size={15} className="text-brand-400" /> Recent Detections
            </h3>
            <Link href={`${base}/monitoring`} className="text-xs font-medium text-brand-300 hover:text-brand-200">
              Live monitor →
            </Link>
          </div>
          {recentDetections.length ? (
            <ul className="-mx-2 divide-y divide-white/5">
              {recentDetections.map((d) => (
                <li key={d.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-white/[0.02]">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", SEV_DOT[d.severity] ?? SEV_DOT.LOW)} />
                  <span className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium text-slate-200">{detectionLabel(d.type)}</span>
                    <span className="block truncate text-xs text-slate-500">{d.playerName}</span>
                  </span>
                  {d.details?.includes('"bypass":"staff"') && (
                    <span
                      title="Server staff — logged only (Settings → Never punish server staff)"
                      className="rounded-md bg-brand-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-300"
                    >
                      Staff
                    </span>
                  )}
                  <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", ACT[d.action ?? "LOG"] ?? ACT.LOG)}>
                    {d.action ?? "LOG"}
                  </span>
                  <span className={cn("hidden rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset sm:inline", SEV[d.severity] ?? SEV.LOW)}>
                    {d.severity}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-slate-500">{timeAgo(d.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="shieldCheck" text="No detections yet — all quiet." />
          )}
        </Card>

        <div className="grid gap-4">
          {/* Enforcement 24h */}
          <Card>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Icons.bolt size={15} className="text-brand-400" /> Enforcement
              <span className="text-xs font-normal text-slate-500">· 24h</span>
            </h3>
            <div className="grid grid-cols-3 gap-2">
              <MiniStat label="Warns" value={enforcement.WARN} tone="text-amber-300" />
              <MiniStat label="Kicks" value={enforcement.KICK} tone="text-brand-300" />
              <MiniStat label="Bans" value={enforcement.BAN} tone="text-rose-300" />
            </div>
          </Card>

          {/* Top flagged players */}
          <Card className="flex-1">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Icons.users size={15} className="text-brand-400" /> Top Flagged
              <span className="text-xs font-normal text-slate-500">· 24h</span>
            </h3>
            {topDetected.length ? (
              <ul className="space-y-2.5">
                {topDetected.map((p, i) => (
                  <li key={p.name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="grid h-4 w-4 shrink-0 place-items-center rounded text-[9px] font-bold text-slate-500">{i + 1}</span>
                        <span className="truncate text-slate-300">{p.name}</span>
                      </span>
                      <span className="font-semibold text-slate-400">{p.count}</span>
                    </div>
                    <div className="ml-6 h-1.5 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-purple-500" style={{ width: `${Math.max(8, (p.count / topMax) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="users" text="No flagged players in the last 24 hours." />
            )}
          </Card>
        </div>
      </div>

      {/* Row 5 — recent bans + server health */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icons.ban size={15} className="text-rose-400" /> Recent Bans
            </h3>
            <Link href={`${base}/bans`} className="text-xs font-medium text-brand-300 hover:text-brand-200">
              All bans →
            </Link>
          </div>
          {recentBans.length ? (
            <ul className="-mx-2 divide-y divide-white/5">
              {recentBans.map((b) => (
                <li key={b.id} className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition hover:bg-white/[0.02]">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-rose-500/10 text-rose-300">
                    <Icons.ban size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium text-slate-200">{b.playerName}</span>
                    <span className="block truncate text-xs text-slate-500">{b.reason}</span>
                  </span>
                  {b.code && <code className="hidden font-mono text-[11px] text-brand-300 sm:inline">{b.code}</code>}
                  <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset", b.permanent || !b.expiresAt ? "text-rose-300 bg-rose-500/10 ring-rose-500/25" : "text-amber-300 bg-amber-500/10 ring-amber-500/25")}>
                    {b.permanent || !b.expiresAt ? "Perm" : "Temp"}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] text-slate-500">{timeAgo(b.createdAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="ban" text="No active bans. A clean server." />
          )}
        </Card>

        {/* Server health */}
        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <Icons.server size={15} className="text-brand-400" /> Server Health
          </h3>
          <div className="space-y-2.5">
            <HealthRow label="Status" >
              <span className={cn("flex items-center gap-1.5 text-sm font-semibold", online ? "text-emerald-300" : "text-slate-400")}>
                <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-400" : "bg-slate-500")} />
                {online ? "Online" : "Offline"}
              </span>
            </HealthRow>
            <HealthRow label="Players">
              <span className="text-sm font-semibold text-white">{overview.onlinePlayers}<span className="text-slate-500"> / {server.maxSlots}</span></span>
            </HealthRow>
            <HealthRow label="AC version">
              <span className="font-mono text-xs text-slate-300">{server.acVersion ?? "—"}</span>
            </HealthRow>
            <HealthRow label="Last seen">
              <span className="text-xs text-slate-300">{server.lastSeenAt ? timeAgo(server.lastSeenAt) : "never"}</span>
            </HealthRow>
            <HealthRow label="License">
              <span className={cn("text-xs font-medium", expirySoon ? "text-amber-300" : "text-slate-300")}>{expiryText}</span>
            </HealthRow>
          </div>
          <Link href={`${base}/rules`} className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] py-2.5 text-xs font-semibold text-slate-300 transition hover:border-brand-500/40 hover:bg-brand-500/10 hover:text-white">
            <Icons.config size={14} /> Configure protections
          </Link>
        </Card>
      </div>
    </div>
  );
}

function AccentStat({
  label,
  value,
  sub,
  icon,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: IconName;
  accent: keyof typeof ACCENTS;
}) {
  const Icon = Icons[icon];
  const a = ACCENTS[accent];
  return (
    <div className="card relative overflow-hidden p-5" style={{ borderLeft: `3px solid ${a.border}` }}>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Icon size={14} className={a.text} /> {label}
        </span>
      </div>
      <p className={cn("mt-2 text-3xl font-bold tracking-tight", a.text)}>
        {value}
        {sub && <span className="ml-1 text-sm font-medium text-slate-500">{sub}</span>}
      </p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
      <p className={cn("text-2xl font-bold tracking-tight", tone)}>{value}</p>
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
    </div>
  );
}

function HealthRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
      <span className="text-xs text-slate-500">{label}</span>
      {children}
    </div>
  );
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  const Icon = Icons[icon];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-slate-500 ring-1 ring-inset ring-white/10">
        <Icon size={18} />
      </span>
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}

function DonutCard({
  title,
  sub,
  data,
  centerValue,
  centerLabel,
}: {
  title: string;
  sub: string;
  data: { name: string; value: number }[];
  centerValue: number;
  centerLabel: string;
}) {
  return (
    <Card>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
        <Icons.shieldCheck size={15} className="text-brand-400" /> {title}
      </h3>
      <p className="mb-2 text-xs text-slate-500">{sub}</p>
      {data.length ? (
        <>
          <DonutChart data={data} centerValue={centerValue} centerLabel={centerLabel} />
          <ul className="mt-3 space-y-1.5">
            {data.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-2 text-slate-300">
                  <span className="h-2 w-2 rounded-full" style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
                  {d.name}
                </span>
                <span className="font-medium text-slate-400">{d.value}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="grid h-[200px] place-items-center text-sm text-slate-500">No data yet</div>
      )}
    </Card>
  );
}
