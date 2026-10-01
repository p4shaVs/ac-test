import { getOwnedServer } from "@/lib/guards";
import { LookupClient } from "./lookup-client";

export const dynamic = "force-dynamic";

export default async function LookupPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { q?: string };
}) {
  const { server } = await getOwnedServer(params.id);
  return <LookupClient serverId={server.id} initialQuery={typeof searchParams.q === "string" ? searchParams.q.slice(0, 120) : ""} />;
}
