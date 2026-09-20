import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { formatMoney, parseJson } from "@/lib/utils";
import { featureLabel } from "@/lib/features";
import { BuyButton } from "./buy-button";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

const intervalLabel: Record<string, string> = {
  MONTHLY: "/ ay",
  YEARLY: "/ year",
  LIFETIME: "lifetime",
};

export default async function PricingPage() {
  const [products, user] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
    }),
    getCurrentUser(),
  ]);

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="section-title text-brand-400">Pricing</span>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white sm:text-5xl">
            Pick the plan that fits your server
          </h1>
          <p className="mt-4 text-slate-400">
            Every plan includes the full detection engine. Add the extras you need
            and upgrade whenever you want.
          </p>
        </div>

        {products.length === 0 ? (
          <div className="mt-16 rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-500">
            No plans are listed yet.
          </div>
        ) : (
          <div className="mt-16 grid gap-6 lg:grid-cols-3">
            {products.map((p, i) => {
              const features = parseJson<string[]>(p.features, []);
              const featured = i === 1; // ortadaki paket vurgulu
              return (
                <div
                  key={p.id}
                  className={
                    "card relative flex flex-col p-7 " +
                    (featured
                      ? "border-brand-500/40 shadow-glow ring-1 ring-brand-500/20"
                      : "")
                  }
                >
                  {featured && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Badge tone="blue">
                        <Icons.crown size={12} /> Most popular
                      </Badge>
                    </span>
                  )}
                  <h3 className="text-lg font-bold text-white">{p.name}</h3>
                  <p className="mt-1 min-h-[40px] text-sm text-slate-400">
                    {p.description}
                  </p>
                  <div className="mt-5 flex items-end gap-1.5">
                    <span className="text-4xl font-extrabold text-white">
                      {formatMoney(p.priceCents, p.currency)}
                    </span>
                    <span className="pb-1 text-sm text-slate-500">
                      {intervalLabel[p.interval] ?? ""}
                    </span>
                  </div>

                  <div className="my-6 h-px bg-white/5" />

                  <ul className="flex-1 space-y-3">
                    {features.map((f) => (
                      <li
                        key={f}
                        className="flex items-center gap-2.5 text-sm text-slate-300"
                      >
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
                          <Icons.check size={13} />
                        </span>
                        {featureLabel(f)}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-7">
                    <BuyButton
                      productId={p.id}
                      productName={p.name}
                      isLoggedIn={!!user}
                      featured={featured}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-center text-xs text-slate-500">
          Card payments are not wired up yet — a purchase creates a licence key after
          manual confirmation.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
