import { getServerAccess } from "@/lib/guards";
import { can } from "@/lib/team";
import { NoAccess } from "@/components/no-access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { ConsoleClient, type ConsoleLine } from "./console-client";

export const dynamic = "force-dynamic";

export default async function ConsolePage({
  params,
}: {
  params: { id: string };
}) {
  const { server, access } = await getServerAccess(params.id);
  if (!can(access, "console")) return <NoAccess serverId={server.id} perm="console" role={access.role} />;
  const logs = await db.serverLog.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  const lines: ConsoleLine[] = logs.reverse().map((l) => ({
    id: l.id,
    level: l.level,
    source: l.source,
    message: l.message,
    createdAt: l.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        eyebrow="Logs"
        title="Console"
        description="Run commands on your game server and watch its log live. Output refreshes every few seconds."
      />
      <ConsoleClient serverId={server.id} initialLines={lines} online={server.status === "ONLINE"} />
    </>
  );
}
