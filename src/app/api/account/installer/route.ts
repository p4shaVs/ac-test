import { readFile } from "fs/promises";
import path from "path";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/api";
import { env } from "@/lib/env";
import { publicApiBase } from "@/lib/install-key";

export const dynamic = "force-dynamic";

/** Built by `npm run build:installer` (installer-win/build.cjs) and committed. */
const EXE = path.join(process.cwd(), "installer-win", "CoreAC-Setup.exe");
const SETUP_MARKER = "#COREAC-SETUP#";

// The Windows installer for signed-in customers with a licence. The exe is the
// same for everyone; the panel address it should talk to is appended after the
// PE image (Windows ignores trailing data) so one build works for any panel.
export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return new Response("Sign in to download the installer.", { status: 401 });
  }
  const owns = await db.server.count({ where: { ownerId: user.id, licenseKeyId: { not: null } } });
  if (!owns) {
    return new Response("Add a server with your licence key first.", { status: 403 });
  }

  let exe: Buffer;
  try {
    exe = await readFile(EXE);
  } catch {
    return new Response("The installer has not been built on this panel (npm run build:installer).", { status: 503 });
  }

  const api = publicApiBase(env.APP_URL, headers());
  const trailer = Buffer.from(`\r\n${SETUP_MARKER}${JSON.stringify({ api })}#END#`, "utf8");
  const body = Buffer.concat([exe, trailer]);

  return new Response(new Uint8Array(body), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.microsoft.portable-executable",
      "Content-Disposition": 'attachment; filename="CoreAC-Setup.exe"',
      "Content-Length": String(body.length),
      "Cache-Control": "no-store",
    },
  });
}
