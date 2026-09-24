import { NextRequest } from "next/server";
import { authenticateServer } from "@/lib/server-auth";
import { buildResourceZip } from "@/lib/install-package";
import { rateLimit } from "@/lib/ratelimit";

// Installer bu ucu `Authorization: Bearer aeigs_srv_...` ile çağırır ve korumalı
// kaynağı .zip olarak indirir. Token/lisans geçersizse authenticateServer 401/403
// fırlatır (kaynak asla anonim indirilemez).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  let server;
  try {
    server = await authenticateServer(req);
  } catch (err: unknown) {
    const status =
      err && typeof err === "object" && "status" in err
        ? (err as { status: number }).status
        : 401;
    const message =
      err && typeof err === "object" && "message" in err
        ? (err as { message: string }).message
        : "Invalid server token";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Kaynak paketi ~780 KB üretir; token sızsa bile tekrar tekrar indirilmesin.
  const rl = rateLimit(`install:${server.id}`, 6, 60_000);
  if (!rl.success) {
    return new Response(JSON.stringify({ ok: false, error: "Rate limit" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const zip = await buildResourceZip();
    return new Response(new Uint8Array(zip), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="aeigs-anticheat.zip"',
        "Content-Length": String(zip.length),
        "Cache-Control": "no-store",
        "X-Server-Id": server.id,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to package resource";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
