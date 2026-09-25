import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";
import { joaat } from "@/lib/gta-models";
import { trollPropPreset } from "@/lib/troll-props";

// Recommended blacklist pack (troll & giant props). Rows are stored exactly like
// the model picker stores them (unsigned hash string + catalog label), so the
// resource and the Blacklist page treat them like hand-picked models.

/** Normalised unsigned hash of a stored blacklist `model` (name or hash string). */
function rowHash(model: string): number {
  return /^-?\d+$/.test(model) ? Number(model) >>> 0 : joaat(model);
}

const addSchema = z.object({
  preset: z.literal("troll-props"),
  action: z.enum(["REMOVE", "KICK", "BAN"]).default("REMOVE"),
});

export const POST = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server, user } = await requireOwnedServer(ctx.params.id);
  const body = addSchema.parse(await req.json());

  const existing = await db.blacklist.findMany({
    where: { serverId: server.id, kind: "object" },
    select: { model: true },
  });
  const have = new Set(existing.map((r) => rowHash(r.model)));
  const missing = trollPropPreset().filter((m) => !have.has(m.hash));

  if (missing.length) {
    await db.blacklist.createMany({
      data: missing.map((m) => ({
        serverId: server.id,
        kind: "object",
        model: String(m.hash),
        label: m.label,
        action: body.action,
        createdBy: user.username,
      })),
    });
  }
  return ok({ added: missing.length, skipped: trollPropPreset().length - missing.length });
});

const deleteSchema = z.object({ preset: z.literal("troll-props") });

export const DELETE = handler(async (req: NextRequest, ctx: { params: { id: string } }) => {
  const { server } = await requireOwnedServer(ctx.params.id);
  deleteSchema.parse(await req.json());
  const hashes = trollPropPreset().map((m) => String(m.hash));
  const res = await db.blacklist.deleteMany({
    where: { serverId: server.id, kind: "object", model: { in: hashes } },
  });
  return ok({ removed: res.count });
});
