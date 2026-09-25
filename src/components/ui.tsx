import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icons, type IconName } from "./icons";

/* -------------------------------------------------------------------------- */
/* Logo                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * CoreAC brand mark — an angular, faceted shield (protection) with a solid hex
 * "core" at its heart. Drawn inline so it inherits the brand gradient and stays
 * crisp at any size; the same geometry ships as /logo-mark.svg, /logo.svg
 * (lockup) and the favicon.
 */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="csMark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="0.5" stopColor="#6366f1" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path
        d="M32 5 L57 14 V32.5 L32 59 L7 32.5 V14 Z"
        fill="none"
        stroke="url(#csMark)"
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <path d="M32 22 L40 26.6 V35.8 L32 40.4 L24 35.8 V26.6 Z" fill="url(#csMark)" />
    </svg>
  );
}

export function Logo({
  size = "md",
  withText = true,
}: {
  size?: "sm" | "md" | "lg";
  withText?: boolean;
}) {
  const box = size === "sm" ? 30 : size === "lg" ? 44 : 36;
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={box} />
      {withText && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-tight text-white">
            CoreAC
          </span>
          <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-brand-300/80">
            Anti-Cheat
          </span>
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card p-5", className)} {...props}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* StatCard  (referanslardaki CONNECTIONS / TOTAL BANS kartları)               */
/* -------------------------------------------------------------------------- */

const accentMap = {
  brand: "text-brand-300 from-brand-500/20",
  cyan: "text-accent-cyan from-cyan-500/20",
  violet: "text-accent-violet from-purple-500/20",
  emerald: "text-accent-emerald from-emerald-500/20",
  amber: "text-accent-amber from-amber-500/20",
  rose: "text-accent-rose from-rose-500/20",
} as const;

export function StatCard({
  label,
  value,
  icon,
  accent = "brand",
  sub,
}: {
  label: string;
  value: React.ReactNode;
  icon: IconName;
  accent?: keyof typeof accentMap;
  sub?: React.ReactNode;
}) {
  const Icon = Icons[icon];
  return (
    <div className="card group relative overflow-hidden p-5">
      <div
        className={cn(
          "pointer-events-none absolute -right-6 -top-10 h-28 w-28 rounded-full bg-gradient-to-b to-transparent blur-2xl transition-opacity group-hover:opacity-80",
          accentMap[accent].split(" ")[1]
        )}
      />
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white">
            {value}
          </p>
          {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
        </div>
        <span
          className={cn(
            "grid h-10 w-10 place-items-center rounded-xl bg-white/5 ring-1 ring-inset ring-white/10",
            accentMap[accent].split(" ")[0]
          )}
        >
          <Icon size={20} />
        </span>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badge / durum rozetleri                                                     */
/* -------------------------------------------------------------------------- */

const badgeTones = {
  green: "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/20",
  red: "bg-rose-500/10 text-rose-300 ring-1 ring-inset ring-rose-500/20",
  amber: "bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/20",
  blue: "bg-brand-500/10 text-brand-300 ring-1 ring-inset ring-brand-500/20",
  violet: "bg-purple-500/10 text-purple-300 ring-1 ring-inset ring-purple-500/20",
  gray: "bg-white/5 text-slate-400 ring-1 ring-inset ring-white/10",
} as const;

export function Badge({
  children,
  tone = "gray",
  dot = false,
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof badgeTones;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("badge", badgeTones[tone], className)}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            tone === "green" && "bg-emerald-400",
            tone === "red" && "bg-rose-400",
            tone === "amber" && "bg-amber-400",
            tone === "blue" && "bg-brand-400",
            tone === "violet" && "bg-purple-400",
            tone === "gray" && "bg-slate-400"
          )}
        />
      )}
      {children}
    </span>
  );
}

/** Statü stringine göre otomatik ton seçen rozet. */
export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { tone: keyof typeof badgeTones; label: string }> = {
    ONLINE: { tone: "green", label: "Online" },
    OFFLINE: { tone: "gray", label: "Offline" },
    ACTIVE: { tone: "green", label: "Active" },
    UNUSED: { tone: "blue", label: "Unused" },
    SUSPENDED: { tone: "amber", label: "Suspended" },
    REVOKED: { tone: "red", label: "Revoked" },
    EXPIRED: { tone: "gray", label: "Expired" },
    PENDING: { tone: "amber", label: "Pending" },
    PAID: { tone: "green", label: "Paid" },
    CANCELLED: { tone: "gray", label: "Cancelled" },
    REFUNDED: { tone: "gray", label: "Refunded" },
  };
  const m = map[status] ?? { tone: "gray" as const, label: status };
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

/* -------------------------------------------------------------------------- */
/* Buton (link)                                                                */
/* -------------------------------------------------------------------------- */

export function LinkButton({
  href,
  children,
  variant = "primary",
  icon,
  className,
  external,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  icon?: IconName;
  className?: string;
  external?: boolean;
}) {
  const cls = cn(
    variant === "primary" && "btn-primary",
    variant === "secondary" && "btn-secondary",
    variant === "ghost" && "btn-ghost",
    className
  );
  const Icon = icon ? Icons[icon] : null;
  const content = (
    <>
      {Icon && <Icon size={16} />}
      {children}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {content}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Boş durum                                                                   */
/* -------------------------------------------------------------------------- */

export function EmptyState({
  icon = "cube",
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  const Icon = Icons[icon];
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/5 text-slate-400 ring-1 ring-inset ring-white/10">
        <Icon size={22} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-200">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Bölüm başlığı                                                               */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
