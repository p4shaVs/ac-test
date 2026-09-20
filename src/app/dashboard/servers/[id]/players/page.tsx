import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/ui";
import { getCachedAvatar, warmAvatars } from "@/lib/discord-avatar";
import { PlayersTable, type PlayerRow } from "./players-table";

export const dynamic = "force-dynamic";

export default async function PlayersPage({
  params,
}: {
  params: { id: string };
}) {
  const { server } = await getOwnedServer(params.id);

  const players = await db.player.findMany({
    where: { serverId: server.id },
    orderBy: [{ online: "desc" }, { lastSeenAt: "desc" }],
    take: 200,
  });

  // Kick off avatar resolution for anyone not cached yet (shows on next load).
  warmAvatars(players.map((p) => p.discord));

  const rows: PlayerRow[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    online: p.online,
    license: p.license,
    steam: p.steam,
    discord: p.discord,
    ip: p.ip,
    trustScore: p.trustScore,
    ping: p.online ? p.ping : null,
    avatarUrl: getCachedAvatar(p.discord),
    lastSeenAt: p.lastSeenAt.toISOString(),
  }));

  if (players.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="No player records yet"
        description="Players appear here once the server connects and they join."
      />
    );
  }

  return <PlayersTable serverId={server.id} players={rows} />;
}
