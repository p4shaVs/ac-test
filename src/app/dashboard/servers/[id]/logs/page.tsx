import Link from "next/link";
import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PAGE = 150;
const LEVELS = ["ALL", "DETECTION", "WARN", "ERROR", "INFO"] as const;
const LEVEL_STYLE: Record<string, string> = {
  INFO: "text-slate-400 ring-white/10",
  WARN: "text-amber-300 ring-amber-500/30",
  ERROR: "text-rose-300 ring-rose-500/30",
  DETECTION: "text-brand-300 ring-brand-500/30",
};
const LEVEL_LABEL: Record<string, string> = { ALL: "All", DETECTION: "Detections", WARN: "Warnings", ERROR: "Errors", INFO: "Info" };

type SP = { level?: string; source?: string; q?: string; before?: string };

function dayLabel(d: Date): string {
  const today = new Date();
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

export default async function LogsPage({ params, searchParams }: { params: { id: string }; searchParams: SP }) {
  const { server } = await getOwnedServer(params.id);
  const level = LEVELS.includes((searchParams.level ?? "ALL").toUpperCase() as (typeof LEVELS)[number])
    ? (searchParams.level ?? "ALL").toUpperCase()
    : "ALL";
  const source = (searchParams.source ?? "").slice(0, 40);
  const q = (searchParams.q ?? "").trim().slice(0, 100);
  const before = searchParams.before ? new Date(searchParams.before) : null;

  const base = { serverId: server.id };
  const where = {
    ...base,
    ...(level !== "ALL" ? { level } : {}),
    ...(source ? { source } : {}),
    ...(q ? { message: { contains: q } } : {}),
    ...(before && !isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}),
  };

  const since = new Date(Date.now() - 7 * 86400e3);
  const [logs, levelCounts, sources] = await Promise.all([
    db.serverLog.findMany({ where, orderBy: { createdAt: "desc" }, take: PAGE + 1 }),
    db.serverLog.groupBy({ by: ["level"], where: { ...base, createdAt: { gte: since } }, _count: { _all: true } }),
    db.serverLog.groupBy({ by: ["source"], where: { ...base, createdAt: { gte: since } }, _count: { _all: true }, orderBy: { _count: { source: "desc" } }, take: 12 }),
  ]);
  const hasMore = logs.length > PAGE;
  const rows = logs.slice(0, PAGE);
  const counts: Record<string, number> = { ALL: 0 };
  for (const c of levelCounts) {
    counts[c.level] = c._count._all;
    counts.ALL += c._count._all;
  }

  const href = (patch: Partial<SP>) => {
    const sp = new URLSearchParams();
    const next = { level, source, q, ...patch };
    if (next.level && next.level !== "ALL") sp.set("level", next.level);
    if (next.source) sp.set("source", next.source);
    if (next.q) sp.set("q", next.q);
    if (patch.before) sp.set("before", patch.before);
    const s = sp.toString();
    return `/dashboard/servers/${server.id}/logs${s ? `?${s}` : ""}`;
  };

  // group rows by calendar day
  const groups: { label: string; items: typeof rows }[] = [];
  for (const l of rows) {
    const label = dayLabel(l.createdAt);
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.items.push(l);
    else groups.push({ label, items: [l] });
  }

  return (
    <>
      <PageHeader
        title="Server Logs"
        description="Connections, admin actions and anti-cheat events from your server. Counts cover the last 7 days."
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {LEVELS.map((l) => (
            <Link
              key={l}
              href={href({ level: l, before: undefined })}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                level === l ? "border-brand-500/50 bg-brand-500/15 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"
              )}
            >
              {LEVEL_LABEL[l]}
              <span className="font-mono text-[10px] text-slate-500">{counts[l] ?? 0}</span>
            </Link>
          ))}
        </div>
        <form className="flex items-center gap-2" action={`/dashboard/servers/${server.id}/logs`}>
          {level !== "ALL" && <input type="hidden" name="level" value={level} />}
          <select
            name="source"
            defaultValue={source}
            className="rounded-lg border border-white/10 bg-base-900/60 px-2.5 py-1.5 text-sm text-slate-200 outline-none focus:border-brand-500/50"
          >
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.source} value={s.source}>
                {s.source} ({s._count._all})
              </option>
            ))}
          </select>
          <div className="relative">
            <Icons.search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search messages…"
              className="w-56 rounded-lg border border-white/10 bg-base-900/60 py-1.5 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-brand-500/50"
            />
          </div>
          <button className="btn-secondary text-xs">Filter</button>
        </form>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-base-900/40">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <Icons.logs size={22} className="text-slate-500" />
            <p className="text-sm font-semibold text-slate-200">No log entries</p>
            <p className="text-sm text-slate-500">{q || source || level !== "ALL" ? "Nothing matches these filters." : "Entries appear here once your server is connected."}</p>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.label}>
              <h3 className="border-y border-white/5 bg-base-950/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 first:border-t-0">
                {g.label} <span className="ml-1 font-mono normal-case tracking-normal text-slate-600">{g.items.length}</span>
              </h3>
              <ul className="divide-y divide-white/[0.04]">
                {g.items.map((l) => (
                  <li key={l.id} className="grid grid-cols-[72px_96px_120px_1fr] items-start gap-3 px-4 py-2 text-sm hover:bg-white/[0.02]">
                    <span className="pt-0.5 font-mono text-xs text-slate-500">
                      {l.createdAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span>
                      <span className={cn("inline-block rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset", LEVEL_STYLE[l.level] ?? LEVEL_STYLE.INFO)}>
                        {l.level === "DETECTION" ? "Detection" : l.level.toLowerCase()}
                      </span>
                    </span>
                    <Link href={href({ source: l.source, before: undefined })} className="truncate pt-0.5 font-mono text-xs text-slate-500 hover:text-slate-300">
                      {l.source}
                    </Link>
                    <span className="break-words text-slate-300">{l.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Link href={href({ before: rows[rows.length - 1].createdAt.toISOString() })} className="btn-secondary text-xs">
            Older entries
          </Link>
        </div>
      )}
    </>
  );
}
