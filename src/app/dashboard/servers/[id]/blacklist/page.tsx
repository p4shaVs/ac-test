import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { MODEL_COUNTS, modelNameForHash } from "@/lib/model-catalog";
import { ModelSearch, type BlacklistState } from "./model-search";
import { PresetCard } from "./preset-card";
import { trollPropPreset } from "@/lib/troll-props";

export const dynamic = "force-dynamic";

export default async function BlacklistPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const rows = await db.blacklist.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  // model adı (lowercase) -> mevcut kara liste durumu. Seçici modeli sayısal
  // hash olarak kaydeder; katalog adına geri çevrilmezse sayfa yenilenince
  // listedeki model "ekli değil" görünüyordu.
  const state: Record<string, BlacklistState> = {};
  for (const r of rows) {
    state[modelNameForHash(r.model)] = { id: r.id, action: r.action, enabled: r.enabled, kind: r.kind };
  }

  const preset = trollPropPreset();
  const listed = new Set(rows.filter((r) => r.kind === "object").map((r) => r.model));
  const presetInstalled = preset.filter((m) => listed.has(String(m.hash))).length;

  return (
    <>
      <PageHeader
        title="Model search"
        description="Search and blacklist vehicles, peds, weapons and objects. (Explosions: Configuration → Explosions.)"
      />
      <PresetCard serverId={server.id} total={preset.length} installed={presetInstalled} />
      <ModelSearch
        serverId={server.id}
        state={state}
        counts={MODEL_COUNTS}
        imgBase={process.env.NEXT_PUBLIC_MODEL_IMG_BASE ?? ""}
      />
    </>
  );
}
