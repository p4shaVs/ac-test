import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "./session";
import { resolveAccess } from "./team-access";

/**
 * Server pages: the server and the signed-in user's access to it — the owner
 * or a team member (src/lib/team.ts). Pages that need a permission check it
 * with `can(access, …)` and render <NoAccess/> when it is missing.
 */
export async function getServerAccess(serverId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const r = await resolveAccess(user, serverId);
  if (!r) notFound();
  return { server: r.server, user, access: r.access };
}

/** Owner-only pages (licence, token, installer…): team members get a 404. */
export async function getOwnedServer(serverId: string) {
  const r = await getServerAccess(serverId);
  if (!r.access.isOwner) notFound();
  return r;
}
