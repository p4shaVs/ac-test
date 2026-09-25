import Link from "next/link";
import { db } from "@/lib/db";
import { Icons } from "./icons";
import { featureLabel } from "@/lib/features";
import { formatMoney, parseJson, cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";

// Plan cards shared by the landing page and /pricing. Both used to carry their
// own price list (the landing page had hard-coded prices that matched nothing
// in the catalogue); now there is one source: Admin → Products.
//
// Buying never happens on the site. Every card leads to /purchase, which walks
// the customer through the Discord ticket flow.

const INTERVAL: Record<string, string> = {
  MONTHLY: "/ month",
  YEARLY: "/ year",
  LIFETIME: "one-time",
};

export async function PlanGrid() {
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

  if (products.length === 0) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-white/10 p-10 text-center">
        <p className="text-sm text-slate-400">Plans are announced on our Discord.</p>
        <a
          href={BRAND.discordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary mt-5 inline-flex"
        >
          <Icons.discord size={16} /> Join {BRAND.discordLabel}
        </a>
      </div>
    );
  }

  // The middle plan is highlighted when there are three or more.
  const featuredIndex = products.length >= 3 ? 1 : -1;

  return (
    <div className={cn("grid gap-6", products.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2")}>
      {products.map((p, i) => {
        const features = parseJson<string[]>(p.features, []);
        const featured = i === featuredIndex;
        return (
          <div
            key={p.id}
            className={cn(
              "card relative flex flex-col p-7 transition hover:-translate-y-0.5",
              featured && "border-brand-500/40 shadow-glow ring-1 ring-brand-500/20"
            )}
          >
            {featured && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="badge bg-brand-500/15 text-brand-200 ring-1 ring-inset ring-brand-500/30">
                  <Icons.crown size={12} /> Most popular
                </span>
              </span>
            )}
            <h3 className="text-lg font-bold text-white">{p.name}</h3>
            <p className="mt-1 min-h-[40px] text-sm text-slate-400">{p.description}</p>
            <div className="mt-5 flex items-end gap-1.5">
              <span className="text-4xl font-extrabold text-white">
                {formatMoney(p.priceCents, p.currency)}
              </span>
              <span className="pb-1 text-sm text-slate-500">{INTERVAL[p.interval] ?? ""}</span>
            </div>

            <div className="my-6 h-px bg-white/5" />

            <ul className="flex-1 space-y-3">
              {features.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-emerald-400">
                    <Icons.check size={13} />
                  </span>
                  {featureLabel(f)}
                </li>
              ))}
            </ul>

            <Link
              href={`/purchase?plan=${encodeURIComponent(p.slug)}`}
              className={cn("mt-7 w-full py-3", featured ? "btn-primary" : "btn-secondary")}
            >
              <Icons.discord size={16} /> Buy {p.name}
            </Link>
          </div>
        );
      })}
    </div>
  );
}
