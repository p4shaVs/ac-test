import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { parseJson } from "@/lib/utils";

interface ReplayFrame {
  t: number;
  x: number; y: number; z: number;
  speed: number; vz: number;
  hp: number; armor: number;
  coll: boolean; inVeh: boolean;
}

// Bir tespitin ban-anı replay tamponunu döndürür (yalnızca sunucu sahibi).
// "Neden banlandık" — Yapılandırma sayfasındaki izleme özelliği için.
export const GET = handler(
  async (_req: Request, ctx: { params: { id: string; detectionId: string } }) => {
    await requireOwnedServer(ctx.params.id);

    const detection = await db.detection.findFirst({
      where: { id: ctx.params.detectionId, serverId: ctx.params.id },
    });
    if (!detection) throw new ApiError(404, "Detection not found");

    const replay = parseJson<ReplayFrame[]>(detection.replay, []);
    const details = parseJson<Record<string, unknown>>(detection.details, {});

    // Ban anının kanıtı: gerçek ekran görüntüsü serisi (yüklenmiş olanlar).
    const screenshots = await db.screenshotRequest.findMany({
      where: { detectionId: detection.id, status: "DONE" },
      orderBy: { seq: "asc" },
      select: { id: true, url: true, seq: true, completedAt: true },
    });

    return ok({
      id: detection.id,
      type: detection.type,
      severity: detection.severity,
      playerName: detection.playerName,
      action: detection.action,
      createdAt: detection.createdAt.toISOString(),
      details,
      replay,
      screenshots,
    });
  }
);
