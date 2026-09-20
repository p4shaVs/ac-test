import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader, EmptyState } from "@/components/ui";
import { ResourcesManager, type ResourceRow } from "./resources-manager";

export const dynamic = "force-dynamic";

export default async function ResourcesPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const resources = await db.serverResource.findMany({
    where: { serverId: server.id },
    orderBy: { name: "asc" },
  });

  const rows: ResourceRow[] = resources.map((r) => ({ id: r.id, name: r.name, state: r.state }));

  return (
    <>
      <PageHeader
        title="Resources"
        description="View the FiveM resources on the server and start, stop or restart them."
      />
      {rows.length === 0 ? (
        <EmptyState
          icon="cube"
          title="No resources found"
          description="Appears once the server connects and sends its resource list. Install the resource and start the server."
        />
      ) : (
        <ResourcesManager serverId={server.id} resources={rows} />
      )}
    </>
  );
}
