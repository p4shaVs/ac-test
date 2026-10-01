import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icons, type IconName } from "./icons";

/* -------------------------------------------------------------------------- */
/* Logo                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * CoreAC mark — an angular, faceted shield with a solid hex "core". Monochrome:
 * a bright-to-silver stroke so it reads on the near-black surfaces at any size.
 */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="csMark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#9a9aa2" />
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
  const box = size === "sm" ? 28 : size === "lg" ? 42 : 32;
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={box} />
      {withText && (
        <span className="flex flex-col leading-none">
          <span className="text-[15px] font-bold tracking-tight text-white">CoreAC</span>
          <span className="mt-1 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-slate-500">Anti-Cheat</span>
        </span>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Card                                                                        */
/* -------------------------------------------------------------------------- */

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card p-5", className)} {...props}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* StatCard — a number with a label; colour only as a small status dot         */
/* -------------------------------------------------------------------------- */

const accentDot = {
  brand: "bg-white",
  cyan: "bg-sky-300",
  violet: "bg-violet-300",
  emerald: "bg-emerald-400",
  amber: "bg-amber-400",
  rose: "bg-rose-400",
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
  accent?: keyof typeof accentDot;
  sub?: React.ReactNode;
}) {
  const Icon = Icons[icon];
  return (
    <div className="card relative overflow-hidden p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          <span className={cn("h-1.5 w-1.5 rounded-full", accentDot[accent])} />
          {label}
        </p>
        <Icon size={16} className="text-slate-600" />
      </div>
      <p className="mt-3 text-[30px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
      {sub && <p className="mt-2 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                      */
/* -------------------------------------------------------------------------- */

const badgeTones = {
  green: "bg-emerald-400/10 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
  red: "bg-rose-400/10 text-rose-300 ring-1 ring-inset ring-rose-400/20",
  amber: "bg-amber-400/10 text-amber-300 ring-1 ring-inset ring-amber-400/20",
  blue: "bg-white/[0.06] text-slate-200 ring-1 ring-inset ring-white/15",
  violet: "bg-violet-300/10 text-violet-200 ring-1 ring-inset ring-violet-300/20",
  gray: "bg-white/[0.04] text-slate-400 ring-1 ring-inset ring-white/10",
} as const;

const dotTones = {
  green: "bg-emerald-400",
  red: "bg-rose-400",
  amber: "bg-amber-400",
  blue: "bg-white",
  violet: "bg-violet-300",
  gray: "bg-slate-500",
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
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotTones[tone])} />}
      {children}
    </span>
  );
}

/** Status string → tone. */
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
/* Link button                                                                 */
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
/* Empty state                                                                 */
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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-16 text-center">
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400">
        <Icon size={20} />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-100">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page header                                                                 */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>}
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-white">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Switch (visual only — wrap it in a button)                                  */
/* -------------------------------------------------------------------------- */

export function Switch({ on, disabled }: { on: boolean; disabled?: boolean }) {
  return (
    <span className={cn("switch", on ? "switch-on" : "switch-off", disabled && "opacity-40")}>
      <span
        className={cn(
          "switch-knob",
          on ? "translate-x-[18px] bg-[#0a0a0b]" : "translate-x-[3px] bg-slate-400"
        )}
      />
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* JSON viewer — syntax-coloured, read only                                    */
/* -------------------------------------------------------------------------- */

function JsonNode({ value, indent }: { value: unknown; indent: number }): React.ReactElement {
  const pad = "  ".repeat(indent + 1);
  const close = "  ".repeat(indent);
  if (value === null || value === undefined) return <span className="json-null">null</span>;
  if (typeof value === "string") return <span className="json-str">{JSON.stringify(value)}</span>;
  if (typeof value === "number") return <span className="json-num">{String(value)}</span>;
  if (typeof value === "boolean") return <span className="json-bool">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span>[]</span>;
    return (
      <>
        {"[\n"}
        {value.map((v, i) => (
          <React.Fragment key={i}>
            {pad}
            <JsonNode value={v} indent={indent + 1} />
            {i < value.length - 1 ? ",\n" : "\n"}
          </React.Fragment>
        ))}
        {close + "]"}
      </>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span>{"{}"}</span>;
    return (
      <>
        {"{\n"}
        {entries.map(([k, v], i) => (
          <React.Fragment key={k}>
            {pad}
            <span className="json-key">{JSON.stringify(k)}</span>
            {": "}
            <JsonNode value={v} indent={indent + 1} />
            {i < entries.length - 1 ? ",\n" : "\n"}
          </React.Fragment>
        ))}
        {close + "}"}
      </>
    );
  }
  return <span>{String(value)}</span>;
}

export function JsonView({ value, className, maxHeight = 420 }: { value: unknown; className?: string; maxHeight?: number }) {
  return (
    <pre className={cn("json-view whitespace-pre", className)} style={{ maxHeight }}>
      <JsonNode value={value} indent={0} />
    </pre>
  );
}

/* -------------------------------------------------------------------------- */
/* Section label                                                               */
/* -------------------------------------------------------------------------- */

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{children}</p>
      {right}
    </div>
  );
}
