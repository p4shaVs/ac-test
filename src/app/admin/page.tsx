import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Card, StatusBadge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { formatMoney, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    users,
    servers,
    onlineServers,
    activeKeys,
    totalKeys,
    paidOrders,
    revenue,
    recentUsers,
    recentOrders,
    detections24h,
  ] = await Promise.all([
    db.user.count(),
    db.server.count(),
    db.server.count({ where: { status: "ONLINE" } }),
    db.licenseKey.count({ where: { status: "ACTIVE" } }),
    db.licenseKey.count(),
    db.order.count({ where: { status: "PAID" } }),
    db.order.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true } }),
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
    db.order.findMany({
      where: { status: "PAID" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { username: true } }, product: { select: { name: true } } },
    }),
    db.detection.count({ where: { createdAt: { gte: since } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Admin panel"
        description="Platform status and recent activity."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total revenue" value={formatMoney(revenue._sum.amountCents ?? 0)} icon="chart" accent="emerald" sub={`${paidOrders} orders`} />
        <StatCard label="Users" value={users} icon="users" accent="brand" />
        <StatCard label="Active licences" value={`${activeKeys}/${totalKeys}`} icon="key" accent="violet" />
        <StatCard label="Servers" value={`${onlineServers}/${servers}`} icon="server" accent="cyan" sub="online" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Recent users</h3>
            <Link href="/admin/users" className="text-xs text-brand-300 hover:text-brand-200">
              All →
            </Link>
          </div>
          <ul className="space-y-2">
            {recentUsers.map((u) => (
              <li key={u.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-base-900/40 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                    {u.username.charAt(0).toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-200">{u.username}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500">{timeAgo(u.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Recent sales</h3>
            <Link href="/admin/keys" className="text-xs text-brand-300 hover:text-brand-200">
              Licences →
            </Link>
          </div>
          {recentOrders.length ? (
            <ul className="space-y-2">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-base-900/40 px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-200">{o.product.name}</p>
                    <p className="text-xs text-slate-500">{o.user.username} · {timeAgo(o.createdAt)}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-300">
                    {formatMoney(o.amountCents, o.currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No sales yet</p>
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Card className="flex items-center gap-4">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-500/10 text-rose-300">
            <Icons.shield size={20} />
          </span>
          <div>
            <p className="text-sm text-slate-400">Platform-wide, last 24 hours</p>
            <p className="text-lg font-bold text-white">{detections24h} tespit</p>
          </div>
        </Card>
      </div>
    </>
  );
}
