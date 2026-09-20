import { getOwnedServer } from "@/lib/guards";
import { LookupClient } from "./lookup-client";

export const dynamic = "force-dynamic";

export default async function LookupPage({
  params,
}: {
  params: { id: string };
}) {
  const { server } = await getOwnedServer(params.id);
  return <LookupClient serverId={server.id} />;
}
