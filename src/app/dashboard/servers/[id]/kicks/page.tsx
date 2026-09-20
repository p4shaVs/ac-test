import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader, EmptyState, Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function KicksPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const kicks = await db.punishAction.findMany({
    where: { serverId: server.id, type: "KICK" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <>
      <PageHeader title="Kicks" description="Kicks issued to players." />
      {kicks.length === 0 ? (
        <EmptyState icon="kick" title="No kicks" description="Kicks issued to players are listed here." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5 bg-base-850/60">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Player</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Issued by</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {kicks.map((k) => (
                <tr key={k.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 font-medium text-slate-200">{k.playerName}</td>
                  <td className="px-4 py-3 text-slate-300">{k.reason}</td>
                  <td className="px-4 py-3 text-slate-400">{k.issuedBy}</td>
                  <td className="px-4 py-3">
                    <Badge tone={k.status === "DELIVERED" ? "green" : "amber"}>
                      {k.status === "DELIVERED" ? "Delivered" : "Bekliyor"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDateTime(k.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
