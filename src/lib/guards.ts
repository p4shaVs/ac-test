import { notFound, redirect } from "next/navigation";
import { db } from "./db";
import { getCurrentUser } from "./session";

/** Server component'lerde: geçerli kullanıcının sahip olduğu sunucuyu getirir. */
export async function getOwnedServer(serverId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const server = await db.server.findFirst({
    where: { id: serverId, ownerId: user.id },
    include: { licenseKey: { include: { product: true } } },
  });
  if (!server) notFound();
  return { server, user };
}
