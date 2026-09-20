import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { AdminsManager, type AdminRow } from "./admins-manager";

export const dynamic = "force-dynamic";

export default async function AdminsPage({
  params,
}: {
  params: { id: string };
}) {
  const { server } = await getOwnedServer(params.id);
  const admins = await db.serverAdmin.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "asc" },
  });

  const rows: AdminRow[] = admins.map((a) => ({
    id: a.id,
    identifier: a.identifier,
    displayName: a.displayName,
    role: a.role,
    permissions: parseJson<string[]>(a.permissions, []),
    createdAt: a.createdAt.toISOString(),
  }));

  return <AdminsManager serverId={server.id} admins={rows} />;
}
