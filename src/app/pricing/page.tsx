import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Icons } from "@/components/icons";
import { PlanGrid } from "@/components/plan-grid";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default function PricingPage() {
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

        <div className="mt-16">
          <PlanGrid />
        </div>

        <div className="mx-auto mt-12 flex max-w-3xl flex-col items-center justify-between gap-4 rounded-2xl border border-white/10 bg-base-900/50 p-6 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#5865F2]/15 text-[#aab1fb]">
              <Icons.discord size={20} />
            </span>
            <p className="text-sm text-slate-400">
              Orders are taken in a ticket on <span className="font-semibold text-slate-200">{BRAND.discordLabel}</span>.
              Already have a key?{" "}
              <Link href="/dashboard/redeem" className="text-brand-300 hover:text-brand-200">
                Redeem it
              </Link>
              .
            </p>
          </div>
          <Link href="/purchase" className="btn-secondary shrink-0">
            How buying works <Icons.arrowRight size={15} />
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
