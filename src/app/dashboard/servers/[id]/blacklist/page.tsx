import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { MODEL_COUNTS } from "@/lib/model-catalog";
import { ModelSearch, type BlacklistState } from "./model-search";

export const dynamic = "force-dynamic";

export default async function BlacklistPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const rows = await db.blacklist.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  // model adı (lowercase) -> mevcut kara liste durumu
  const state: Record<string, BlacklistState> = {};
  for (const r of rows) {
    state[r.model.toLowerCase()] = { id: r.id, action: r.action, enabled: r.enabled, kind: r.kind };
  }

  return (
    <>
      <PageHeader
        title="Model search"
        description="Search and blacklist vehicles, peds, weapons and objects. (Explosions: Configuration → Explosions.)"
      />
      <ModelSearch
        serverId={server.id}
        state={state}
        counts={MODEL_COUNTS}
        imgBase={process.env.NEXT_PUBLIC_MODEL_IMG_BASE ?? ""}
      />
    </>
  );
}
