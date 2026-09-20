import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { ConsoleClient, type ConsoleLine } from "./console-client";

export const dynamic = "force-dynamic";

export default async function ConsolePage({
  params,
}: {
  params: { id: string };
}) {
  const { server } = await getOwnedServer(params.id);
  const logs = await db.serverLog.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
    take: 80,
  });

  const lines: ConsoleLine[] = logs
    .reverse()
    .map((l) => ({
      id: l.id,
      level: l.level,
      source: l.source,
      message: l.message,
      createdAt: l.createdAt.toISOString(),
    }));

  return <ConsoleClient serverId={server.id} initialLines={lines} online={server.status === "ONLINE"} />;
}
