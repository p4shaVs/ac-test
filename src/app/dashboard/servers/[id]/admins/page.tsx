import { getServerAccess } from "@/lib/guards";
import { can } from "@/lib/team";
import { NoAccess } from "@/components/no-access";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { AdminsManager, type AdminRow } from "./admins-manager";

export const dynamic = "force-dynamic";

export default async function AdminsPage({
  params,
}: {
  params: { id: string };
}) {
  const { server, access } = await getServerAccess(params.id);
  if (!can(access, "admins")) return <NoAccess serverId={server.id} perm="admins" role={access.role} />;
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
