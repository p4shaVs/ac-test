import type { LicenseKey, Product, Server } from "@prisma/client";
import { db } from "./db";
import { ApiError } from "./api";

// The Windows installer (installer-win/) authenticates with the customer's
// licence key: the key is the secret they already hold, and from it the panel
// hands out what the old .bat asked them to paste (the server token).

export function normaliseKey(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toUpperCase().replace(/\s+/g, "") : "";
}

export type InstallKey = LicenseKey & { product: Product | null; servers: Pick<Server, "id" | "name" | "status" | "lastSeenAt" | "acVersion">[] };

/** Looks the key up and refuses anything that could not run the anti-cheat. */
export async function resolveInstallKey(raw: unknown): Promise<InstallKey> {
  const key = normaliseKey(raw);
  // COREAC-XXXX-XXXX-XXXX-XXXX (legacy AEIGS-… keys keep working).
  if (!/^[A-Z]{3,8}(-[A-Z0-9]{3,8}){2,6}$/.test(key)) {
    throw new ApiError(400, "That does not look like a CoreAC licence key.", "BAD_KEY");
  }
  const lic = await db.licenseKey.findUnique({
    where: { key },
    include: {
      product: true,
      servers: { select: { id: true, name: true, status: true, lastSeenAt: true, acVersion: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!lic) throw new ApiError(404, "This licence key does not exist.", "UNKNOWN_KEY");
  if (lic.status === "REVOKED" || lic.status === "SUSPENDED") {
    throw new ApiError(403, "This licence key is suspended or revoked.", "LICENSE_INACTIVE");
  }
  if (lic.status === "EXPIRED" || (lic.expiresAt && lic.expiresAt < new Date())) {
    throw new ApiError(403, "This licence key has expired.", "LICENSE_EXPIRED");
  }
  if (lic.servers.length === 0) {
    throw new ApiError(
      409,
      "This key is not attached to a server yet. Sign in to the panel, add your server with this key, then run the installer again.",
      "NO_SERVER"
    );
  }
  return lic;
}

export function pickServer(lic: InstallKey, serverId: unknown) {
  const s = lic.servers.find((x) => x.id === serverId);
  if (!s) throw new ApiError(404, "That server does not belong to this licence key.", "UNKNOWN_SERVER");
  return s;
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/**
 * Panel base URL the game server should talk to: APP_URL (set by
 * panel-adresi.bat). When APP_URL was never set it is still the localhost
 * default — then the address the installer reached us on is the better guess.
 */
export function publicApiBase(configured: string, hdrs: Headers): string {
  const base = configured.replace(/\/+$/, "");
  let configuredHost = "";
  try {
    configuredHost = new URL(base).host;
  } catch {
    return base;
  }
  if (!LOCAL_HOST.test(configuredHost)) return base;
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  if (!host || LOCAL_HOST.test(host)) return base;
  const proto = (hdrs.get("x-forwarded-proto") ?? "http").split(",")[0].trim();
  return `${proto === "https" ? "https" : "http"}://${host}`;
}
