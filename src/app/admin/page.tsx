import Link from "next/link";
import { db } from "@/lib/db";
import { PageHeader, StatCard, Card } from "@/components/ui";
import { MoneyBars, DonutChart } from "@/components/charts";
import { DONUT_PALETTE } from "@/lib/palette";
import { Icons } from "@/components/icons";
import { formatMoney, timeAgo, relativeDays } from "@/lib/utils";
import { auditLabel } from "@/lib/audit-labels";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;


export default async function AdminHome() {
  const now = Date.now();
  const since24 = new Date(now - DAY);
  const since30 = new Date(now - 30 * DAY);
  const in7 = new Date(now + 7 * DAY);

  const [
    users,
    newUsers30,
    servers,
    onlineServers,
    keyGroups,
    paidOrders,
    revenue,
    revenue30,
    sales30,
    recentOrders,
    expiringSoon,
    detections24h,
    activity,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: since30 } } }),
    db.server.count(),
    db.server.count({ where: { status: "ONLINE" } }),
    db.licenseKey.groupBy({ by: ["status"], _count: true }),
    db.order.count({ where: { status: "PAID" } }),
    db.order.aggregate({ where: { status: "PAID" }, _sum: { amountCents: true } }),
    db.order.aggregate({ where: { status: "PAID", paidAt: { gte: since30 } }, _sum: { amountCents: true } }),
    db.order.findMany({
      where: { status: "PAID", paidAt: { gte: since30 } },
      select: { paidAt: true, createdAt: true, amountCents: true },
    }),
    db.order.findMany({
      where: { status: "PAID" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { user: { select: { username: true } }, product: { select: { name: true } } },
    }),
    db.licenseKey.findMany({
      where: { expiresAt: { gte: new Date(now), lte: in7 }, status: { in: ["ACTIVE", "UNUSED"] } },
      orderBy: { expiresAt: "asc" },
      take: 6,
      include: { owner: { select: { username: true } } },
    }),
    db.detection.count({ where: { createdAt: { gte: since24 } } }),
    db.auditLog.findMany({
      where: { action: { notIn: ["LOGIN", "LOGIN_FAIL"] } },
      orderBy: { createdAt: "desc" },
      take: 7,
      include: { user: { select: { username: true } } },
    }),
  ]);

  // Günlük gelir serisi (son 30 gün).
  const buckets = new Map<string, number>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of sales30) {
    const k = (o.paidAt ?? o.createdAt).toISOString().slice(0, 10);
    if (buckets.has(k)) buckets.set(k, buckets.get(k)! + o.amountCents / 100);
  }
  const series = [...buckets.entries()].map(([k, amount]) => ({
    label: new Date(k).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
    amount: Math.round(amount * 100) / 100,
  }));

  const keyCount = (s: string) => keyGroups.find((g) => g.status === s)?._count ?? 0;
  const totalKeys = keyGroups.reduce((n, g) => n + g._count, 0);
  const keySlices = ["ACTIVE", "UNUSED", "SUSPENDED", "REVOKED", "EXPIRED"]
    .map((s) => ({ name: s.charAt(0) + s.slice(1).toLowerCase(), value: keyCount(s) }))
    .filter((s) => s.value > 0);

  return (
    <>
      <PageHeader
        title="Admin panel"
        description="Sales, licences and platform health at a glance."
        actions={
          <Link href="/admin/orders" className="btn-primary">
            <Icons.plus size={16} /> Record sale
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue · 30 days" value={formatMoney(revenue30._sum.amountCents ?? 0)} icon="chart" accent="emerald" sub={`${formatMoney(revenue._sum.amountCents ?? 0)} all time · ${paidOrders} orders`} />
        <StatCard label="Users" value={users} icon="users" accent="brand" sub={`+${newUsers30} in 30 days`} />
        <StatCard label="Active licences" value={`${keyCount("ACTIVE")}/${totalKeys}`} icon="key" accent="violet" sub={`${keyCount("UNUSED")} unused`} />
        <StatCard label="Servers online" value={`${onlineServers}/${servers}`} icon="server" accent="cyan" sub={`${detections24h} detections in 24 h`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Revenue</h3>
              <p className="text-xs text-slate-500">Paid orders, last 30 days</p>
            </div>
            <Link href="/admin/orders" className="text-xs text-brand-300 hover:text-brand-200">Orders →</Link>
          </div>
          <MoneyBars data={series} />
        </Card>

        <Card>
          <h3 className="text-sm font-semibold text-white">Licence keys</h3>
          <p className="mb-2 text-xs text-slate-500">By status</p>
          {keySlices.length ? (
            <>
              <DonutChart data={keySlices} centerValue={totalKeys} centerLabel="keys" />
              <ul className="mt-3 space-y-1.5">
                {keySlices.map((s, i) => (
                  <li key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-400">
                      <span className="h-2 w-2 rounded-full" style={{ background: DONUT_PALETTE[i % DONUT_PALETTE.length] }} />
                      {s.name}
                    </span>
                    <span className="font-medium text-slate-200">{s.value}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="py-16 text-center text-sm text-slate-500">No keys yet</p>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Recent sales</h3>
            <Link href="/admin/orders" className="text-xs text-brand-300 hover:text-brand-200">All →</Link>
          </div>
          {recentOrders.length ? (
            <ul className="space-y-2">
              {recentOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-xl border border-white/5 bg-base-900/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-200">{o.product.name}</p>
                    <p className="text-xs text-slate-500">{o.user.username} · {timeAgo(o.createdAt)}</p>
                  </div>
                  <span className="text-sm font-semibold text-emerald-300">{formatMoney(o.amountCents, o.currency)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No sales yet</p>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Expiring in 7 days</h3>
            <Link href="/admin/keys" className="text-xs text-brand-300 hover:text-brand-200">Keys →</Link>
          </div>
          {expiringSoon.length ? (
            <ul className="space-y-2">
              {expiringSoon.map((k) => (
                <li key={k.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-base-900/40 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-slate-300">{k.key}</p>
                    <p className="text-xs text-slate-500">{k.owner?.username ?? "Unassigned"}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-amber-300">{relativeDays(k.expiresAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Nothing expires this week</p>
          )}
        </Card>

        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Latest activity</h3>
            <Link href="/admin/audit" className="text-xs text-brand-300 hover:text-brand-200">Audit log →</Link>
          </div>
          {activity.length ? (
            <ul className="space-y-3">
              {activity.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/5 text-slate-400">
                    <Icons.history size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{auditLabel(a.action)}</p>
                    <p className="text-xs text-slate-500">{a.user?.username ?? "system"} · {timeAgo(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No activity yet</p>
          )}
        </Card>
      </div>
    </>
  );
}
