import Link from "next/link";
import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { Card, StatCard, Badge, PageHeader } from "@/components/ui";
import { Icons } from "@/components/icons";
import { detectionLabel } from "@/lib/detection-actions";
import { readNetworkPolicy, NETWORK_MIN_OWNERS } from "@/lib/network-bans";
import { parseJson, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface FlagDetails {
  distinctOwners?: number;
  totalBans?: number;
  topReason?: string | null;
}

export default async function NetworkPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const policy = readNetworkPolicy(server.config);

  // Flags seen on THIS server (the connect-time network warnings we recorded).
  const flags = await db.detection.findMany({
    where: { serverId: server.id, type: "NETWORK_BAN" },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const blockedCount = flags.filter((f) => f.action === "KICK").length;

  // This server's own contribution + the network-wide (non-identifying) scale.
  const [yourContributions, networkRecords, ownerGroups] = await Promise.all([
    db.networkBan.count({ where: { ownerId: server.ownerId, active: true } }),
    db.networkBan.count({ where: { active: true } }),
    db.networkBan.groupBy({ by: ["ownerId"], where: { active: true } }),
  ]);
  const communities = ownerGroups.length;

  const policyTone = policy.action === "KICK" ? "red" : policy.action === "LOG" ? "amber" : "gray";
  const policyText =
    policy.action === "KICK"
      ? "Blocking flagged players"
      : policy.action === "LOG"
      ? "Logging flagged players (not blocking)"
      : "Network check is off";

  return (
    <div>
      <PageHeader
        title="Network Reputation"
        description="Cross-server ban intelligence. A player banned across several communities is flagged the moment they connect here."
        actions={
          <Link href={`/dashboard/servers/${server.id}/settings`} className="btn-secondary text-xs">
            <Icons.config size={14} /> Network settings
          </Link>
        }
      />

      {/* Policy status */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/5 text-brand-300 ring-1 ring-inset ring-white/10">
              <Icons.globe size={20} />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">On-connect action</p>
              <p className="text-xs text-slate-500">
                A player is flagged only after ≥ {NETWORK_MIN_OWNERS} distinct communities have
                banned them. Only hashed identifiers are shared — never IPs.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={policyTone} dot>{policyText}</Badge>
            <Badge tone={policy.contribute ? "green" : "gray"} dot>
              {policy.contribute ? "Contributing" : "Not contributing"}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Stats */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Flags on this server" value={flags.length} icon="globe" accent="brand" />
        <StatCard label="Entries blocked" value={blockedCount} icon="ban" accent="rose" />
        <StatCard label="Your contributions" value={yourContributions} icon="shieldCheck" accent="emerald" />
        <StatCard
          label="Network coverage"
          value={communities}
          sub={`${networkRecords.toLocaleString("en-US")} ban records shared`}
          icon="users"
          accent="violet"
        />
      </div>

      {/* Recent flags */}
      <Card>
        <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
          <Icons.activity size={15} className="text-brand-400" /> Recent network flags
        </h3>
        <p className="mb-4 text-xs text-slate-500">
          Players the network warned you about on connect (most recent first).
        </p>

        {flags.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-slate-500">
            No network flags yet. As more communities join the network and contribute bans, matches
            will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="pb-2 pr-3 font-semibold">Player</th>
                  <th className="pb-2 pr-3 font-semibold">Banned by</th>
                  <th className="pb-2 pr-3 font-semibold">Top reason</th>
                  <th className="pb-2 pr-3 font-semibold">Action</th>
                  <th className="pb-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {flags.map((f) => {
                  const d = parseJson<FlagDetails>(f.details, {});
                  const owners = d.distinctOwners ?? 0;
                  return (
                    <tr key={f.id}>
                      <td className="py-2.5 pr-3 font-medium text-slate-200">{f.playerName}</td>
                      <td className="py-2.5 pr-3 text-slate-400">
                        {owners} {owners === 1 ? "community" : "communities"}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-400">
                        {d.topReason ? detectionLabel(d.topReason) : "—"}
                      </td>
                      <td className="py-2.5 pr-3">
                        <Badge tone={f.action === "KICK" ? "red" : "amber"}>
                          {f.action === "KICK" ? "Blocked" : "Logged"}
                        </Badge>
                      </td>
                      <td className="py-2.5 text-slate-500">{timeAgo(f.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
