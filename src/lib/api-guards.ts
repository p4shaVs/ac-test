import { db } from "./db";
import { ApiError, requireUser } from "./api";

/** API route'larında: geçerli kullanıcının sahip olduğu sunucuyu getirir. */
export async function requireOwnedServer(serverId: string) {
  const user = await requireUser();
  const server = await db.server.findFirst({
    where: { id: serverId, ownerId: user.id },
  });
  if (!server) throw new ApiError(404, "Server not found");
  return { server, user };
}
