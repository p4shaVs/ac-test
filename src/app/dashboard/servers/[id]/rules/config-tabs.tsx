"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import { AC_TABS, defaultAcConfig, type ACConfig, type ACField, type ACCard } from "@/lib/ac-config";
import { cn } from "@/lib/utils";

// Configuration page — mirrors the reference layout: top tabs (Main / Weapons /
// Entities / Explosions / Premium / Beta / Settings) with grouped cards. Every
// control maps 1:1 to a real CoreAC.Config field and is saved to config.ac.
export function ConfigTabs({ serverId, initialAc }: { serverId: string; initialAc: ACConfig }) {
  const router = useRouter();
  const [ac, setAc] = useState<ACConfig>(initialAc);
  const [tabId, setTabId] = useState(AC_TABS[0].id);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(() => JSON.stringify(ac) !== JSON.stringify(initialAc), [ac, initialAc]);

  // Export: mevcut config'i JSON dosyası olarak indir.
  function exportConfig() {
    const blob = new Blob([JSON.stringify(ac, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coreac-config-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import: JSON dosyasından config yükle (yalnızca bilinen bölümler/anahtarlar
  // uygulanır; kaydederken sunucu ayrıca sanitize eder). Kaydetmeden state'e alır.
  function importConfig(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed && typeof parsed === "object") {
          const merged: ACConfig = { ...defaultAcConfig() };
          for (const [section, fields] of Object.entries(parsed as ACConfig)) {
            if (merged[section] && fields && typeof fields === "object") {
              merged[section] = { ...merged[section], ...fields };
            }
          }
          setAc(merged);
          setSaved(false);
        }
      } catch {
        // geçersiz JSON — sessizce yoksay
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function get(f: ACField) {
    const v = ac[f.section]?.[f.key];
    return v === undefined ? f.default : v;
  }
  function set(f: ACField, value: boolean | number | string | string[]) {
    setAc((prev) => ({ ...prev, [f.section]: { ...prev[f.section], [f.key]: value } }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ac }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      }
    } finally {
      setSaving(false);
    }
  }

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const activeTab = AC_TABS.find((t) => t.id === tabId)!;

  // When searching, flatten matching fields into a single card.
  const searchCards = useMemo<ACCard[]>(() => {
    if (!searching) return [];
    const fields = AC_TABS.flatMap((t) => t.cards.flatMap((c) => c.fields)).filter((f) =>
      f.label.toLowerCase().includes(q) || (f.desc?.toLowerCase().includes(q) ?? false)
    );
    return [{ title: `Search results (${fields.length})`, fields }];
  }, [q, searching]);

  const cards = searching ? searchCards : activeTab.cards;

  return (
    <div className="space-y-4">
      {/* Compact header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
            <Icons.shieldCheck size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">Configuration</h2>
            <p className="text-xs text-slate-500">Changes apply to the server on the next heartbeat</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Icons.search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input h-9 w-full pl-9 sm:w-64"
              placeholder="Search configuration options…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button className="btn-secondary h-9 px-3 text-xs" onClick={() => fileRef.current?.click()}>
            <Icons.download size={14} className="rotate-180" /> Import
          </button>
          <button className="btn-secondary h-9 px-3 text-xs" onClick={exportConfig}>
            <Icons.download size={14} /> Export
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importConfig} />
        </div>
      </div>

      {/* Top tab bar */}
      {!searching && (
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-white/10 bg-base-900/60 p-1">
          {AC_TABS.map((t) => {
            const Icon = (Icons as any)[t.icon] ?? Icons.shield;
            return (
              <button
                key={t.id}
                onClick={() => setTabId(t.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition",
                  tabId === t.id
                    ? "bg-brand-500/15 text-white ring-1 ring-inset ring-brand-500/40"
                    : "text-slate-400 hover:bg-white/5"
                )}
              >
                <Icon size={16} /> {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Cards grid */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <div key={card.title} className="rounded-2xl border border-white/5 bg-base-850/60 p-4">
            <div className="mb-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Icons.shieldCheck size={15} className="text-brand-400" /> {card.title}
              </h3>
              {card.desc && <p className="mt-0.5 text-xs text-slate-500">{card.desc}</p>}
            </div>
            <div className="space-y-2">
              {card.fields.map((f) => (
                <FieldRow key={`${f.section}.${f.key}`} field={f} value={get(f)} onChange={(v) => set(f, v)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Sticky save bar */}
      <div
        className={cn(
          "sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 shadow-card backdrop-blur-xl transition-all",
          dirty
            ? "border-brand-500/30 bg-base-850/90 opacity-100"
            : "pointer-events-none translate-y-2 opacity-0"
        )}
      >
        <span className="text-sm text-slate-300">
          {saved ? (
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Icons.check size={16} /> Saved
            </span>
          ) : (
            "You have unsaved changes"
          )}
        </span>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setAc(initialAc)}>
            Cancel Changes
          </button>
          <button className="btn-ghost text-xs" onClick={() => setAc(defaultAcConfig())}>
            Reset to Default
          </button>
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: ACField;
  value: boolean | number | string | string[];
  onChange: (v: boolean | number | string | string[]) => void;
}) {
  if (field.type === "list") {
    return <ListField field={field} value={(value as string[]) ?? []} onChange={onChange} />;
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-base-900/40 px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-slate-200">{field.label}</p>
        {field.desc && <p className="truncate text-[11px] text-slate-500">{field.desc}</p>}
      </div>
      {field.type === "toggle" && (
        <button onClick={() => onChange(!(value as boolean))} aria-label="Toggle" className="shrink-0">
          <Switch on={value as boolean} />
        </button>
      )}
      {field.type === "number" && (
        <input
          type="number"
          className="input h-8 w-24 shrink-0 text-right"
          value={String(value)}
          onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        />
      )}
      {field.type === "text" && (
        <input
          type="text"
          className="input h-8 w-48 shrink-0"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function ListField({
  field,
  value,
  onChange,
}: {
  field: ACField;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function addItems() {
    const parts = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !value.includes(s));
    if (parts.length) onChange([...value, ...parts]);
    setDraft("");
  }

  return (
    <div className="rounded-lg border border-white/5 bg-base-900/40 px-3 py-2.5">
      <div className="mb-1.5">
        <p className="text-sm text-slate-200">{field.label}</p>
        {field.desc && <p className="text-[11px] text-slate-500">{field.desc}</p>}
      </div>
      <div className="flex gap-1.5">
        <input
          className="input h-8 flex-1"
          placeholder="value, value, …"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addItems();
            }
          }}
        />
        <button className="btn-secondary h-8 px-3 text-xs" onClick={addItems}>
          Add
        </button>
        <button
          className="btn-ghost h-8 px-3 text-xs"
          onClick={() => onChange([])}
          disabled={value.length === 0}
        >
          Clear All
        </button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">{value.length} items</p>
      {value.length > 0 && (
        <div className="mt-1.5 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
          {value.map((item) => (
            <span
              key={item}
              className="flex items-center gap-1 rounded-md bg-brand-500/10 px-2 py-0.5 text-[11px] text-brand-200 ring-1 ring-brand-500/30"
            >
              {item}
              <button onClick={() => onChange(value.filter((v) => v !== item))} className="text-brand-300/70 hover:text-white">
                <Icons.x size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Switch({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition",
        on ? "bg-brand-500" : "bg-white/10"
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
          on ? "translate-x-6" : "translate-x-1"
        )}
      />
    </span>
  );
}
