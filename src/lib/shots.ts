import path from "path";

// Screenshot storage.
//
// Images used to be written to public/shots/, which had two problems:
//  • Next.js only serves files that exist in public/ at BUILD time. Anything
//    uploaded while `next start` is running returns 404 — the feature silently
//    broke in production and only worked under `next dev`.
//  • public/ is unauthenticated. A picture of a player's screen (and ban
//    evidence) was readable by anyone who guessed or leaked the request id.
//
// They now live outside public/ and are streamed by an owner-checked route:
// GET /api/servers/:serverId/shots/:requestId

export const SHOTS_DIR = path.join(process.cwd(), "storage", "shots");

export const MAX_SHOT_BYTES = 8 * 1024 * 1024;

export type ShotKind = { ext: "jpg" | "png" | "webp"; type: string };

/** Identify an image by its magic bytes. Anything else is rejected. */
export function sniffImage(buf: Buffer): ShotKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: "jpg", type: "image/jpeg" };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return { ext: "png", type: "image/png" };
  }
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { ext: "webp", type: "image/webp" };
  }
  return null;
}

/** Request ids are cuids; refuse anything that could escape the directory. */
export function isSafeShotId(id: string): boolean {
  return /^[a-z0-9]{8,64}$/i.test(id);
}

/** URL the panel uses to display a stored screenshot. */
export function shotUrl(serverId: string, requestId: string): string {
  return `/api/servers/${serverId}/shots/${requestId}`;
}
