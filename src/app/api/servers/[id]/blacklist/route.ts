import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";

// Only model-hash kinds the resource actually enforces are accepted. Explosions
// are typed events (not model hashes) and are handled by Configuration →
// Explosions → "Blacklisted Explosions"; accepting them here would create a
// blacklist row that never enforces.
const createSchema = z.object({
  kind: z.enum(["vehicle", "ped", "object", "weapon"]),
  model: z.string().min(1).max(80),
  label: z.string().max(80).optional(),
  action: z.enum(["REMOVE", "KICK", "BAN"]).default("REMOVE"),
});

export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const body = createSchema.parse(await req.json());
  const model = body.model.trim().toLowerCase();

  const existing = await db.blacklist.findFirst({
    where: { serverId: server.id, kind: body.kind, model },
  });
  if (existing) throw new ApiError(409, "That model is already blacklisted");

  const row = await db.blacklist.create({
    data: {
      serverId: server.id,
      kind: body.kind,
      model,
      label: body.label,
      action: body.action,
      createdBy: user.username,
    },
  });
  return ok({ id: row.id });
});

const patchSchema = z.object({ id: z.string(), enabled: z.boolean() });

export const PATCH = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  const body = patchSchema.parse(await req.json());
  await db.blacklist.updateMany({
    where: { id: body.id, serverId: server.id },
    data: { enabled: body.enabled },
  });
  return ok({ updated: true });
});

const deleteSchema = z.object({ id: z.string() });

export const DELETE = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  const { id } = deleteSchema.parse(await req.json());
  await db.blacklist.deleteMany({ where: { id, serverId: server.id } });
  return ok({ deleted: true });
});
