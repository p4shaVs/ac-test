"use client";

import { useEffect, useState } from "react";
import { Icons, type IconName } from "@/components/icons";
import { JsonView } from "@/components/ui";
import { cn } from "@/lib/utils";

// Building blocks shared by the ban, kick, warn and log pages: a list on the
// left, the selected record on the right, and its raw JSON one click away.

/* -------------------------------------------------------------------------- */
/* Avatar — initials on a neutral tile, tinted by status                       */
/* -------------------------------------------------------------------------- */

const AVATAR_TONE = {
  neutral: "bg-white/[0.06] text-slate-200 ring-white/10",
  red: "bg-rose-400/10 text-rose-200 ring-rose-400/20",
  amber: "bg-amber-400/10 text-amber-200 ring-amber-400/20",
  green: "bg-emerald-400/10 text-emerald-200 ring-emerald-400/20",
} as const;

export function Avatar({
  name,
  tone = "neutral",
  size = 36,
  icon,
}: {
  name: string;
  tone?: keyof typeof AVATAR_TONE;
  size?: number;
  icon?: IconName;
}) {
  const Icon = icon ? Icons[icon] : null;
  const letters =
    name
      .replace(/[^\p{L}\p{N} ]/gu, "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-xl font-semibold ring-1 ring-inset", AVATAR_TONE[tone])}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {Icon ? <Icon size={Math.round(size * 0.44)} /> : letters}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Filter chips                                                                */
/* -------------------------------------------------------------------------- */

export function FilterChips<K extends string>({
  value,
  onChange,
  options,
}: {
  value: K;
  onChange: (k: K) => void;
  options: { key: K; label: string; count?: number; dot?: string }[];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition",
              on
                ? "border-white/80 bg-white text-[#0a0a0b]"
                : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/20 hover:text-slate-200"
            )}
          >
            {o.dot && <span className={cn("h-1.5 w-1.5 rounded-full", o.dot)} />}
            {o.label}
            {o.count !== undefined && (
              <span className={cn("tabular-nums", on ? "text-black/50" : "text-slate-600")}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Search box                                                                  */
/* -------------------------------------------------------------------------- */

export function SearchBox({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Icons.search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        className="input h-9 pl-9 text-[13px]"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
        >
          <Icons.x size={13} />
        </button>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Two-pane layout: list | detail                                              */
/* -------------------------------------------------------------------------- */

export function SplitView({
  list,
  detail,
  hasSelection,
  onBack,
}: {
  list: React.ReactNode;
  detail: React.ReactNode;
  hasSelection: boolean;
  onBack: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <div className={cn("min-w-0", hasSelection && "hidden lg:block")}>{list}</div>
      <div className={cn("min-w-0", !hasSelection && "hidden lg:block")}>
        {hasSelection && (
          <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1.5 text-xs text-slate-400 hover:text-white lg:hidden">
            <Icons.chevronRight size={13} className="rotate-180" /> Back to list
          </button>
        )}
        <div className="lg:sticky lg:top-20">{detail}</div>
      </div>
    </div>
  );
}

export function ListShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0e0e10]">
      <div className="max-h-[calc(100vh-260px)] min-h-[320px] overflow-y-auto">{children}</div>
      {footer && <div className="border-t border-white/[0.06] px-4 py-2.5 text-[11px] text-slate-500">{footer}</div>}
    </div>
  );
}

export function ListItem({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex w-full items-center gap-3 border-b border-white/[0.05] px-4 py-3 text-left transition last:border-b-0",
        active ? "bg-white/[0.06]" : "hover:bg-white/[0.025]"
      )}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-white" />}
      {children}
    </button>
  );
}

export function DetailShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-[#0e0e10]">{children}</div>;
}

export function DetailEmpty({ icon = "logs", text }: { icon?: IconName; text: string }) {
  const Icon = Icons[icon];
  return (
    <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.08] px-6 text-center">
      <Icon size={20} className="text-slate-600" />
      <p className="mt-3 text-sm text-slate-500">{text}</p>
    </div>
  );
}

/** Label/value pair used in record grids. */
export function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <div className={cn("mt-1 break-words text-[13px] text-slate-100", mono && "font-mono text-[12px]")}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* JSON block with copy                                                        */
/* -------------------------------------------------------------------------- */

export function CopyButton({ text, label = "Copy", className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1200);
    return () => clearTimeout(t);
  }, [done]);
  return (
    <button
      type="button"
      onClick={() => navigator.clipboard?.writeText(text).then(() => setDone(true))}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-[11px] font-medium text-slate-300 transition hover:border-white/25 hover:text-white",
        className
      )}
    >
      {done ? <Icons.check size={12} className="text-emerald-300" /> : <Icons.copy size={12} />}
      {done ? "Copied" : label}
    </button>
  );
}

export function JsonBlock({
  value,
  title = "Full details",
  maxHeight = 360,
  defaultOpen = true,
}: {
  value: unknown;
  title?: string;
  maxHeight?: number;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-[#09090a]">
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] px-3 py-2">
        <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-[12px] font-medium text-slate-300 hover:text-white">
          <Icons.braces size={13} className="text-slate-500" />
          {title}
          <span className="font-mono text-[10.5px] text-slate-600">JSON</span>
          <Icons.chevronDown size={12} className={cn("text-slate-500 transition", !open && "-rotate-90")} />
        </button>
        <CopyButton text={text} />
      </div>
      {open && <JsonView value={value} maxHeight={maxHeight} className="rounded-none border-0 bg-transparent" />}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Identifier chip — click to copy                                             */
/* -------------------------------------------------------------------------- */

export function IdentChip({
  label,
  value,
  masked = false,
}: {
  label: string;
  value: string | null | undefined;
  masked?: boolean;
}) {
  const [reveal, setReveal] = useState(!masked);
  const [done, setDone] = useState(false);
  if (!value) {
    return (
      <span className="flex items-center gap-2 rounded-lg border border-dashed border-white/[0.08] px-2.5 py-1.5 text-[11.5px] text-slate-600">
        <span className="font-semibold uppercase tracking-wide">{label}</span>—
      </span>
    );
  }
  const clean = value.replace(/^(discord|license2?|steam|ip|live|xbl|fivem):/, "");
  const shown = reveal ? clean : clean.replace(/[^.:]/g, "•").slice(0, 15);
  return (
    <span className="group flex min-w-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11.5px]">
      <span className="shrink-0 font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="min-w-0 truncate font-mono text-slate-200" title={reveal ? clean : undefined}>
        {shown}
      </span>
      {masked && (
        <button type="button" onClick={() => setReveal((r) => !r)} aria-label={reveal ? "Hide" : "Show"} className="text-slate-500 hover:text-white">
          {reveal ? <Icons.eyeOff size={12} /> : <Icons.eye size={12} />}
        </button>
      )}
      <button
        type="button"
        aria-label={`Copy ${label}`}
        onClick={() =>
          navigator.clipboard?.writeText(clean).then(() => {
            setDone(true);
            setTimeout(() => setDone(false), 1000);
          })
        }
        className="text-slate-500 hover:text-white"
      >
        {done ? <Icons.check size={12} className="text-emerald-300" /> : <Icons.copy size={12} />}
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Tabs (underline)                                                            */
/* -------------------------------------------------------------------------- */

export function Tabs<K extends string>({
  value,
  onChange,
  tabs,
}: {
  value: K;
  onChange: (k: K) => void;
  tabs: { key: K; label: string; count?: number }[];
}) {
  return (
    <div className="flex gap-5 border-b border-white/[0.07] px-5">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={cn(
            "relative -mb-px flex items-center gap-1.5 border-b-2 py-3 text-[13px] font-medium transition",
            value === t.key ? "border-white text-white" : "border-transparent text-slate-500 hover:text-slate-200"
          )}
        >
          {t.label}
          {t.count !== undefined && t.count > 0 && (
            <span className="rounded-full bg-white/[0.08] px-1.5 text-[10.5px] tabular-nums text-slate-300">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Small "x ago" that re-renders once a minute. */
export function Ago({ at }: { at: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, (Date.now() - new Date(at).getTime()) / 1000);
  const txt =
    s < 60 ? "just now" : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
  return <span suppressHydrationWarning>{txt}</span>;
}
