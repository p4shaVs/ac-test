"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import {
  AC_TABS,
  acWithoutSecrets,
  defaultAcConfig,
  fieldProblem,
  isSecretField,
  type ACConfig,
  type ACField,
} from "@/lib/ac-config";
import { defaultRules } from "@/lib/rules";
import {
  DETECTION_TYPES,
  defaultActions,
  detectionLabel,
  recommendedMax,
  type DetectionAction,
} from "@/lib/detection-actions";
import { acField, buildCatalog, type CatalogCategory, type CatalogItem } from "@/lib/config-catalog";
import { cn } from "@/lib/utils";
import { ACTION_STYLE, ActionSelect, InfoTip, ListControl, NumberInput, SettingRow, TextInput, Toggle, type Value } from "./config-fields";
import { Portal } from "@/components/portal";

const CATALOG = buildCatalog();
const TYPE_DEF = new Map(DETECTION_TYPES.map((d) => [d.type, d]));
const ALL_AC_FIELDS: ACField[] = AC_TABS.flatMap((t) => t.cards.flatMap((c) => c.fields));
const fid = (f: ACField) => `${f.section}.${f.key}`;

// Server-side settings shown below the protections (the old "Settings" tab). Backdoor
// protection is a protection row above, so its card is not repeated here.
const SETTINGS_CARDS = (AC_TABS.find((t) => t.id === "settings")?.cards ?? []).filter((c) => c.title !== "Backdoor Protection");

type Section = { id: string; label: string; kind: "catalog" | "settings" };
const SECTIONS: Section[] = [
  ...CATALOG.map((c) => ({ id: c.id, label: c.label, kind: "catalog" as const })),
  ...SETTINGS_CARDS.map((c) => ({ id: `settings-${c.title.toLowerCase().replace(/[^a-z]+/g, "-")}`, label: c.title, kind: "settings" as const })),
];

export function ConfigPage({
  serverId,
  initialAc,
  initialRules,
  initialActions,
  initialExplicit,
  pause,
  autoBanLicensed,
}: {
  serverId: string;
  initialAc: ACConfig;
  initialRules: Record<string, boolean>;
  initialActions: Record<string, DetectionAction>;
  initialExplicit: string[];
  pause: "log_only" | "bans_off" | null;
  autoBanLicensed: boolean;
}) {
  const router = useRouter();
  const [ac, setAc] = useState<ACConfig>(initialAc);
  const [rules, setRules] = useState(initialRules);
  const [actions, setActions] = useState(initialActions);
  const [explicit, setExplicit] = useState<Set<string>>(new Set(initialExplicit));
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(SECTIONS[0].id);
  const fileRef = useRef<HTMLInputElement>(null);

  // ---------------------------------------------------------------- state helpers
  const acDirty = useMemo(() => JSON.stringify(ac) !== JSON.stringify(initialAc), [ac, initialAc]);
  const rulesDirty = useMemo(() => JSON.stringify(rules) !== JSON.stringify(initialRules), [rules, initialRules]);
  const actionsDirty = useMemo(
    () =>
      JSON.stringify(actions) !== JSON.stringify(initialActions) ||
      JSON.stringify([...explicit].sort()) !== JSON.stringify([...initialExplicit].sort()),
    [actions, initialActions, explicit, initialExplicit]
  );
  const dirty = acDirty || rulesDirty || actionsDirty;

  function getAc(f: ACField): Value {
    const v = ac[f.section]?.[f.key];
    return v === undefined ? f.default : v;
  }
  function setAcValue(f: ACField, value: Value) {
    setAc((prev) => ({ ...prev, [f.section]: { ...prev[f.section], [f.key]: value } }));
    setSaved(false);
    setSaveError(null);
  }
  function isOn(item: CatalogItem): boolean | null {
    const t = item.toggle;
    if (!t) return null;
    if (t.kind === "rule") return rules[t.key] === true;
    const f = acField(`${t.section}.${t.key}`);
    return f ? getAc(f) === true : null;
  }
  function setOn(item: CatalogItem, on: boolean) {
    const t = item.toggle;
    if (!t) return;
    if (t.kind === "rule") {
      setRules((r) => ({ ...r, [t.key]: on }));
    } else {
      const f = acField(`${t.section}.${t.key}`);
      if (f) setAcValue(f, on);
    }
    setSaved(false);
  }
  function actionOf(type: string): DetectionAction {
    return actions[type] ?? TYPE_DEF.get(type)?.defaultAction ?? "LOG";
  }
  function setAction(types: string[], a: DetectionAction) {
    setActions((prev) => {
      const next = { ...prev };
      for (const t of types) next[t] = a;
      return next;
    });
    setExplicit((e) => {
      const n = new Set(e);
      for (const t of types) n.add(t);
      return n;
    });
    setSaved(false);
  }

  const problems = useMemo(() => {
    const out: Record<string, string> = {};
    for (const f of ALL_AC_FIELDS) {
      const p = fieldProblem(f, ac[f.section]?.[f.key]);
      if (p) out[fid(f)] = p;
    }
    return out;
  }, [ac]);
  const problemCount = Object.keys(problems).length;

  // ---------------------------------------------------------------- save
  async function save() {
    if (problemCount) return;
    setSaving(true);
    setSaveError(null);
    try {
      const calls: Promise<Response>[] = [];
      if (acDirty) calls.push(fetch(`/api/servers/${serverId}/config`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ac }) }));
      if (rulesDirty) calls.push(fetch(`/api/servers/${serverId}/rules`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules }) }));
      if (actionsDirty)
        calls.push(fetch(`/api/servers/${serverId}/actions`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actions, explicit: [...explicit] }) }));
      const results = await Promise.all(calls);
      if (results.every((r) => r.ok)) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      } else {
        setSaveError("Some changes could not be saved — please try again.");
      }
    } catch {
      setSaveError("Could not reach the panel — please try again.");
    } finally {
      setSaving(false);
    }
  }

  function discard() {
    setAc(initialAc);
    setRules(initialRules);
    setActions(initialActions);
    setExplicit(new Set(initialExplicit));
    setSaveError(null);
  }

  // Reset keeps credentials (webhook URLs, API keys) — they are not "settings".
  function resetAll() {
    const next = defaultAcConfig();
    for (const f of ALL_AC_FIELDS) {
      if (isSecretField(f) && ac[f.section]?.[f.key] !== undefined) next[f.section][f.key] = ac[f.section][f.key];
    }
    setAc(next);
    setRules(defaultRules());
    setActions(defaultActions());
    setExplicit(new Set());
    setSaved(false);
  }

  // Export / import: protections, server guards and punishments in one file. Secrets stay out.
  function exportConfig() {
    const blob = new Blob([JSON.stringify({ ac: acWithoutSecrets(ac), rules, actions }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coreac-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  function importConfig(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (!parsed || typeof parsed !== "object") return;
        // Older exports are the bare CoreAC config; newer ones wrap it with rules and actions.
        const acPart = parsed.ac && typeof parsed.ac === "object" ? parsed.ac : parsed;
        const merged: ACConfig = { ...defaultAcConfig() };
        for (const [section, fields] of Object.entries(acPart as ACConfig)) {
          if (merged[section] && fields && typeof fields === "object") merged[section] = { ...merged[section], ...fields };
        }
        for (const f of ALL_AC_FIELDS) {
          if (isSecretField(f) && ac[f.section]?.[f.key] !== undefined) merged[f.section][f.key] = ac[f.section][f.key];
        }
        setAc(merged);
        if (parsed.rules && typeof parsed.rules === "object") {
          const r = { ...defaultRules() };
          for (const [k, v] of Object.entries(parsed.rules)) if (k in r && typeof v === "boolean") r[k] = v;
          setRules(r);
        }
        if (parsed.actions && typeof parsed.actions === "object") {
          const next = { ...defaultActions() };
          for (const [k, v] of Object.entries(parsed.actions)) {
            if (k in next && (v === "LOG" || v === "KICK" || v === "BAN")) next[k] = v;
          }
          setActions(next);
          setExplicit(new Set(Object.keys(next).filter((k) => next[k] !== defaultActions()[k])));
        }
        setSaved(false);
      } catch {
        // not JSON — ignore
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ---------------------------------------------------------------- search + scroll spy
  const q = query.trim().toLowerCase();
  const matches = (item: CatalogItem) =>
    !q ||
    item.label.toLowerCase().includes(q) ||
    item.desc.toLowerCase().includes(q) ||
    item.types.some((t) => t.toLowerCase().includes(q) || detectionLabel(t).toLowerCase().includes(q));
  const settingMatches = (f: ACField) => !q || f.label.toLowerCase().includes(q) || (f.desc?.toLowerCase().includes(q) ?? false);

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(`cfg-${s.id}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveSection(top.target.id.replace(/^cfg-/, ""));
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [q]);

  function jump(id: string) {
    document.getElementById(`cfg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const stats = (cat: CatalogCategory) => {
    const switchable = cat.items.filter((i) => i.toggle);
    return { on: switchable.filter((i) => isOn(i)).length, total: switchable.length };
  };

  // ---------------------------------------------------------------- render
  return (
    <div className="pb-24">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Server configuration</p>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-white">Configuration</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-slate-400">
            Every protection on one page. The switch turns a check on or off, the menu next to it decides what happens when it fires —
            the one you pick is the one that runs. Changes reach the server on its next heartbeat.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Icons.search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input h-9 w-full pl-9 sm:w-72" placeholder="Search protections and settings…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <button className="btn-secondary h-9 px-3 text-xs" onClick={() => fileRef.current?.click()}>
            <Icons.download size={14} className="rotate-180" /> Import
          </button>
          <button className="btn-secondary h-9 px-3 text-xs" onClick={exportConfig} title="Webhook URLs and API keys are not included">
            <Icons.download size={14} /> Export
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importConfig} />
        </div>
      </div>

      {(pause || !autoBanLicensed) && (
        <div className="mb-6 space-y-2">
          {pause && (
            <Notice>
              <b className="font-semibold text-amber-200">Punishments are paused.</b>{" "}
              {pause === "log_only" ? "Log-Only Mode is on (Enforcement below)" : "Enable Bans is off (Bans & Evidence below)"} — every detection is only recorded. Bans and kicks you issue by hand still work.
            </Notice>
          )}
          {!autoBanLicensed && (
            <Notice>
              <b className="font-semibold text-amber-200">Your licence does not include Auto Ban.</b> Anything set to Ban is applied as a Kick.
            </Notice>
          )}
        </div>
      )}

      <div className="grid gap-8 xl:grid-cols-[220px_minmax(0,1fr)]">
        {/* Index */}
        <aside className="hidden xl:block">
          <div className="sticky top-[84px] space-y-5">
            <IndexGroup title="Protections">
              {CATALOG.map((c) => {
                const s = stats(c);
                return (
                  <IndexLink key={c.id} active={activeSection === c.id} onClick={() => jump(c.id)} label={c.label} meta={s.total ? `${s.on}/${s.total}` : undefined} />
                );
              })}
            </IndexGroup>
            <IndexGroup title="Server settings">
              {SECTIONS.filter((s) => s.kind === "settings").map((s) => (
                <IndexLink key={s.id} active={activeSection === s.id} onClick={() => jump(s.id)} label={s.label} />
              ))}
            </IndexGroup>
          </div>
        </aside>

        <div className="min-w-0 space-y-10">
          {CATALOG.map((cat) => {
            const items = cat.items.filter(matches);
            if (q && items.length === 0) return null;
            const s = stats(cat);
            const Icon = Icons[cat.icon];
            return (
              <section key={cat.id} id={`cfg-${cat.id}`} className="scroll-mt-24">
                <div className="mb-3 flex items-end justify-between gap-3 border-b border-white/[0.06] pb-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300">
                      <Icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-200">{cat.label}</h2>
                      <p className="truncate text-xs text-slate-500">{cat.desc}</p>
                    </div>
                  </div>
                  {s.total > 0 && (
                    <span className="shrink-0 font-mono text-[11px] text-slate-500">
                      <span className="text-slate-200">{s.on}</span> / {s.total} on
                    </span>
                  )}
                </div>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {items.map((item) => (
                    <ProtectionRow
                      key={item.id}
                      item={item}
                      on={isOn(item)}
                      onToggle={() => setOn(item, !isOn(item))}
                      actionOf={actionOf}
                      onAction={(a) => setAction(item.types, a)}
                      onEdit={() => setEditing(item)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {SETTINGS_CARDS.map((card) => {
            const id = `settings-${card.title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
            const fields = card.fields.filter(settingMatches);
            if (q && fields.length === 0) return null;
            return (
              <section key={id} id={`cfg-${id}`} className="scroll-mt-24">
                <div className="mb-3 border-b border-white/[0.06] pb-3">
                  <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-slate-200">{card.title}</h2>
                  {card.desc && <p className="text-xs text-slate-500">{card.desc}</p>}
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0f0f11]">
                  {fields.map((f) => {
                    const parent = f.parent ? card.fields.find((x) => x.key === f.parent && x.section === f.section) : undefined;
                    return (
                      <SettingRow
                        key={fid(f)}
                        field={f}
                        value={getAc(f)}
                        onChange={(v) => setAcValue(f, v)}
                        child={!!parent}
                        dim={parent ? getAc(parent) !== true : false}
                        problem={problems[fid(f)]}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}

          {q && CATALOG.every((c) => c.items.filter(matches).length === 0) && SETTINGS_CARDS.every((c) => c.fields.filter(settingMatches).length === 0) && (
            <div className="rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center text-sm text-slate-500">
              Nothing matches “{query}”.
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {editing && (
        <Drawer
          item={editing}
          onClose={() => setEditing(null)}
          on={isOn(editing)}
          onToggle={() => setOn(editing, !isOn(editing))}
          actionOf={actionOf}
          setAction={setAction}
          explicit={explicit}
          getAc={getAc}
          setAcValue={setAcValue}
          problems={problems}
        />
      )}

      {/* Save bar */}
      <div
        className={cn(
          "fixed bottom-5 left-1/2 z-40 flex w-[min(720px,calc(100%-2rem))] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#141416]/95 px-4 py-3 shadow-pop backdrop-blur transition-all lg:left-[calc(50%+128px)]",
          dirty || saved ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0"
        )}
      >
        <span className="min-w-0 text-[13px] text-slate-300">
          {saved ? (
            <span className="flex items-center gap-1.5 text-emerald-300"><Icons.check size={15} /> Saved</span>
          ) : saveError ? (
            <span className="text-rose-300">{saveError}</span>
          ) : problemCount ? (
            <span className="text-amber-300">Fix {problemCount} highlighted field{problemCount === 1 ? "" : "s"} first</span>
          ) : (
            <span className="flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Unsaved changes</span>
          )}
        </span>
        <div className="flex shrink-0 gap-2">
          <button className="btn-ghost h-9 px-3 text-xs" onClick={resetAll} title="Restore every default (webhook URLs and API keys are kept)">
            Reset defaults
          </button>
          <button className="btn-secondary h-9 px-3 text-xs" onClick={discard} disabled={!dirty}>Discard</button>
          <button className="btn-primary h-9 px-4 text-xs" onClick={save} disabled={!dirty || saving || problemCount > 0}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-[13px] text-amber-100/80">
      <Icons.alert size={15} className="mt-0.5 shrink-0 text-amber-300" />
      <p>{children}</p>
    </div>
  );
}

function IndexGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function IndexLink({ label, meta, active, onClick }: { label: string; meta?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition",
        active ? "bg-white/[0.07] text-white" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-200"
      )}
    >
      <span className="flex-1 truncate">{label}</span>
      {meta && <span className="font-mono text-[10.5px] text-slate-600">{meta}</span>}
    </button>
  );
}

function ProtectionRow({
  item,
  on,
  onToggle,
  actionOf,
  onAction,
  onEdit,
}: {
  item: CatalogItem;
  on: boolean | null;
  onToggle: () => void;
  actionOf: (t: string) => DetectionAction;
  onAction: (a: DetectionAction) => void;
  onEdit: () => void;
}) {
  const actionValues = item.types.map(actionOf);
  const mixed = new Set(actionValues).size > 1;
  const value = actionValues[0] ?? "LOG";
  const def = item.types.length ? TYPE_DEF.get(item.types[0]) : undefined;
  const recommended = def ? recommendedMax(def) : undefined;
  const editable = item.params.length > 0 || item.types.length > 1;
  return (
    <div
      className={cn(
        "group flex min-h-[54px] items-center gap-3 rounded-xl border bg-[#111113] px-3.5 py-2.5 transition",
        on === false ? "border-white/[0.05] opacity-70" : "border-white/[0.07] hover:border-white/[0.13]"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="line-clamp-2 break-words text-[13px] font-medium leading-snug text-slate-100" title={item.label}>{item.label}</p>
          <InfoTip text={item.desc} />
          <button
            onClick={onEdit}
            className={cn("text-slate-600 transition hover:text-slate-200", !editable && "opacity-0 group-hover:opacity-100")}
            aria-label={`Details for ${item.label}`}
            title="Details"
          >
            <Icons.pencil size={13} />
          </button>
        </div>
        {item.types.length > 1 && <p className="mt-0.5 truncate text-[11px] text-slate-600">{item.types.length} detections</p>}
        {item.utility && <p className="mt-0.5 text-[11px] text-slate-600">Server option</p>}
      </div>
      {item.types.length > 0 && !item.utility && <ActionSelect value={value} mixed={mixed} recommended={recommended} onChange={onAction} />}
      {on === null ? (
        <span className="rounded-md border border-white/10 px-1.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">Always on</span>
      ) : (
        <Toggle on={on} onClick={onToggle} label={`Toggle ${item.label}`} />
      )}
    </div>
  );
}

function Drawer({
  item,
  onClose,
  on,
  onToggle,
  actionOf,
  setAction,
  explicit,
  getAc,
  setAcValue,
  problems,
}: {
  item: CatalogItem;
  onClose: () => void;
  on: boolean | null;
  onToggle: () => void;
  actionOf: (t: string) => DetectionAction;
  setAction: (types: string[], a: DetectionAction) => void;
  explicit: Set<string>;
  getAc: (f: ACField) => Value;
  setAcValue: (f: ACField, v: Value) => void;
  problems: Record<string, string>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const params = item.params.map((p) => acField(p)).filter(Boolean) as ACField[];
  return (
    <Portal>
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-white/10 bg-[#0e0e10] shadow-pop">
        <div className="flex items-start justify-between gap-3 border-b border-white/[0.07] px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Protection</p>
            <h3 className="mt-1 text-lg font-semibold text-white">{item.label}</h3>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="Close">
            <Icons.x size={17} />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {item.desc && <p className="text-[13px] leading-relaxed text-slate-400">{item.desc}</p>}

          <div className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
            <div>
              <p className="text-[13px] font-medium text-slate-100">Enabled</p>
              <p className="text-xs text-slate-500">{on === null ? "This check always runs." : on ? "The check is running." : "The check is switched off."}</p>
            </div>
            {on === null ? (
              <span className="rounded-md border border-white/10 px-1.5 py-1 text-[9.5px] font-semibold uppercase tracking-[0.1em] text-slate-500">Always on</span>
            ) : (
              <Toggle on={on} onClick={onToggle} label="Toggle" />
            )}
          </div>

          {item.types.length > 0 && !item.utility && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Punishment</p>
              <div className="overflow-hidden rounded-xl border border-white/[0.07]">
                {item.types.map((t) => {
                  const def = TYPE_DEF.get(t);
                  const rec = def ? recommendedMax(def) : undefined;
                  const current = actionOf(t);
                  return (
                    <div key={t} className="flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3 first:border-t-0">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-slate-100">{detectionLabel(t)}</p>
                        <p className="text-[11px] text-slate-500">
                          {def?.confidence ?? "heuristic"} · recommended up to {rec ? ACTION_STYLE[rec].label : "Log"}
                          {explicit.has(t) || (def && current !== def.defaultAction) ? " · custom" : ""}
                        </p>
                      </div>
                      <ActionSelect value={current} recommended={rec} onChange={(a) => setAction([t], a)} size="md" />
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                The action you pick runs for every report of that detection. Above the recommendation a legitimate player who trips the check is punished too.
              </p>
            </div>
          )}

          {params.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Settings</p>
              <div className="space-y-4">
                {params.map((f) => (
                  <div key={fid(f)}>
                    <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-100">
                      {f.label} <InfoTip text={f.desc ?? ""} />
                    </p>
                    {f.type === "list" && <ListControl field={f} value={(getAc(f) as string[]) ?? []} onChange={(v) => setAcValue(f, v)} />}
                    {f.type === "number" && <NumberInput field={f} value={getAc(f) as number} onChange={(v) => setAcValue(f, v)} />}
                    {f.type === "text" && <TextInput field={f} value={String(getAc(f))} onChange={(v) => setAcValue(f, v)} invalid={!!problems[fid(f)]} />}
                    {f.type === "toggle" && <Toggle on={getAc(f) === true} onClick={() => setAcValue(f, !(getAc(f) === true))} label={f.label} />}
                    {problems[fid(f)] && <p className="mt-1 text-[11px] text-rose-300">{problems[fid(f)]}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Reference</p>
            <div className="flex flex-wrap gap-1.5">
              {item.toggle && (
                <code className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-slate-400">
                  {item.toggle.kind === "rule" ? `rules.${item.toggle.key}` : `Config.${item.toggle.section}.${item.toggle.key}`}
                </code>
              )}
              {item.types.map((t) => (
                <code key={t} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] text-slate-400">{t}</code>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-white/[0.07] px-6 py-4">
          <button className="btn-primary w-full" onClick={onClose}>Done</button>
          <p className="mt-2 text-center text-[11px] text-slate-600">Changes are kept on the page until you press Save changes.</p>
        </div>
      </aside>
    </div>
    </Portal>
  );
}
