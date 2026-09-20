"use client";

import { useState } from "react";
import Link from "next/link";
import { Icons } from "./icons";
import { cn } from "@/lib/utils";

const FEATURES = [
  "Web panel",
  "In-game admin menu",
  "Framework integration",
  "Player lookup",
  "Live map",
  "Live screenshots",
  "Discord support",
  "Ban evidence & replay",
  "Second licence for a dev server",
];

interface Tier {
  name: string;
  monthly: number; // aylık taban (subscription)
  oneTime: number; // tek seferlik
  period: string;
  lifetime?: boolean;
  popular?: boolean;
  included: boolean[];
}

const TIERS: Tier[] = [
  {
    name: "Monthly",
    monthly: 14.99,
    oneTime: 17.99,
    period: "/month",
    included: [true, true, true, true, true, true, true, false, false],
  },
  {
    name: "Quarterly",
    monthly: 34.99,
    oneTime: 39.99,
    period: "/3 months",
    included: [true, true, true, true, true, true, true, false, false],
  },
  {
    name: "Lifetime",
    monthly: 89.99,
    oneTime: 89.99,
    period: "one-time",
    lifetime: true,
    popular: true,
    included: [true, true, true, true, true, true, true, true, true],
  },
];

export function PricingTiers() {
  const [subscription, setSubscription] = useState(true);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {TIERS.map((t) => {
        const price = t.lifetime ? t.monthly : subscription ? t.monthly : t.oneTime;
        return (
          <div
            key={t.name}
            className={cn(
              "card relative flex flex-col p-7",
              t.popular && "border-brand-500/40 shadow-glow ring-1 ring-brand-500/20"
            )}
          >
            {t.popular && (
              <span className="absolute -top-3 right-6">
                <span className="badge bg-brand-500/15 text-brand-200 ring-1 ring-inset ring-brand-500/30">
                  <Icons.crown size={12} /> Most popular
                </span>
              </span>
            )}
            <h3 className="text-2xl font-extrabold text-white">{t.name}</h3>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-3xl font-extrabold text-brand-200">
                €{price.toFixed(2)}
              </span>
              <span className="pb-1 text-sm text-slate-500">{t.period}</span>
            </div>

            <ul className="my-6 flex-1 space-y-2.5">
              {FEATURES.map((f, i) => {
                const on = t.included[i];
                return (
                  <li key={f} className="flex items-center gap-2.5 text-sm">
                    <span
                      className={cn(
                        "grid h-5 w-5 shrink-0 place-items-center rounded-full",
                        on ? "bg-emerald-500/15 text-emerald-400" : "bg-white/5 text-slate-600"
                      )}
                    >
                      {on ? <Icons.check size={13} /> : <Icons.x size={12} />}
                    </span>
                    <span className={on ? "text-slate-300" : "text-slate-600 line-through"}>{f}</span>
                  </li>
                );
              })}
            </ul>

            {!t.lifetime && (
              <div className="mb-4 flex items-center justify-center gap-3 text-xs">
                <span className={!subscription ? "text-white" : "text-slate-500"}>One-time</span>
                <button
                  onClick={() => setSubscription((s) => !s)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition",
                    subscription ? "bg-brand-500" : "bg-white/15"
                  )}
                >
                  <span className={cn("inline-block h-3.5 w-3.5 transform rounded-full bg-white transition", subscription ? "translate-x-5" : "translate-x-1")} />
                </button>
                <span className={subscription ? "text-white" : "text-slate-500"}>Subscription</span>
              </div>
            )}

            <Link
              href="/pricing"
              className={cn("w-full justify-center py-3", t.popular ? "btn-primary" : "btn-secondary")}
            >
              <Icons.cart size={16} /> Get started
            </Link>
          </div>
        );
      })}
    </div>
  );
}
