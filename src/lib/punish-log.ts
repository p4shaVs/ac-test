import { db } from "./db";
import { parseJson } from "./utils";
import { detectionLabel } from "./detection-actions";
import { evidenceEntries, type EvidenceEntry } from "./evidence";

// Kicks and warnings for the moderation pages, each with the detection that
// caused it when CoreAC issued it automatically.

export interface PunishRow {
  id: string;
  type: "KICK" | "WARN";
  playerId: string | null;
  playerName: string;
  reason: string;
  issuedBy: string;
  auto: boolean;
  status: string;
  createdAt: string;
  deliveredAt: string | null;
  identifiers: { license: string | null; discord: string | null; steam: string | null } | null;
  detection: {
    id: string;
    type: string;
    label: string;
    severity: string;
    createdAt: string;
    evidence: EvidenceEntry[];
    details: Record<string, unknown>;
  } | null;
}

const AUTO = new Set(["AntiCheat", "CoreAC", "System"]);

export async function loadPunishments(serverId: string, type: "KICK" | "WARN", take = 300): Promise<PunishRow[]> {
  const rows = await db.punishAction.findMany({
    where: { serverId, type },
    orderBy: { createdAt: "desc" },
    take,
    include: { player: { select: { license: true, discord: true, steam: true } } },
  });

  // An automatic kick is written right after the detection that caused it.
  const autoRows = rows.filter((r) => AUTO.has(r.issuedBy) && r.playerId);
  const detections = autoRows.length
    ? await db.detection.findMany({
        where: {
          serverId,
          action: type,
          playerId: { in: Array.from(new Set(autoRows.map((r) => r.playerId!))) },
          createdAt: {
            gte: new Date(Math.min(...autoRows.map((r) => r.createdAt.getTime())) - 15_000),
            lte: new Date(Math.max(...autoRows.map((r) => r.createdAt.getTime())) + 5_000),
          },
        },
        orderBy: { createdAt: "desc" },
        take: 600,
        select: { id: true, type: true, severity: true, createdAt: true, details: true, playerId: true },
      })
    : [];

  const used = new Set<string>();
  return rows.map((r) => {
    const auto = AUTO.has(r.issuedBy);
    let det: (typeof detections)[number] | undefined;
    if (auto && r.playerId) {
      const t = r.createdAt.getTime();
      det = detections.find(
        (d) => !used.has(d.id) && d.playerId === r.playerId && d.createdAt.getTime() <= t + 5_000 && d.createdAt.getTime() >= t - 15_000
      );
      if (det) used.add(det.id);
    }
    const details = det ? parseJson<Record<string, unknown>>(det.details, {}) : {};
    // "Automatic kick: SPEED_HACK" → the readable detection name.
    const m = /^Automatic (?:kick|warn(?:ing)?):\s*([A-Z0-9_]+)$/.exec(r.reason);
    return {
      id: r.id,
      type: type,
      playerId: r.playerId,
      playerName: r.playerName,
      reason: m ? detectionLabel(m[1]) : r.reason,
      issuedBy: r.issuedBy,
      auto,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
      identifiers: r.player ? { license: r.player.license, discord: r.player.discord, steam: r.player.steam } : null,
      detection: det
        ? {
            id: det.id,
            type: det.type,
            label: detectionLabel(det.type),
            severity: det.severity,
            createdAt: det.createdAt.toISOString(),
            evidence: evidenceEntries(details, 9),
            details,
          }
        : null,
    };
  });
}
