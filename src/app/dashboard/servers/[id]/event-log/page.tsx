import { getOwnedServer } from "@/lib/guards";
import { parseJson } from "@/lib/utils";
import { EventLogView } from "./event-log-view";

export const dynamic = "force-dynamic";

export default async function EventLogPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const config = parseJson<Record<string, unknown>>(server.config, {});
  return <EventLogView serverId={server.id} initialEnabled={config.eventLogEnabled === true} />;
}
