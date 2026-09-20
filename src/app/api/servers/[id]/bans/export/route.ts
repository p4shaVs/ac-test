import { db } from "@/lib/db";
import { handler } from "@/lib/api";
import { requireOwnedServer } from "@/lib/api-guards";

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Ban listesini CSV olarak indirir (Excel/Sheets'te açılabilir).
export const GET = handler(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const { server } = await requireOwnedServer(ctx.params.id);
    const bans = await db.ban.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: "desc" },
    });

    const header = [
      "code", "playerName", "license", "discord", "steam", "ip",
      "reason", "bannedBy", "active", "permanent", "createdAt", "expiresAt",
    ];
    const rows = bans.map((b) =>
      [
        b.code, b.playerName, b.license, b.discord, b.steam, b.ip,
        b.reason, b.bannedBy, b.active, b.permanent,
        b.createdAt.toISOString(), b.expiresAt ? b.expiresAt.toISOString() : "",
      ]
        .map(csvEscape)
        .join(",")
    );
    const csv = [header.join(","), ...rows].join("\n");

    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${server.name.replace(/[^a-z0-9]/gi, "_")}-bans.csv"`,
      },
    });
  }
);
