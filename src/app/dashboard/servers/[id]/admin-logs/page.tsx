import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, Badge, Card } from "@/components/ui";
import { Icons } from "@/components/icons";
import { timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

// A log of what your STAFF did — kicks/bans/warns/unbans they issued and the
// panel/in-game actions they took. The anti-cheat's own automatic actions are
// excluded (those live under Events / Detections).
export default async function AdminLogsPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);

  const [actions, logs] = await Promise.all([
    db.punishAction.findMany({
      where: { serverId: server.id, issuedBy: { not: "AntiCheat" } },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
    db.serverLog.findMany({
      where: { serverId: server.id, source: { in: ["panel", "admin", "ingame"] } },
      orderBy: { createdAt: "desc" },
      take: 120,
    }),
  ]);

  type Row = { id: string; who: string; kind: string; tone: "red" | "amber" | "green" | "blue" | "gray"; text: string; at: Date };
  const KIND: Record<string, { tone: Row["tone"]; label: string }> = {
    BAN: { tone: "red", label: "Ban" },
    KICK: { tone: "amber", label: "Kick" },
    WARN: { tone: "amber", label: "Warn" },
    UNBAN: { tone: "green", label: "Unban" },
  };

  const rows: Row[] = [
    ...actions.map((a) => ({
      id: "a" + a.id,
      who: a.issuedBy,
      kind: (KIND[a.type]?.label ?? a.type),
      tone: (KIND[a.type]?.tone ?? "gray") as Row["tone"],
      text: `${a.playerName} — ${a.reason}`,
      at: a.createdAt,
    })),
    ...logs.map((l) => {
      // Panel/in-game log lines are formatted "ACTION → target — admin".
      const who = l.message.includes("—") ? l.message.split("—").pop()!.trim() : l.source;
      return {
        id: "l" + l.id,
        who,
        kind: "Action",
        tone: "blue" as Row["tone"],
        text: l.message,
        at: l.createdAt,
      };
    }),
  ]
    .sort((x, y) => y.at.getTime() - x.at.getTime())
    .slice(0, 160);

  // De-duplicate: a moderation shows up as both a PunishAction and a ServerLog.
  const seen = new Set<string>();
  const merged = rows.filter((r) => {
    const key = r.at.getTime() + "|" + r.text.slice(0, 24);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return (
    <>
      <PageHeader title="Admin Logs" description="Everything your staff did — moderation and panel actions. Automatic anti-cheat actions are under Events." />
      {merged.length === 0 ? (
        <EmptyState icon="history" title="No admin activity yet" description="When an admin kicks, bans, warns or changes config, it is recorded here." />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-white/5">
            {merged.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02]">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-300">
                  <Icons.user size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{r.text}</p>
                  <p className="text-xs text-slate-500">
                    <span className="text-slate-400">{r.who}</span> · {timeAgo(r.at)}
                  </p>
                </div>
                <Badge tone={r.tone}>{r.kind}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
