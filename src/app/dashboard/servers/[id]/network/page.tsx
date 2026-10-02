import { getServerAccess } from "@/lib/guards";
import { can } from "@/lib/team";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { parseJson } from "@/lib/utils";
import {
  readNetworkPolicy,
  queryNetworkReputations,
  networkTypeLabel,
  describeFlag,
  NETWORK_MIN_OWNERS,
  NETWORK_WINDOW_DAYS,
} from "@/lib/network-bans";
import { NetworkView, type FlagRow, type OnlineFlag, type SharedRow } from "./network-view";

export const dynamic = "force-dynamic";

interface FlagDetails {
  distinctOwners?: number;
  strength?: "weak" | "strong";
  topReason?: string | null;
  categories?: { type: string; label: string; count: number }[];
  live?: boolean;
  lastBanAt?: string | null;
}

export default async function NetworkPage({ params }: { params: { id: string } }) {
  const { server, access } = await getServerAccess(params.id);
  const policy = readNetworkPolicy(server.config);
  const since30 = new Date(Date.now() - 30 * 86_400_000);

  const [flags, flags30, removed30, myShared, sharedRows, networkActive, ownerGroups, online] = await Promise.all([
    db.detection.findMany({
      where: { serverId: server.id, type: "NETWORK_BAN" },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { id: true, playerName: true, playerId: true, action: true, details: true, createdAt: true },
    }),
    db.detection.count({ where: { serverId: server.id, type: "NETWORK_BAN", createdAt: { gte: since30 } } }),
    db.detection.count({ where: { serverId: server.id, type: "NETWORK_BAN", action: "KICK", createdAt: { gte: since30 } } }),
    db.networkBan.count({ where: { ownerId: server.ownerId, active: true } }),
    db.networkBan.findMany({
      where: { serverId: server.id, ownerId: server.ownerId, active: true },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, playerName: true, type: true, createdAt: true },
    }),
    db.networkBan.count({ where: { active: true, type: { not: "MANUAL_CONDUCT" } } }),
    db.networkBan.groupBy({ by: ["ownerId"], where: { active: true } }),
    db.player.findMany({
      where: { serverId: server.id, online: true },
      select: { id: true, name: true, license: true, steam: true, discord: true },
      take: 500,
    }),
  ]);

  const reps = await queryNetworkReputations(server.ownerId, online);
  const onlineFlags: OnlineFlag[] = online
    .filter((p) => reps.get(p.id)?.flagged)
    .map((p) => {
      const r = reps.get(p.id)!;
      return {
        id: p.id,
        name: p.name,
        strength: r.strength === "strong" ? "strong" : "weak",
        communities: r.distinctOwners,
        summary: describeFlag(r),
        categories: r.categories.slice(0, 4),
      };
    });

  const flagRows: FlagRow[] = flags.map((f) => {
    const d = parseJson<FlagDetails>(f.details, {});
    return {
      id: f.id,
      playerId: f.playerId,
      playerName: f.playerName,
      action: f.action === "KICK" ? "KICK" : "LOG",
      live: d.live === true,
      strength: d.strength === "strong" ? "strong" : d.strength === "weak" ? "weak" : null,
      communities: d.distinctOwners ?? 0,
      categories: d.categories?.length
        ? d.categories.slice(0, 4)
        : d.topReason
          ? [{ type: d.topReason, label: networkTypeLabel(d.topReason), count: 1 }]
          : [],
      at: f.createdAt.toISOString(),
    };
  });

  const shared: SharedRow[] = sharedRows.map((r) => ({
    id: r.id,
    playerName: r.playerName,
    label: networkTypeLabel(r.type),
    at: r.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Moderation"
        title="CoreAC Network"
        description="One shared memory of cheaters across every CoreAC community. A player banned for cheating on enough other servers is flagged here the moment they join — or while they are already playing."
      />
      <NetworkView
        serverId={server.id}
        policy={policy}
        stats={{
          communities: ownerGroups.length,
          networkBans: networkActive,
          flags30,
          removed30,
          myShared,
        }}
        onlineFlags={onlineFlags}
        onlineCount={online.length}
        flags={flagRows}
        shared={shared}
        minOwners={NETWORK_MIN_OWNERS}
        windowDays={NETWORK_WINDOW_DAYS}
        canConfigure={can(access, "config")}
      />
    </>
  );
}
