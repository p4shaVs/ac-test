import { NextRequest } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { db } from "@/lib/db";
import { fail } from "@/lib/api";
import { MAX_SHOT_BYTES, SHOTS_DIR, isSafeShotId, shotUrl, sniffImage } from "@/lib/shots";
import { rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// screenshot-basic uploads the captured frame here (multipart). The request
// comes straight from the player's game client, so there is no Bearer token:
// the unguessable request id (?rid=) is the credential, and only a PENDING
// request can be completed.
//
// Hardening:
//  • The body must actually be a JPEG/PNG/WebP image (magic bytes).
//  • The file is stored OUTSIDE public/ and served by an owner-checked route
//    (see src/lib/shots.ts for why public/ was both broken and unsafe).
//  • The stored URL is a same-origin path. It is no longer built from the
//    Host / X-Forwarded-Host headers, which the uploader controls and could
//    point at an attacker's domain.
export async function POST(req: NextRequest) {
  try {
    const rid = new URL(req.url).searchParams.get("rid") ?? "";
    if (!isSafeShotId(rid)) return fail(400, "Invalid request id");

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
    if (!rateLimit(`ssup:${ip}`, 60, 60_000).success) return fail(429, "Too many requests");

    const reqRow = await db.screenshotRequest.findUnique({
      where: { id: rid },
      select: { id: true, status: true, serverId: true },
    });
    if (!reqRow) return fail(404, "Request not found");
    if (reqRow.status !== "PENDING") return fail(409, "Request already completed");

    const form = await req.formData();
    let file: File | null = null;
    for (const [, v] of form.entries()) {
      if (v instanceof File) {
        file = v;
        break;
      }
    }
    if (!file) return fail(400, "No file");
    if (file.size === 0 || file.size > MAX_SHOT_BYTES) return fail(413, "Invalid file size");

    const buf = Buffer.from(await file.arrayBuffer());
    const kind = sniffImage(buf);
    if (!kind) return fail(415, "Not an image");

    await fs.mkdir(SHOTS_DIR, { recursive: true });
    await fs.writeFile(path.join(SHOTS_DIR, `${rid}.${kind.ext}`), buf);

    const url = shotUrl(reqRow.serverId, rid);
    await db.screenshotRequest.update({
      where: { id: rid },
      data: { status: "DONE", url, completedAt: new Date() },
    });

    // screenshot-basic reads `url` from the JSON response.
    return Response.json({ url });
  } catch (e) {
    console.error("[SS_UPLOAD]", e);
    return fail(500, "Upload failed");
  }
}
