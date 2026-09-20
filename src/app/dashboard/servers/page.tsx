import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader, Card, EmptyState, StatusBadge, LinkButton } from "@/components/ui";
import { Icons } from "@/components/icons";
import { timeAgo } from "@/lib/utils";

export const metadata: Metadata = { title: "My Servers" };
export const dynamic = "force-dynamic";

export default async function ServersPage() {
  const user = (await getCurrentUser())!;
  const servers = await db.server.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { players: true, bans: true } },
      licenseKey: { include: { product: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="My Servers"
        description="Your protected FiveM servers."
        actions={
          <LinkButton href="/dashboard/servers/new" icon="plus" variant="secondary">
            Add server
          </LinkButton>
        }
      />

      {servers.length === 0 ? (
        <EmptyState
          icon="server"
          title="No servers added yet"
          description="Enter your licence key to create the server and finish setup in one step."
          action={
            <LinkButton href="/dashboard/servers/new" icon="plus">
              Create server
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {servers.map((s) => (
            <Link key={s.id} href={`/dashboard/servers/${s.id}`}>
              <Card className="group h-full transition hover:border-brand-500/30 hover:shadow-glow">
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
                    <Icons.server size={20} />
                  </span>
                  <StatusBadge status={s.status} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-white">{s.name}</h3>
                <p className="text-xs text-slate-500">{s.ip ?? "IP not set"}</p>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/5 bg-base-900/40 p-2.5">
                    <p className="text-[10px] uppercase text-slate-500">Player</p>
                    <p className="text-lg font-bold text-white">{s._count.players}</p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-base-900/40 p-2.5">
                    <p className="text-[10px] uppercase text-slate-500">Ban</p>
                    <p className="text-lg font-bold text-white">{s._count.bans}</p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                  <span>{s.licenseKey?.product?.name ?? "Licence"}</span>
                  <span>
                    {s.lastSeenAt ? `Seen ${timeAgo(s.lastSeenAt)}` : "Never connected"}
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
