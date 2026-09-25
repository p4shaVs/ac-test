import { NextRequest } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { handler, ok, requireAdmin, ApiError } from "@/lib/api";
import { updateKeySchema } from "@/lib/validation";
import { sanitizeFeatures } from "@/lib/features";
import { audit } from "@/lib/audit";
import { clientIp } from "@/lib/session";
import { findUserByRef } from "@/lib/users";

const DAY = 24 * 60 * 60 * 1000;

export const PATCH = handler(
  async (req: NextRequest, ctx: { params: { id: string } }) => {
    const admin = await requireAdmin();
    const body = updateKeySchema.parse(await req.json());

    const key = await db.licenseKey.findUnique({
      where: { id: ctx.params.id },
      include: { _count: { select: { servers: true } } },
    });
    if (!key) throw new ApiError(404, "Key not found");
    const attached = key._count.servers;

    const data: Record<string, unknown> = {};
    if (body.status) data.status = body.status;
    if (body.features) data.features = JSON.stringify(sanitizeFeatures(body.features));
    if (body.note !== undefined) data.note = body.note;

    if (body.maxServers !== undefined) {
      if (body.maxServers < attached) {
        throw new ApiError(409, `This key already has ${attached} server(s) attached — remove some first.`);
      }
      data.maxServers = body.maxServers;
    }

    // Süre: uzatma bitiş tarihinden (geçmişse bugünden) sayılır; "süresiz"
    // tarihi kaldırır. Süresi dolmuş anahtar tekrar kullanılabilir olur.
    if (body.lifetime || body.extendDays) {
      if (body.lifetime) {
        data.expiresAt = null;
      } else {
        const now = Date.now();
        const base = key.expiresAt && key.expiresAt.getTime() > now ? key.expiresAt.getTime() : now;
        data.expiresAt = new Date(base + body.extendDays! * DAY);
      }
      if (!body.status && key.status === "EXPIRED") {
        data.status = key.activatedAt ? "ACTIVE" : "UNUSED";
      }
    }

    // Sahip değişimi. Sunucular sahiplerine aittir: bağlı sunucusu olan bir
    // anahtarı başka hesaba taşımak, o sunucuları eski sahibinde lisanssız
    // bırakırdı — önce sunucular silinmeli.
    let ownerChange: { from: string | null; to: string | null } | null = null;
    if (body.owner !== undefined) {
      if (attached > 0) {
        throw new ApiError(409, "Servers are attached to this key — remove them before changing its owner.");
      }
      if (body.owner === "") {
        data.ownerId = null;
        ownerChange = { from: key.ownerId, to: null };
      } else {
        const owner = await findUserByRef(body.owner);
        if (!owner) throw new ApiError(404, "No user found with that email or username");
        data.ownerId = owner.id;
        ownerChange = { from: key.ownerId, to: owner.id };
      }
    }

    if (Object.keys(data).length === 0) throw new ApiError(400, "Nothing to change");

    await db.licenseKey.update({ where: { id: key.id }, data });

    await audit({
      userId: admin.id,
      action: "KEY_UPDATE",
      targetType: "LicenseKey",
      targetId: key.id,
      ip: clientIp(headers()),
      meta: {
        status: body.status,
        maxServers: body.maxServers,
        extendDays: body.extendDays,
        lifetime: body.lifetime,
        owner: ownerChange,
      },
    });

    return ok({ success: true });
  }
);

export const DELETE = handler(
  async (_req: NextRequest, ctx: { params: { id: string } }) => {
    const admin = await requireAdmin();
    const key = await db.licenseKey.findUnique({
      where: { id: ctx.params.id },
      include: { servers: true },
    });
    if (!key) throw new ApiError(404, "Key not found");
    if (key.servers.length > 0) {
      throw new ApiError(409, "Servers are still attached to this key. Remove them first.");
    }
    await db.licenseKey.delete({ where: { id: key.id } });
    await audit({
      userId: admin.id,
      action: "KEY_DELETE",
      targetType: "LicenseKey",
      targetId: key.id,
      ip: clientIp(headers()),
    });
    return ok({ success: true });
  }
);
