import { getServerAccess } from "@/lib/guards";
import { can } from "@/lib/team";
import { NoAccess } from "@/components/no-access";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { BypassManager, type BypassRow } from "./bypass-manager";
import { parseScope } from "@/lib/bypass";

export const dynamic = "force-dynamic";

export default async function WhitelistPage({ params }: { params: { id: string } }) {
  const { server, access } = await getServerAccess(params.id);
  if (!can(access, "config")) return <NoAccess serverId={server.id} perm="config" role={access.role} />;
  const rows = await db.whitelist.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  const list: BypassRow[] = rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    value: r.value,
    note: r.note,
    scope: parseScope(r.scope),
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Trust Whitelist"
        description="Players on this list are never kicked or banned by the protections you choose — everything, or only some (e.g. only FreeCam for a streamer with a camera script). Their detections are still logged."
      />
      <BypassManager serverId={server.id} rows={list} />
    </>
  );
}
