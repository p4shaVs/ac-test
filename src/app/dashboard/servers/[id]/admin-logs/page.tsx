import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { parseJson } from "@/lib/utils";
import { AdminLogsView, type AdminLogRow } from "./admin-logs-view";

export const dynamic = "force-dynamic";

const MODERATION = new Set(["BAN", "KICK", "WARN", "UNBAN"]);

// Ban-detail actions read as a sentence rather than the raw log line.
const SENTENCE: Record<string, string> = {
  "FALSE BAN FIXED": "Ban corrected as a false positive and lifted",
  "BAN NOTE": "Added a note to the ban",
  "MARKED FALSE POSITIVE": "Ban marked as a false positive",
  "UNMARKED FALSE POSITIVE": "False-positive mark removed from the ban",
  UNBAN: "Ban lifted",
};

// Panel / in-game lines are written "ACTION → target (reason) — admin" or
// "What happened — admin"; console commands "> command (admin)".
function parseLine(message: string): { action: string; target: string | null; actor: string | null; description: string } {
  let m = /^(.+?) → (.+?) — ([^—]+)$/.exec(message);
  if (m) {
    const t = /^(.+?) \((.*)\)$/.exec(m[2]);
    const action = m[1].trim();
    const sentence = SENTENCE[action];
    const description = sentence ? sentence + (t ? ` (${t[2]})` : "") : t ? t[2] : message;
    return { action, target: (t ? t[1] : m[2]).trim(), actor: m[3].trim(), description };
  }
  m = /^> (.+) \(([^()]+)\)$/.exec(message);
  if (m) return { action: "CONSOLE", target: null, actor: m[2].trim(), description: m[1] };
  m = /^(.+?) — ([^—]+)$/.exec(message);
  if (m) {
    const what = m[1].trim();
    const action = /^Resource /.test(what)
      ? "RESOURCE"
      : /^All bans removed/.test(what)
        ? "UNBAN ALL"
        : /updated/i.test(what)
          ? "CONFIG"
          : "PANEL";
    return { action, target: null, actor: m[2].trim(), description: what };
  }
  return { action: "PANEL", target: null, actor: null, description: message };
}

// What your STAFF did — moderation and panel/in-game/console actions. CoreAC's
// own automatic actions are under Detections and Kicks/Bans.
export default async function AdminLogsPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);

  const [actions, logs] = await Promise.all([
    db.punishAction.findMany({
      where: { serverId: server.id, issuedBy: { notIn: ["AntiCheat", "CoreAC", "System"] } },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    db.serverLog.findMany({
      where: { serverId: server.id, source: { in: ["panel", "admin", "ingame", "console"] } },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
  ]);

  const rows: AdminLogRow[] = actions.map((a) => ({
    id: "a" + a.id,
    action: a.type,
    actor: a.issuedBy,
    target: a.playerName,
    description: a.reason,
    source: "moderation",
    at: a.createdAt.toISOString(),
    raw: {
      id: a.id,
      type: a.type,
      player: a.playerName,
      playerId: a.playerId,
      reason: a.reason,
      issuedBy: a.issuedBy,
      status: a.status,
      createdAt: a.createdAt.toISOString(),
      deliveredAt: a.deliveredAt?.toISOString() ?? null,
    },
  }));

  // A moderation from the panel is stored twice (the queued action and a log
  // line); keep the action and drop its log line.
  const modKeys = new Set(actions.map((a) => `${a.type}|${a.playerName}|${Math.round(a.createdAt.getTime() / 5000)}`));
  for (const l of logs) {
    const p = parseLine(l.message);
    if (MODERATION.has(p.action) && p.target) {
      const k = Math.round(l.createdAt.getTime() / 5000);
      if ([k - 1, k, k + 1].some((x) => modKeys.has(`${p.action}|${p.target}|${x}`))) continue;
    }
    rows.push({
      id: "l" + l.id,
      action: p.action,
      actor: p.actor ?? l.source,
      target: p.target,
      description: p.description,
      source: l.source,
      at: l.createdAt.toISOString(),
      raw: {
        id: l.id,
        level: l.level,
        source: l.source,
        message: l.message,
        meta: parseJson<Record<string, unknown>>(l.meta, {}),
        createdAt: l.createdAt.toISOString(),
      },
    });
  }
  // "Fix false ban" writes its own line and queues an UNBAN for the game
  // server; show it once, as the fix.
  const fixed = new Set(
    rows.filter((r) => r.action === "FALSE BAN FIXED" && r.target).map((r) => `${r.target}|${Math.round(new Date(r.at).getTime() / 5000)}`)
  );
  const merged = rows.filter((r) => {
    if (r.action !== "UNBAN" || r.source !== "moderation" || !r.target) return true;
    const k = Math.round(new Date(r.at).getTime() / 5000);
    return ![k - 1, k, k + 1].some((x) => fixed.has(`${r.target}|${x}`));
  });
  merged.sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0));

  return (
    <>
      <PageHeader
        eyebrow="Logs"
        title="Admin Logs"
        description="Everything your staff did — bans, kicks, warnings, unbans, configuration changes, resource actions and console commands. Automatic CoreAC actions are under Detections."
      />
      <AdminLogsView rows={merged.slice(0, 400)} />
    </>
  );
}
