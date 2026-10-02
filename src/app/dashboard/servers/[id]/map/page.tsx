import { getServerAccess } from "@/lib/guards";
import { can } from "@/lib/team";
import { db } from "@/lib/db";
import { MapView, type MapPlayer } from "./map-view";

export const dynamic = "force-dynamic";

export default async function MapPage({
  params,
}: {
  params: { id: string };
}) {
  const { server, access } = await getServerAccess(params.id);
  const players = await db.player.findMany({
    where: { serverId: server.id, online: true },
    orderBy: { trustScore: "asc" },
    take: 300,
  });

  const rows: MapPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    trustScore: p.trustScore,
    license: p.license,
    playtimeSec: p.playtimeSec,
    posX: p.posX,
    posY: p.posY,
    heading: p.heading,
    health: p.health,
    armor: p.armor,
    activity: p.activity,
    ping: p.ping,
  }));

  return <MapView serverId={server.id} players={rows} maxSlots={server.maxSlots} canModerate={can(access, "moderate")} />;
}
