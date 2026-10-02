import { NextRequest } from "next/server";
import { requireOwnedServer } from "@/lib/api-guards";
import { buildInstallerBat } from "@/lib/installer-script";
import { env } from "@/lib/env";

// Panelden (giriş yapmış sahip) kişiselleştirilmiş kurulum dosyasını indirir.
// Panel API tabanı gömülüdür; token gömülmez (installer çalışma anında sorar).
export const dynamic = "force-dynamic";

// ?stealth=0 → kaynak "coreac" klasörüne kurulur; varsayılan (gizli ad) rastgele
// bir klasör adı seçer ki hile menüleri AC'yi adıyla bulup durduramasın.
export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const { server } = await requireOwnedServer(ctx.params.id);

  const apiBase = (env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const stealth = req.nextUrl.searchParams.get("stealth") !== "0";
  const bat = buildInstallerBat({ apiBase, serverName: server.name, stealth });
  const safeName = server.name.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "server";

  return new Response(bat, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="CoreAC-Installer-${safeName}.bat"`,
      "Cache-Control": "no-store",
    },
  });
}
