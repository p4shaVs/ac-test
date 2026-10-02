import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { handler, ok, ApiError } from "@/lib/api";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp } from "@/lib/session";
import { resolveInstallKey } from "@/lib/install-key";

export const dynamic = "force-dynamic";

const schema = z.object({ key: z.string().max(80) });

// Windows installer, step 1: is this key good, and which server(s) is it for?
// Answers names only — no secret leaves the panel here.
export const POST = handler(async (req: NextRequest) => {
  const ip = clientIp(headers()) ?? "unknown";
  const rl = rateLimit(`install-key:${ip}`, 15, 60_000);
  if (!rl.success) throw new ApiError(429, "Too many attempts — wait a minute and try again.");

  const { key } = schema.parse(await req.json());
  const lic = await resolveInstallKey(key);

  return ok({
    product: lic.product?.name ?? "CoreAC",
    expiresAt: lic.expiresAt?.toISOString() ?? null,
    servers: lic.servers.map((s) => ({
      id: s.id,
      name: s.name,
      online: s.status === "ONLINE",
      installedVersion: s.acVersion,
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    })),
  });
});
