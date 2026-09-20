import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { fail, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { SHOTS_DIR, isSafeShotId } from "@/lib/shots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

// Streams a stored screenshot to the owner of the server it belongs to.
// Screenshots are pictures of a player's screen and double as ban evidence,
// so they are never public.
export async function GET(_req: NextRequest, ctx: { params: { id: string; rid: string } }) {
  try {
    const { server } = await requireOwnedServer(ctx.params.id);
    const rid = ctx.params.rid;
    if (!isSafeShotId(rid)) return fail(400, "Invalid request id");

    const row = await db.screenshotRequest.findFirst({
      where: { id: rid, serverId: server.id },
      select: { id: true },
    });
    if (!row) return fail(404, "Not found");

    for (const ext of Object.keys(TYPES)) {
      try {
        const data = await fs.readFile(path.join(SHOTS_DIR, `${rid}.${ext}`));
        return new Response(data, {
          headers: {
            "Content-Type": TYPES[ext],
            "Cache-Control": "private, max-age=300",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch {
        // try the next extension
      }
    }
    return fail(404, "Not found");
  } catch (e) {
    if (e instanceof ApiError) return fail(e.status, e.message, e.code);
    console.error("[SHOT_GET]", e);
    return fail(500, "Server error");
  }
}
