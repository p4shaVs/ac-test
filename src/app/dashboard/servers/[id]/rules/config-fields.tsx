"use client";

import { useEffect, useRef, useState } from "react";
import { Icons } from "@/components/icons";
import { isSecretField, listItemProblem, type ACField } from "@/lib/ac-config";
import type { DetectionAction } from "@/lib/detection-actions";
import { cn } from "@/lib/utils";

export type Value = boolean | number | string | string[];

/* -------------------------------------------------------------------------- */
/* Punishment picker                                                           */
/* -------------------------------------------------------------------------- */

export const ACTION_STYLE: Record<DetectionAction, { label: string; text: string; dot: string; chip: string }> = {
  LOG: { label: "Log", text: "text-slate-300", dot: "bg-slate-400", chip: "border-white/10 bg-white/[0.04]" },
  KICK: { label: "Kick", text: "text-amber-300", dot: "bg-amber-400", chip: "border-amber-400/25 bg-amber-400/[0.08]" },
  BAN: { label: "Ban", text: "text-rose-300", dot: "bg-rose-400", chip: "border-rose-400/25 bg-rose-400/[0.08]" },
};

const RANK: Record<DetectionAction, number> = { LOG: 0, KICK: 1, BAN: 2 };

export function ActionSelect({
  value,
  onChange,
  recommended,
  mixed = false,
  size = "sm",
}: {
  value: DetectionAction;
  onChange: (a: DetectionAction) => void;
  recommended?: DetectionAction;
  mixed?: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);
  const s = ACTION_STYLE[value];
  const above = recommended && !mixed && RANK[value] > RANK[recommended];
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={above ? `Above the recommended ${ACTION_STYLE[recommended!].label}` : undefined}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border font-semibold transition hover:brightness-125",
          size === "sm" ? "h-7 px-2 text-[11.5px]" : "h-9 px-3 text-[13px]",
          mixed ? "border-white/10 bg-white/[0.04] text-slate-300" : cn(s.chip, s.text)
        )}
      >
        {!mixed && <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />}
        {mixed ? "Mixed" : s.label}
        {above && <Icons.alert size={11} className="text-amber-300" />}
        <Icons.chevronDown size={12} className="opacity-60" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-30 w-44 rounded-xl border border-white/10 bg-[#141416] p-1 shadow-pop">
          {(["LOG", "KICK", "BAN"] as DetectionAction[]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                onChange(a);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] transition hover:bg-white/[0.06]",
                !mixed && value === a ? "text-white" : "text-slate-300"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", ACTION_STYLE[a].dot)} />
              <span className="flex-1">{ACTION_STYLE[a].label}</span>
              {recommended && RANK[a] > RANK[recommended] && <span className="text-[10px] text-amber-300/80">above rec.</span>}
              {!mixed && value === a && <Icons.check size={13} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Info tooltip                                                                */
/* -------------------------------------------------------------------------- */

export function InfoTip({ text }: { text: string }) {
  if (!text) return null;
  return (
    <span className="group/tip relative inline-flex">
      <Icons.info size={13} className="cursor-help text-slate-600 transition hover:text-slate-300" />
      <span className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-40 w-72 -translate-x-1/2 rounded-xl border border-white/10 bg-[#161618] px-3 py-2.5 text-[11.5px] font-normal leading-relaxed text-slate-300 opacity-0 shadow-pop transition group-hover/tip:opacity-100">
        {text}
      </span>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Field controls                                                              */
/* -------------------------------------------------------------------------- */

export function NumberInput({ field, value, onChange }: { field: ACField; value: number; onChange: (v: number) => void }) {
  const min = field.min ?? 0;
  const max = field.max ?? 100000;
  return (
    <input
      type="number"
      min={min}
      max={max}
      className="input h-9 w-32 shrink-0 text-right tabular-nums"
      value={String(value)}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
    />
  );
}

export function TextInput({
  field,
  value,
  onChange,
  invalid,
}: {
  field: ACField;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  const secret = isSecretField(field);
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative w-full md:max-w-md">
      <input
        type={secret && !reveal ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        maxLength={field.maxLen ?? 200}
        className={cn("input h-9 w-full", secret && "pr-9", invalid && "border-rose-400/50")}
        value={value}
        placeholder={field.kind === "webhook" ? "https://discord.com/api/webhooks/…" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {secret && (
        <button
          type="button"
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? "Hide value" : "Show value"}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
        >
          {reveal ? <Icons.eyeOff size={14} /> : <Icons.eye size={14} />}
        </button>
      )}
    </div>
  );
}

/** Tag-style list editor; entries are checked with the same rule the server uses. */
export function ListControl({ field, value, onChange }: { field: ACField; value: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const [rejected, setRejected] = useState<string | null>(null);

  function addItems() {
    const parts = draft.split(",").map((s) => s.trim()).filter(Boolean);
    const accepted: string[] = [];
    const bad: string[] = [];
    for (const p of parts) {
      const problem = listItemProblem(field, p);
      if (problem) bad.push(`“${p.slice(0, 40)}” (${problem.toLowerCase()})`);
      else if (!value.includes(p) && !accepted.includes(p)) accepted.push(p);
    }
    if (accepted.length) onChange([...value, ...accepted]);
    setRejected(bad.length ? `Not added: ${bad.join(", ")}` : null);
    setDraft(bad.length ? parts.filter((p) => listItemProblem(field, p)).join(", ") : "");
  }

  return (
    <div className="min-w-0">
      {value.length > 0 && (
        <div className="mb-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
          {value.map((item) => (
            <span key={item} className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-slate-200">
              {item}
              <button onClick={() => onChange(value.filter((v) => v !== item))} aria-label={`Remove ${item}`} className="text-slate-500 hover:text-white">
                <Icons.x size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          className="input h-9 flex-1"
          placeholder={value.length ? `${value.length} item${value.length === 1 ? "" : "s"} — add more, comma separated` : "Add items, comma separated, Enter to add"}
          value={draft}
          maxLength={400}
          onChange={(e) => {
            setDraft(e.target.value);
            setRejected(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItems();
            }
          }}
        />
        <button className="btn-secondary h-9 px-3 text-xs" onClick={addItems}>Add</button>
        <button
          className="btn-ghost h-9 px-3 text-xs"
          onClick={() => {
            onChange([]);
            setRejected(null);
          }}
          disabled={value.length === 0}
        >
          Clear
        </button>
      </div>
      {rejected && <p className="mt-1.5 text-[11px] text-rose-300">{rejected}</p>}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A full-width settings row: label + help on the left, control on the right    */
/* -------------------------------------------------------------------------- */

export function SettingRow({
  field,
  value,
  onChange,
  child,
  dim,
  problem,
}: {
  field: ACField;
  value: Value;
  onChange: (v: Value) => void;
  child?: boolean;
  dim?: boolean;
  problem?: string;
}) {
  const secret = isSecretField(field);
  return (
    <div
      className={cn(
        "grid gap-x-8 gap-y-2 border-t border-white/[0.06] px-5 py-3.5 first:border-t-0",
        field.type === "list" ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(0,auto)] md:items-center",
        child && "bg-white/[0.012] pl-9",
        dim && "opacity-50"
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-slate-100">
          {child && <span className="mr-1 h-3 w-px bg-white/15" />}
          {secret && <Icons.lock size={12} className="shrink-0 text-slate-500" />}
          {field.label}
        </p>
        {field.desc && <p className="mt-0.5 max-w-3xl text-xs leading-relaxed text-slate-500">{field.desc}</p>}
      </div>
      {field.type === "list" ? (
        <ListControl field={field} value={(value as string[]) ?? []} onChange={onChange} />
      ) : (
        <div className="flex flex-col gap-1 md:items-end">
          {field.type === "toggle" && (
            <button onClick={() => onChange(!(value as boolean))} aria-label={`Toggle ${field.label}`} aria-pressed={value as boolean}>
              <span className={cn("switch", value ? "switch-on" : "switch-off")}>
                <span className={cn("switch-knob", value ? "translate-x-[18px] bg-[#0a0a0b]" : "translate-x-[3px] bg-slate-400")} />
              </span>
            </button>
          )}
          {field.type === "number" && <NumberInput field={field} value={value as number} onChange={onChange} />}
          {field.type === "text" && <TextInput field={field} value={String(value)} onChange={onChange} invalid={!!problem} />}
          {problem && <p className="text-[11px] text-rose-300 md:text-right">{problem}</p>}
        </div>
      )}
    </div>
  );
}

export function Toggle({ on, onClick, label, disabled }: { on: boolean; onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={on} disabled={disabled} className="disabled:cursor-not-allowed">
      <span className={cn("switch", on ? "switch-on" : "switch-off", disabled && "opacity-40")}>
        <span className={cn("switch-knob", on ? "translate-x-[18px] bg-[#0a0a0b]" : "translate-x-[3px] bg-slate-400")} />
      </span>
    </button>
  );
}
