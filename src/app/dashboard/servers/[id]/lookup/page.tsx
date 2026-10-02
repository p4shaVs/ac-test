import { getOwnedServer } from "@/lib/guards";
import { LookupClient } from "./lookup-client";

export const dynamic = "force-dynamic";

export default async function LookupPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { q?: string; p?: string };
}) {
  const { server } = await getOwnedServer(params.id);
  return (
    <LookupClient
      serverId={server.id}
      initialQuery={typeof searchParams.q === "string" ? searchParams.q.slice(0, 120) : ""}
      initialPlayer={typeof searchParams.p === "string" && /^[a-z0-9]{10,40}$/i.test(searchParams.p) ? searchParams.p : null}
    />
  );
}
