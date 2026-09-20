import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { sanitizeProtectedEvents, KNOWN_CHEAT_EVENTS } from "@/lib/events-config";
import { EventsManager } from "./events-manager";

export const dynamic = "force-dynamic";

export default async function EventsPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const config = parseJson<Record<string, unknown>>(server.config, {});
  const events = sanitizeProtectedEvents(config.protectedEvents);

  // How many CHEAT_EVENT_HONEYPOT hits in the last 7 days (shows it working).
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentHits = await db.detection.count({
    where: { serverId: server.id, type: "CHEAT_EVENT_HONEYPOT", createdAt: { gte: since } },
  });

  return (
    <EventsManager
      serverId={server.id}
      events={events}
      known={KNOWN_CHEAT_EVENTS}
      recentHits={recentHits}
    />
  );
}
