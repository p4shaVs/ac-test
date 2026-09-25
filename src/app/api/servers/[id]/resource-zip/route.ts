import { NextRequest } from "next/server";
import { requireOwnedServer } from "@/lib/api-guards";
import { buildResourceZip } from "@/lib/install-package";

// Manuel kurulum için: giriş yapmış sahip, korumalı kaynağı .zip olarak indirir
// (installer kullanmak istemeyenler için alternatif).
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  await requireOwnedServer(ctx.params.id);
  const zip = await buildResourceZip();
  return new Response(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="coreac.zip"',
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
