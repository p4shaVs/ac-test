import { getOwnedServer } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { detectionLabel } from "@/lib/detection-actions";
import { parseBanNotes } from "@/lib/ban-ops";
import { BansManager, type BanRow } from "./bans-manager";

export const dynamic = "force-dynamic";

export default async function BansPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { ban?: string };
}) {
  const { server } = await getOwnedServer(params.id);
  const bans = await db.ban.findMany({
    where: { serverId: server.id },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    take: 500,
    include: { detection: { select: { type: true } } },
  });

  const rows: BanRow[] = bans.map((b) => ({
    id: b.id,
    code: b.code,
    playerName: b.playerName,
    license: b.license,
    discord: b.discord,
    steam: b.steam,
    ip: b.ip,
    reason: b.reason,
    bannedBy: b.bannedBy,
    createdAt: b.createdAt.toISOString(),
    expiresAt: b.expiresAt ? b.expiresAt.toISOString() : null,
    active: b.active,
    permanent: b.permanent,
    falsePositive: b.falsePositive,
    evasionOf: b.evasionOf,
    detectionId: b.detectionId,
    module: b.detection ? detectionLabel(b.detection.type) : b.evasionOf ? "Ban evasion" : null,
    notes: parseBanNotes(b.notes).length,
  }));

  const initial = typeof searchParams.ban === "string" && rows.some((r) => r.id === searchParams.ban) ? searchParams.ban : null;

  return (
    <>
      <PageHeader
        eyebrow="Moderation"
        title="Bans"
        description="Every ban, automatic or by staff. Open one to see the evidence, the player's history, notes and the raw record — and to lift it or correct it as a false positive."
      />
      <BansManager serverId={server.id} bans={rows} initialOpen={initial} />
    </>
  );
}
