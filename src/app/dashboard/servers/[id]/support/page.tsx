import Link from "next/link";
import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { Card, PageHeader, Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { sanitizeRules } from "@/lib/rules";
import { sanitizeActions } from "@/lib/detection-actions";
import { parseJson, timeAgo } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

// Support = self-diagnostics first (so a customer can fix the common issues
// themselves) + where to get help. Everything shown is real, live data.
export default async function SupportPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);

  const recentError = await db.serverLog.findFirst({
    where: { serverId: server.id, level: "ERROR" },
    orderBy: { createdAt: "desc" },
  });

  const config = parseJson<Record<string, unknown>>(server.config, {});
  const rules = sanitizeRules(config.rules);
  const rulesOn = Object.values(rules).filter(Boolean).length;
  const rulesTotal = Object.keys(rules).length;
  const actions = sanitizeActions(config.actions);
  const banActions = Object.values(actions).filter((a) => a === "BAN").length;

  const online = server.status === "ONLINE";
  const lastSeenMins = server.lastSeenAt ? (Date.now() - new Date(server.lastSeenAt).getTime()) / 60000 : Infinity;

  const checks = [
    {
      label: "Resource connected",
      ok: !!server.apiTokenHash && !!server.lastSeenAt,
      detail: server.apiTokenHash ? (server.lastSeenAt ? `Last heartbeat ${timeAgo(server.lastSeenAt)}` : "Token set, waiting for first heartbeat") : "No API token — generate one in Settings",
      fix: "Settings",
    },
    {
      label: "Server online",
      ok: online && lastSeenMins < 3,
      detail: online ? "Receiving heartbeats" : "Offline — the resource is not running or cannot reach the panel",
      fix: "Settings",
    },
    {
      label: "Anti-cheat version",
      ok: !!server.acVersion,
      detail: server.acVersion ? `Running v${server.acVersion}` : "Unknown — restart the resource",
    },
    {
      label: "Protections enabled",
      ok: rulesOn > 0,
      detail: `${rulesOn}/${rulesTotal} server guards on · ${banActions} set to auto-ban`,
      fix: "Configuration",
    },
  ];
  const fixHref: Record<string, string> = {
    Settings: `/dashboard/servers/${server.id}/settings`,
    Configuration: `/dashboard/servers/${server.id}/rules`,
  };

  return (
    <>
      <PageHeader title="Support" description="Check your setup, then reach out if you still need a hand." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <Icons.lifebuoy size={16} className="text-brand-400" /> Health check
          </h3>
          <p className="mb-4 text-xs text-slate-500">Most support tickets are one of these. Green means you are good.</p>
          <div className="space-y-2.5">
            {checks.map((c) => (
              <div key={c.label} className="flex items-center gap-3 rounded-xl border border-white/5 bg-base-900/40 px-4 py-3">
                <span className={"grid h-8 w-8 shrink-0 place-items-center rounded-lg " + (c.ok ? "bg-emerald-500/10 text-emerald-300" : "bg-amber-500/10 text-amber-300")}>
                  <Icons.check size={16} className={c.ok ? "" : "hidden"} />
                  <Icons.warn size={15} className={c.ok ? "hidden" : ""} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-200">{c.label}</p>
                  <p className="truncate text-xs text-slate-500">{c.detail}</p>
                </div>
                {!c.ok && c.fix && (
                  <Link href={fixHref[c.fix]} className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-brand-300 hover:bg-white/5">
                    {c.fix} →
                  </Link>
                )}
              </div>
            ))}
          </div>
          {recentError && (
            <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3">
              <p className="text-xs font-semibold text-rose-200">Most recent error ({timeAgo(recentError.createdAt)})</p>
              <p className="mt-1 break-words font-mono text-xs text-rose-200/80">{recentError.message}</p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <Icons.discord size={16} className="text-brand-400" /> Get help
            </h3>
            <div className="space-y-2">
              <a
                href={BRAND.discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border border-[#5865F2]/25 bg-[#5865F2]/10 px-4 py-3 transition hover:bg-[#5865F2]/20"
              >
                <Icons.discord size={16} className="text-[#aab1fb]" />
                <div>
                  <p className="text-sm font-medium text-slate-200">Ask on Discord</p>
                  <p className="text-xs text-slate-500">{BRAND.discordLabel} — open a support ticket</p>
                </div>
              </a>
              <Link href="/docs" className="flex items-center gap-3 rounded-xl border border-white/5 bg-base-900/40 px-4 py-3 transition hover:border-brand-500/20 hover:bg-base-900/70">
                <Icons.book size={16} className="text-brand-300" />
                <div>
                  <p className="text-sm font-medium text-slate-200">Documentation</p>
                  <p className="text-xs text-slate-500">Install guides & reference</p>
                </div>
              </Link>
              <Link href={`/dashboard/servers/${server.id}/rules`} className="flex items-center gap-3 rounded-xl border border-white/5 bg-base-900/40 px-4 py-3 transition hover:border-brand-500/20 hover:bg-base-900/70">
                <Icons.config size={16} className="text-brand-300" />
                <div>
                  <p className="text-sm font-medium text-slate-200">Configuration</p>
                  <p className="text-xs text-slate-500">Review your protection settings</p>
                </div>
              </Link>
            </div>
          </Card>
          <Card>
            <h3 className="mb-3 text-sm font-semibold text-white">Server reference</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Server ID</dt><dd className="font-mono text-xs text-slate-300">{server.id.slice(0, 12)}…</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Status</dt><dd><Badge tone={online ? "green" : "gray"} dot>{online ? "Online" : "Offline"}</Badge></dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">AC version</dt><dd className="text-slate-300">{server.acVersion ?? "—"}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Include your Server ID when contacting support.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
