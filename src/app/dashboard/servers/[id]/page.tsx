import Link from "next/link";
import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { getUserOverview } from "@/lib/stats";
import { Card } from "@/components/ui";
import { AreaTrend } from "@/components/charts";
import { Icons, type IconName } from "@/components/icons";
import { detectionLabel } from "@/lib/detection-actions";
import { evidenceLine } from "@/lib/evidence";
import { readWebhookConfig } from "@/lib/discord";
import { trollPropPreset } from "@/lib/troll-props";
import { env } from "@/lib/env";
import { cn, parseJson, timeAgo } from "@/lib/utils";
import { CopyKey } from "./copy-key";

export const dynamic = "force-dynamic";

const ACT: Record<string, string> = {
  BAN: "text-rose-300 ring-rose-500/30",
  KICK: "text-amber-300 ring-amber-500/30",
  LOG: "text-slate-400 ring-white/10",
};

export default async function ServerOverview({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const now = Date.now();
  const d24 = new Date(now - 86400e3);
  const d48 = new Date(now - 2 * 86400e3);
  const sid = server.id;

  const [overview, feed, recentBans, dets24, detsPrev, bans24, bansPrev, kicks24, kicksPrev, objectRows] = await Promise.all([
    getUserOverview([sid]),
    db.detection.findMany({
      where: { serverId: sid },
      orderBy: { createdAt: "desc" },
      take: 9,
      select: { id: true, playerName: true, type: true, action: true, details: true, createdAt: true },
    }),
    db.ban.findMany({
      where: { serverId: sid, active: true },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, code: true, playerName: true, reason: true, bannedBy: true, permanent: true, expiresAt: true, createdAt: true },
    }),
    db.detection.findMany({ where: { serverId: sid, createdAt: { gte: d24 } }, select: { playerName: true }, take: 3000 }),
    db.detection.findMany({ where: { serverId: sid, createdAt: { gte: d48, lt: d24 } }, select: { playerName: true }, take: 3000 }),
    db.ban.count({ where: { serverId: sid, createdAt: { gte: d24 } } }),
    db.ban.count({ where: { serverId: sid, createdAt: { gte: d48, lt: d24 } } }),
    db.punishAction.count({ where: { serverId: sid, type: "KICK", createdAt: { gte: d24 } } }),
    db.punishAction.count({ where: { serverId: sid, type: "KICK", createdAt: { gte: d48, lt: d24 } } }),
    db.blacklist.findMany({ where: { serverId: sid, kind: "object" }, select: { model: true } }),
  ]);

  // ------------------------------------------------------------ derived
  const flagged = new Map<string, number>();
  for (const d of dets24) flagged.set(d.playerName, (flagged.get(d.playerName) ?? 0) + 1);
  const flaggedPrev = new Set(detsPrev.map((d) => d.playerName)).size;
  const topFlagged = [...flagged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topMax = topFlagged[0]?.[1] ?? 1;

  const config = parseJson<Record<string, any>>(server.config, {});
  const logOnly = config.ac?.Settings?.LogOnly === true;
  const staffBypass = config.ac?.Settings?.StaffBypass !== false;
  const online = server.status === "ONLINE";
  const slotsPct = server.maxSlots ? Math.min(100, (overview.onlinePlayers / server.maxSlots) * 100) : 0;

  const expiresAt = server.licenseKey?.expiresAt ? new Date(server.licenseKey.expiresAt) : null;
  const days = expiresAt ? Math.max(0, Math.ceil((expiresAt.getTime() - now) / 86400e3)) : null;

  const threat = overview.detectionsByType.slice(0, 6);
  const threatMax = threat[0]?.value ?? 1;

  // Setup checklist — what still makes the protection weaker.
  const listed = new Set(objectRows.map((r) => r.model));
  const preset = trollPropPreset();
  const presetDone = preset.filter((m) => listed.has(String(m.hash))).length >= preset.length * 0.9;
  const webhook = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(readWebhookConfig(server.config).url);
  const publicUrl = /^https?:\/\//.test(env.APP_URL ?? "") && !/localhost|127\.0\.0\.1/.test(env.APP_URL ?? "");
  const protectedEvents = Array.isArray(config.protectedEvents) ? config.protectedEvents.length : 0;
  const base = `/dashboard/servers/${sid}`;
  const checklist: { ok: boolean; label: string; hint: string; href: string }[] = [
    { ok: !!server.lastSeenAt, label: "Anti-cheat connected", hint: "Install it from Download", href: "/dashboard/download" },
    { ok: !logOnly, label: "Enforcement on", hint: "Log-only mode is on", href: `${base}/rules` },
    { ok: presetDone, label: "Troll & giant props blocked", hint: "Add the recommended pack", href: `${base}/blacklist` },
    { ok: webhook, label: "Discord logs", hint: "Add a webhook", href: `${base}/settings` },
    { ok: publicUrl, label: "Public panel address", hint: "Needed for screenshots", href: "/docs" },
    { ok: protectedEvents > 0, label: "Protected events", hint: "Trap cheat-menu events", href: `${base}/events` },
  ];
  const doneCount = checklist.filter((c) => c.ok).length;

  const detSeries = overview.series.map((p) => p.detections);
  const banSeries = overview.series.map((p) => p.bans);

  return (
    <div className="space-y-4">
      {/* ---------------------------------------------------------- status band */}
      <section className="grid overflow-hidden rounded-2xl border border-white/10 bg-base-900/60 lg:grid-cols-[1.35fr_1fr_1fr]">
        <div className="border-b border-white/5 p-5 lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <span className={cn("h-2 w-2 rounded-full", online ? "animate-pulse bg-emerald-400" : "bg-slate-600")} />
            {online ? "Online" : server.lastSeenAt ? "Offline" : "Not connected yet"}
          </div>
          <h1 className="mt-2 truncate text-2xl font-bold tracking-tight text-white">{server.name}</h1>
          <dl className="mt-3 grid grid-cols-[88px_1fr] gap-y-1.5 text-sm">
            <dt className="text-slate-500">Address</dt>
            <dd className="truncate font-mono text-xs leading-5 text-slate-300">{server.ip ? `${server.ip}:${server.port}` : "—"}</dd>
            <dt className="text-slate-500">Anti-cheat</dt>
            <dd className="text-xs leading-5 text-slate-300">
              {server.acVersion ? `v${server.acVersion}` : "—"}
              <span className="text-slate-500"> · last heartbeat {server.lastSeenAt ? timeAgo(server.lastSeenAt) : "never"}</span>
            </dd>
            <dt className="text-slate-500">Licence</dt>
            <dd className="flex min-w-0 items-center gap-2">
              <CopyKey value={(server.licenseKey as { key?: string } | null)?.key ?? null} />
              <span className={cn("shrink-0 text-xs", days !== null && days <= 7 ? "text-amber-300" : "text-slate-500")}>
                {days === null ? "lifetime" : `${days}d left`}
              </span>
            </dd>
          </dl>
        </div>

        <div className="border-b border-white/5 p-5 lg:border-b-0 lg:border-r">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Players online</p>
          <p className="mt-2 text-4xl font-bold tracking-tight text-white">
            {overview.onlinePlayers}
            <span className="text-lg font-medium text-slate-500"> / {server.maxSlots}</span>
          </p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
            <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${slotsPct}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-500">{overview.totalPlayers.toLocaleString("en-US")} players seen in total</p>
        </div>

        <div className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Protection</p>
          <p className={cn("mt-2 flex items-center gap-2 text-lg font-bold", logOnly ? "text-amber-300" : "text-emerald-300")}>
            <Icons.shieldCheck size={20} /> {logOnly ? "Log-only mode" : "Enforcing"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {logOnly ? "Detections are recorded, nobody is kicked or banned." : "Kicks and bans follow your Actions settings."}
            {" "}Staff {staffBypass ? "are never punished" : "are treated like players"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <QuickLink href={`${base}/monitoring`} icon="eye" label="Live" />
            <QuickLink href={`${base}/event-log`} icon="scan" label="Event Log" />
            <QuickLink href={`${base}/rules`} icon="config" label="Configure" />
            <QuickLink href={`${base}/console`} icon="terminal" label="Console" />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ KPI strip */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Detections" value={overview.detections24h} prev={detsPrev.length} series={detSeries} tone="#8b90ff" />
        <Kpi label="Bans" value={bans24} prev={bansPrev} series={banSeries} tone="#f0605d" />
        <Kpi label="Kicks" value={kicks24} prev={kicksPrev} tone="#f2b33d" />
        <Kpi label="Flagged players" value={flagged.size} prev={flaggedPrev} tone="#5aa9f5" />
      </section>

      {/* --------------------------------------------------- activity + threat */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle icon="chart" title="Activity" sub="Detections and bans per hour, last 24 h" />
          <AreaTrend data={overview.series} />
          <div className="mt-2 flex items-center justify-center gap-5 text-xs text-slate-400">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-500" /> Detections</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-500" /> Bans</span>
          </div>
        </Card>
        <Card>
          <SectionTitle icon="shield" title="Threat mix" sub="What was caught, last 24 h" />
          {threat.length ? (
            <ul className="space-y-3">
              {threat.map((t) => (
                <li key={t.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="truncate text-slate-300">{t.name}</span>
                    <span className="font-mono text-slate-400">{t.value}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-brand-400/80" style={{ width: `${Math.max(4, (t.value / threatMax) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="shieldCheck" text="Nothing caught in the last 24 hours." />
          )}
        </Card>
      </section>

      {/* ------------------------------------------------- live feed + sidebar */}
      <section className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <SectionTitle
            icon="activity"
            title="Latest detections"
            action={<Link href={`${base}/logs?level=DETECTION`} className="text-xs font-medium text-brand-300 hover:text-brand-200">All detections →</Link>}
          />
          {feed.length ? (
            <ul className="-mx-2 divide-y divide-white/5">
              {feed.map((d) => {
                const staff = d.details.includes('"bypass":"staff"');
                const ev = evidenceLine(d.details);
                return (
                  <li key={d.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-white/[0.02]">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-sm">
                        <span className="font-semibold text-slate-100">{detectionLabel(d.type)}</span>
                        <span className="truncate text-slate-400">· {d.playerName}</span>
                      </p>
                      {ev && <p className="truncate font-mono text-[11px] text-slate-500">{ev}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {staff && <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-300 ring-1 ring-inset ring-brand-500/30">Staff</span>}
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", ACT[d.action ?? "LOG"] ?? ACT.LOG)}>
                        {d.action ?? "LOG"}
                      </span>
                      <span className="w-14 text-right text-[11px] text-slate-500">{timeAgo(d.createdAt)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty icon="shieldCheck" text="No detections yet — all quiet." />
          )}
        </Card>

        <div className="grid content-start gap-4">
          <Card>
            <SectionTitle icon="check" title="Setup" sub={`${doneCount} of ${checklist.length} done`} />
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-emerald-400/80" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
            </div>
            <ul className="space-y-1.5">
              {checklist.map((c) => (
                <li key={c.label}>
                  <Link href={c.href} className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-sm transition hover:bg-white/[0.03]">
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border", c.ok ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" : "border-white/15 text-transparent")}>
                      <Icons.check size={12} />
                    </span>
                    <span className={cn("flex-1 truncate", c.ok ? "text-slate-300" : "text-slate-200")}>{c.label}</span>
                    {!c.ok && <span className="shrink-0 text-[11px] text-slate-500">{c.hint}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle icon="users" title="Most flagged" sub="Last 24 h" />
            {topFlagged.length ? (
              <ul className="space-y-2.5">
                {topFlagged.map(([name, n]) => (
                  <li key={name}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate text-slate-300">{name}</span>
                      <span className="font-mono text-slate-400">{n}</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/5">
                      <div className="h-full rounded-full bg-amber-400/70" style={{ width: `${Math.max(6, (n / topMax) * 100)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="users" text="Nobody flagged in the last 24 hours." />
            )}
          </Card>
        </div>
      </section>

      {/* ---------------------------------------------------------- recent bans */}
      <Card>
        <SectionTitle
          icon="ban"
          title="Recent bans"
          action={<Link href={`${base}/bans`} className="text-xs font-medium text-brand-300 hover:text-brand-200">All bans →</Link>}
        />
        {recentBans.length ? (
          <ul className="-mx-2 divide-y divide-white/5">
            {recentBans.map((b) => (
              <li key={b.id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-white/[0.02] sm:grid-cols-[1fr_120px_110px_auto]">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-200">{b.playerName}</span>
                  <span className="block truncate text-xs text-slate-500">{b.reason}</span>
                </span>
                <code className="hidden font-mono text-[11px] text-brand-300 sm:block">{b.code}</code>
                <span className="hidden truncate text-xs text-slate-500 sm:block">{b.bannedBy}</span>
                <span className="flex items-center gap-2">
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ring-1 ring-inset", b.permanent || !b.expiresAt ? "text-rose-300 ring-rose-500/30" : "text-amber-300 ring-amber-500/30")}>
                    {b.permanent || !b.expiresAt ? "Permanent" : "Temporary"}
                  </span>
                  <span className="w-14 text-right text-[11px] text-slate-500">{timeAgo(b.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty icon="ban" text="No active bans. A clean server." />
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------- pieces
function QuickLink({ href, icon, label }: { href: string; icon: IconName; label: string }) {
  const Icon = Icons[icon];
  return (
    <Link href={href} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-brand-500/40 hover:text-white">
      <Icon size={13} /> {label}
    </Link>
  );
}

function SectionTitle({ icon, title, sub, action }: { icon: IconName; title: string; sub?: string; action?: React.ReactNode }) {
  const Icon = Icons[icon];
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <Icon size={15} className="text-slate-400" /> {title}
        </h3>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

function Kpi({ label, value, prev, series, tone }: { label: string; value: number; prev: number; series?: number[]; tone: string }) {
  const delta = value - prev;
  const pct = prev > 0 ? Math.round((delta / prev) * 100) : value > 0 ? 100 : 0;
  return (
    <div className="card relative overflow-hidden p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label} · 24h</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-3xl font-bold tracking-tight text-white">{value.toLocaleString("en-US")}</p>
        {series && <Sparkline values={series} color={tone} />}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {delta === 0 ? (
          "same as the day before"
        ) : (
          <>
            <span className={delta > 0 ? "text-rose-300" : "text-emerald-300"}>
              {delta > 0 ? "▲" : "▼"} {Math.abs(pct)}%
            </span>{" "}
            vs previous 24 h ({prev})
          </>
        )}
      </p>
      <span className="absolute inset-x-0 top-0 h-px" style={{ background: tone, opacity: 0.6 }} />
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 110;
  const h = 34;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
    </svg>
  );
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  const Icon = Icons[icon];
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Icon size={20} className="text-slate-600" />
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
