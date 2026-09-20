import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

const levelStyle: Record<string, string> = {
  INFO: "text-slate-400 bg-white/5",
  WARN: "text-amber-300 bg-amber-500/10",
  ERROR: "text-rose-300 bg-rose-500/10",
  DETECTION: "text-brand-300 bg-brand-500/10",
};

export default async function LogsPage({
  params,
}: {
  params: { id: string };
}) {
  const { server } = await getOwnedServer(params.id);
  const logs = await db.serverLog.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  if (logs.length === 0) {
    return (
      <EmptyState
        icon="logs"
        title="No log entries"
        description="System events, detections and panel actions are listed here."
      />
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-base-950/60 p-2 font-mono text-sm">
      {logs.map((l) => (
        <div
          key={l.id}
          className="flex items-start gap-3 rounded-lg px-3 py-2 hover:bg-white/[0.02]"
        >
          <span className="shrink-0 text-xs text-slate-600">
            {formatDateTime(l.createdAt)}
          </span>
          <span
            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              levelStyle[l.level] ?? levelStyle.INFO
            }`}
          >
            {l.level}
          </span>
          <span className="shrink-0 text-xs text-slate-500">[{l.source}]</span>
          <span className="text-slate-300">{l.message}</span>
        </div>
      ))}
    </div>
  );
}
