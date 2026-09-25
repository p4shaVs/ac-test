import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Icons } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { featureLabel } from "@/lib/features";
import { formatMoney, parseJson, cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Purchase" };
export const dynamic = "force-dynamic";

const INTERVAL: Record<string, string> = {
  MONTHLY: "per month",
  YEARLY: "per year",
  LIFETIME: "one-time payment",
};

// Every "Buy" button on the site lands here. Orders are taken by the team in a
// Discord ticket; the key is delivered there (or straight onto the customer's
// panel account when they give us their username). The site itself never
// mints a key for a purchase — that path used to hand out free licences.
export default async function PurchasePage({
  searchParams,
}: {
  searchParams: { plan?: string };
}) {
  const [products, user] = await Promise.all([
    db.product.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    getCurrentUser(),
  ]);
  const plan =
    products.find((p) => p.slug === searchParams.plan) ??
    (products.length >= 3 ? products[1] : products[0]) ??
    null;
  const planFeatures = plan ? parseJson<string[]>(plan.features, []) : [];

  const ticketLine = [
    plan ? `Plan: ${plan.name}` : "Plan: …",
    user ? `Panel username: ${user.username}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:py-20">
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-grid-faint [background-size:46px_46px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />

        <div className="mx-auto max-w-2xl text-center">
          <span className="badge bg-[#5865F2]/15 text-[#c9cdfb] ring-1 ring-inset ring-[#5865F2]/35">
            <Icons.discord size={13} /> Purchases are handled on Discord
          </span>
          <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Get {BRAND.name} in a few minutes
          </h1>
          <p className="mt-4 text-slate-400">
            Every order is handled by the {BRAND.name} team in a private Discord ticket. You
            receive your licence key there and activate it from your panel.
          </p>
        </div>

        <div className="mt-14 grid gap-8 lg:grid-cols-[1.25fr_1fr]">
          {/* ---------------------------------------------------- steps */}
          <ol className="relative space-y-4">
            <span className="absolute bottom-8 left-[27px] top-8 w-px bg-gradient-to-b from-[#5865F2]/60 via-brand-500/30 to-emerald-500/40" aria-hidden />

            <Step n={1} tone="discord" title={`Join ${BRAND.discordLabel}`}>
              Open our Discord server — that is where every order, question and support
              request is answered.
              <div className="mt-4">
                <a
                  href={BRAND.discordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_-12px_rgba(88,101,242,0.8)] transition hover:bg-[#4752c4]"
                >
                  <Icons.discord size={18} /> Join the Discord
                  <Icons.arrowRight size={15} />
                </a>
              </div>
            </Step>

            <Step n={2} tone="brand" title="Open a purchase ticket">
              Tell us which plan you want. Paste the line below into the ticket so we can
              put the key straight onto your panel account.
              <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-base-900/70 px-3 py-2.5">
                <code className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">{ticketLine}</code>
                <CopyButton value={ticketLine} />
              </div>
              {!user && (
                <p className="mt-2 text-xs text-slate-500">
                  No account yet?{" "}
                  <Link href="/register?next=/purchase" className="text-brand-300 hover:text-brand-200">
                    Create one first
                  </Link>{" "}
                  and include your username.
                </p>
              )}
            </Step>

            <Step n={3} tone="brand" title="Pay and receive your key">
              Payment details are given in the ticket. Once it is confirmed you get a key
              in the <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[12px] text-slate-200">COREAC-XXXX-XXXX-XXXX-XXXX</code> format.
            </Step>

            <Step n={4} tone="emerald" title="Redeem and install">
              Redeem the key in your panel, add your server, then run the one-click
              installer from the Download page.
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={user ? "/dashboard/redeem" : "/login?next=/dashboard/redeem"} className="btn-secondary">
                  <Icons.gift size={16} /> Redeem a key
                </Link>
                <Link href="/docs" className="btn-ghost">
                  <Icons.book size={16} /> Installation guide
                </Link>
              </div>
            </Step>
          </ol>

          {/* ---------------------------------------------------- plan */}
          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {plan ? (
              <div className="card relative overflow-hidden p-6">
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl" />
                <p className="section-title">Selected plan</p>
                <div className="mt-3 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-extrabold text-white">{plan.name}</h2>
                    <p className="mt-1 text-sm text-slate-400">{plan.description}</p>
                  </div>
                </div>
                <div className="mt-5 flex items-end gap-2">
                  <span className="text-4xl font-extrabold text-white">
                    {formatMoney(plan.priceCents, plan.currency)}
                  </span>
                  <span className="pb-1 text-sm text-slate-500">{INTERVAL[plan.interval] ?? ""}</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {planFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
                        <Icons.check size={13} />
                      </span>
                      {featureLabel(f)}
                    </li>
                  ))}
                </ul>
                <a
                  href={BRAND.discordUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary mt-6 w-full py-3"
                >
                  <Icons.discord size={16} /> Order {plan.name} on Discord
                </a>
              </div>
            ) : (
              <div className="card p-6 text-sm text-slate-400">
                Plans are announced on our Discord — join and ask in a ticket.
              </div>
            )}

            {products.length > 1 && (
              <div className="card p-5">
                <p className="section-title">Other plans</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {products.map((p) => (
                    <Link
                      key={p.id}
                      href={`/purchase?plan=${encodeURIComponent(p.slug)}`}
                      className={cn(
                        "rounded-xl border px-3 py-2 text-xs font-medium transition",
                        plan?.id === p.id
                          ? "border-brand-500/50 bg-brand-500/10 text-white"
                          : "border-white/10 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      )}
                    >
                      {p.name} · {formatMoney(p.priceCents, p.currency)}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-white/5 bg-base-900/40 p-5 text-xs leading-relaxed text-slate-500">
              <p className="flex items-start gap-2">
                <Icons.shieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                A key is bound to the account that redeems it and to the number of servers
                shown on it — keep it private until you redeem it.
              </p>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Step({
  n,
  title,
  tone,
  children,
}: {
  n: number;
  title: string;
  tone: "discord" | "brand" | "emerald";
  children: React.ReactNode;
}) {
  return (
    <li className="card relative flex gap-4 p-5">
      <span
        className={cn(
          "relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white ring-4 ring-base-950",
          tone === "discord" && "bg-[#5865F2]",
          tone === "brand" && "bg-brand-gradient",
          tone === "emerald" && "bg-emerald-500"
        )}
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className="text-base font-bold text-white">{title}</h3>
        <div className="mt-1 text-sm text-slate-400">{children}</div>
      </div>
    </li>
  );
}
