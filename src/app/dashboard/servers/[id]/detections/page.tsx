import { getServerAccess } from "@/lib/guards";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { DETECTION_CATEGORIES, DETECTION_TYPES, detectionLabel } from "@/lib/detection-actions";
import { evidenceLine } from "@/lib/evidence";
import { DetectionsView, type DetectionRow } from "./detections-view";

export const dynamic = "force-dynamic";

const CATEGORY = new Map(DETECTION_TYPES.map((d) => [d.type, d.category]));

export default async function DetectionsPage({ params }: { params: { id: string } }) {
  const { server } = await getServerAccess(params.id);
  const detections = await db.detection.findMany({
    where: { serverId: server.id },
    orderBy: { createdAt: "desc" },
    take: 400,
    select: {
      id: true,
      type: true,
      severity: true,
      action: true,
      playerName: true,
      playerId: true,
      details: true,
      createdAt: true,
      ban: { select: { id: true, code: true, active: true } },
      _count: { select: { screenshots: true } },
    },
  });

  const rows: DetectionRow[] = detections.map((d) => ({
    id: d.id,
    type: d.type,
    label: detectionLabel(d.type),
    category: CATEGORY.get(d.type) ?? "other",
    severity: d.severity,
    action: (d.action ?? "LOG") as DetectionRow["action"],
    playerName: d.playerName,
    playerId: d.playerId,
    summary: evidenceLine(d.details, 3),
    createdAt: d.createdAt.toISOString(),
    ban: d.ban,
    screenshots: d._count.screenshots,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Logs"
        title="Detections"
        description="Every detection CoreAC raised — what it measured, what it did (log, kick or ban), screenshots and the replay of the moment. Select one for the full record as JSON."
      />
      <DetectionsView serverId={server.id} rows={rows} categories={DETECTION_CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} />
    </>
  );
}
