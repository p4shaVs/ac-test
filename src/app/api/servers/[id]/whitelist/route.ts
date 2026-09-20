import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, ApiError } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";

const createSchema = z.object({
  kind: z.enum(["license", "discord", "steam", "ip"]),
  value: z.string().min(2).max(120),
  note: z.string().max(120).optional(),
});

// Bypass listesine ekle. Discord ID / license için "discord:" / "license:" öneki
// yoksa otomatik eklenir (FiveM identifier biçimi).
export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const body = createSchema.parse(await req.json());

  let value = body.value.trim();
  if (body.kind === "discord" && !value.startsWith("discord:")) value = `discord:${value}`;
  if (body.kind === "license" && !value.startsWith("license:")) value = `license:${value}`;
  if (body.kind === "steam" && !value.startsWith("steam:")) value = `steam:${value}`;

  const existing = await db.whitelist.findFirst({
    where: { serverId: server.id, kind: body.kind, value },
  });
  if (existing) throw new ApiError(409, "That identifier is already on the bypass list");

  const row = await db.whitelist.create({
    data: { serverId: server.id, kind: body.kind, value, note: body.note, createdBy: user.username },
  });
  return ok({ id: row.id });
});

const deleteSchema = z.object({ id: z.string() });

export const DELETE = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  const { id } = deleteSchema.parse(await req.json());
  await db.whitelist.deleteMany({ where: { id, serverId: server.id } });
  return ok({ deleted: true });
});
