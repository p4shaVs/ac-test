import type { Metadata } from "next";
import { db } from "@/lib/db";
import { PageHeader, StatusBadge, EmptyState } from "@/components/ui";
import { timeAgo, relativeDays } from "@/lib/utils";

export const metadata: Metadata = { title: "Servers" };
export const dynamic = "force-dynamic";

export default async function AdminServersPage() {
  const servers = await db.server.findMany({
    orderBy: { createdAt: "desc" },
    take: 300,
    include: {
      owner: { select: { username: true, email: true } },
      licenseKey: { select: { key: true, status: true, expiresAt: true } },
      _count: { select: { players: true, bans: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Servers"
        description="Every protected server on the platform, with its licence. Manage licences under Licence Keys."
      />
      {servers.length === 0 ? (
        <EmptyState icon="server" title="No servers" description="No servers have been created yet." />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-white/5 bg-base-850/60">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 font-medium">Server</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Licence</th>
                <th className="px-4 py-3 font-medium">Players</th>
                <th className="px-4 py-3 font-medium">Bans</th>
                <th className="px-4 py-3 font-medium">AC version</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr key={s.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-200">{s.name}</p>
                    <p className="text-xs text-slate-500">{s.ip ? `${s.ip}:${s.port}` : "—"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-slate-300">{s.owner.username}</p>
                    <p className="text-xs text-slate-500">{s.owner.email}</p>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={s.status} /></td>
                  <td className="px-4 py-3">
                    {s.licenseKey ? (
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-[11px] text-slate-300">{s.licenseKey.key}</code>
                          <StatusBadge status={s.licenseKey.status} />
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {s.licenseKey.expiresAt ? relativeDays(s.licenseKey.expiresAt) : "No expiry"}
                        </p>
                      </div>
                    ) : (
                      <span className="text-rose-300">No licence — cannot connect</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400">{s._count.players}</td>
                  <td className="px-4 py-3 text-slate-400">{s._count.bans}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{s.acVersion ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {s.lastSeenAt ? timeAgo(s.lastSeenAt) : "Never"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
