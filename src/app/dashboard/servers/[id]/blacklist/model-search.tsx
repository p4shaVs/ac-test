"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";
import { MODEL_KIND_META, joaat, type GtaModel, type ModelKind } from "@/lib/gta-models";

export interface BlacklistState {
  id: string;
  action: string;
  enabled: boolean;
  kind: string;
}

const KIND_ICON: Record<string, keyof typeof Icons> = {
  vehicle: "cube", ped: "user", weapon: "bolt", object: "cube",
};

const ACTIONS = [
  { key: "REMOVE", label: "Remove" },
  { key: "KICK", label: "Kick" },
  { key: "BAN", label: "Ban" },
] as const;

// Only kinds the resource actually enforces server-side appear here:
//   vehicle / ped / object → entityCreating guard (protection.lua)
//   weapon                 → weaponDamageEvent + giveWeaponEvent (protection.lua)
// Explosions are NOT model-hash based; blacklist them in
// Configuration → Explosions → "Blacklisted Explosions" (that path is enforced).
const TABS: { key: string; label: string; kind?: ModelKind }[] = [
  { key: "all", label: "All" },
  { key: "vehicle", label: "Vehicles", kind: "vehicle" },
  { key: "ped", label: "Peds", kind: "ped" },
  { key: "weapon", label: "Weapons", kind: "weapon" },
  { key: "object", label: "Objects", kind: "object" },
];

const PAGE = 60;

export function ModelSearch({
  serverId,
  state,
  counts,
  imgBase,
}: {
  serverId: string;
  state: Record<string, BlacklistState>;
  counts: Record<string, number>;
  imgBase: string;
}) {
  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [action, setAction] = useState<(typeof ACTIONS)[number]["key"]>("BAN");
  const [items, setItems] = useState<GtaModel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [local, setLocal] = useState(state);
  const [busy, setBusy] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  // Arama debounce
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const offset = reset ? 0 : items.length;
        const params = new URLSearchParams({ kind: tab, q: debounced, offset: String(offset), limit: String(PAGE) });
        const res = await fetch(`/api/gta-models?${params}`);
        const json = await res.json();
        if (json.ok) {
          setTotal(json.data.total);
          // Explosions are blacklisted via Configuration → Explosions, not here,
          // so keep them out of the "All" results (their tab is already gone).
          const incoming = (json.data.items as GtaModel[]).filter((m) => m.kind !== "explosion");
          setItems((prev) => (reset ? incoming : [...prev, ...incoming]));
        }
      } finally {
        setLoading(false);
      }
    },
    [tab, debounced, items.length]
  );

  // tab / arama değişince baştan yükle
  useEffect(() => {
    setItems([]);
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debounced]);

  // Sonsuz kaydırma
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && items.length < total) load(false);
    }, { rootMargin: "400px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [loading, items.length, total, load]);

  async function setKara(m: GtaModel) {
    setBusy(m.name);
    try {
      const res = await fetch(`/api/servers/${serverId}/blacklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ÖNEMLİ: model olarak İSİM değil, doğrulanmış sayısal HASH gönderilir.
        // Silah hash'leri (WEAPON_X) büyük harften türetilir; panel arama/
        // görüntüleme için ismi küçük harfle tutar ama sunucuda GetHashKey
        // ile tekrar hesaplanırsa (küçük harften) YANLIŞ hash çıkar ve o
        // silah/model asla eşleşmez. Hash'i burada sabitleyip göndermek bu
        // sorunu tüm türler için (araç/ped/obje/silah) kalıcı çözer.
        body: JSON.stringify({ kind: m.kind, model: String(m.hash), label: m.label, action }),
      });
      const json = await res.json();
      if (json.ok) {
        setLocal((s) => ({ ...s, [m.name]: { id: json.data.id, action, enabled: true, kind: m.kind } }));
      } else if (res.status === 409) {
        setLocal((s) => ({ ...s, [m.name]: { id: s[m.name]?.id ?? "", action, enabled: true, kind: m.kind } }));
      }
    } finally {
      setBusy(null);
    }
  }

  async function setBeyaz(m: GtaModel) {
    const cur = local[m.name];
    if (!cur) return;
    setBusy(m.name);
    try {
      await fetch(`/api/servers/${serverId}/blacklist`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cur.id }),
      });
      setLocal((s) => { const n = { ...s }; delete n[m.name]; return n; });
    } finally {
      setBusy(null);
    }
  }

  const now = new Date();
  const stamp = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  return (
    <div>
      {/* Kategori sekmeleri */}
      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-white/5">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("relative px-4 py-2.5 text-sm font-medium transition", tab === t.key ? "text-white" : "text-slate-400 hover:text-slate-200")}>
            {t.label} <span className="text-slate-500">( {t.kind ? counts[t.kind] ?? 0 : counts.all} )</span>
            {tab === t.key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand-500" />}
          </button>
        ))}
      </div>

      {/* Arama + işlem seçimi */}
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Icons.search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input h-12 pl-11 text-[15px]" placeholder="Search by model name or hash…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-base-900/60 p-1">
          <span className="px-2 text-xs text-slate-500">Blacklist action:</span>
          {ACTIONS.map((a) => (
            <button key={a.key} onClick={() => setAction(a.key)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition",
                action === a.key ? "bg-brand-500/15 text-white ring-1 ring-inset ring-brand-500/40" : "text-slate-400 hover:bg-white/5")}>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <p className="mb-4 font-mono text-xs text-slate-500">
        Last sync: {stamp} &nbsp;|&nbsp; Total models: {counts.all} &nbsp;|&nbsp; Results: {total} &nbsp;|&nbsp; Blacklisted: {Object.keys(local).length}
      </p>

      {/* Grid */}
      {items.length === 0 && !loading ? (
        <div className="rounded-2xl border border-white/5 bg-base-850/60 py-16 text-center text-slate-500">
          No matching models.
          {query.trim() && (
            <div className="mt-4">
              <button className="btn-danger"
                onClick={() => setKara({ name: query.trim().toLowerCase(), label: query.trim(), kind: "object", hash: joaat(query.trim()) })}>
                <Icons.ban size={15} /> «{query.trim()}» kara listeye ekle
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((m) => (
            <ModelCard key={m.kind + m.name} m={m} listed={!!local[m.name]} busy={busy === m.name}
              imgBase={imgBase} onKara={() => setKara(m)} onBeyaz={() => setBeyaz(m)} />
          ))}
        </div>
      )}

      <div ref={sentinel} className="h-10" />
      {loading && <p className="py-4 text-center text-sm text-slate-500">Loading…</p>}
      {!loading && items.length > 0 && items.length >= total && (
        <p className="py-4 text-center text-xs text-slate-600">Showing all results ({total})</p>
      )}
    </div>
  );
}

function ModelCard({
  m, listed, busy, imgBase, onKara, onBeyaz,
}: {
  m: GtaModel; listed: boolean; busy: boolean; imgBase: string; onKara: () => void; onBeyaz: () => void;
}) {
  // Görsel adayları: imgBase varsa png → jpg → webp sırayla denenir, hepsi
  // başarısızsa kategori ikonu gösterilir. imgBase boşsa doğrudan ikon.
  const candidates = imgBase
    ? ["png", "jpg", "webp"].map((ext) => `${imgBase}/${m.kind}/${m.name}.${ext}`)
    : [];
  const [imgIdx, setImgIdx] = useState(0);
  const Icon = Icons[KIND_ICON[m.kind] ?? "cube"];
  const src = candidates[imgIdx];

  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-base-850/60 transition hover:border-white/10">
      <div className="relative aspect-[16/10] bg-gradient-to-br from-slate-700/25 to-base-950">
        <span className="absolute left-2.5 top-2.5 z-10 rounded-md bg-black/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 backdrop-blur">
          {MODEL_KIND_META[m.kind].label}
        </span>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={m.label} className="h-full w-full object-cover" onError={() => setImgIdx((i) => i + 1)} loading="lazy" />
        ) : (
          <>
            <div className="absolute inset-0 bg-grid-faint [background-size:16px_16px] opacity-25" />
            <div className="absolute inset-0 grid place-items-center text-slate-600"><Icon size={34} /></div>
          </>
        )}
      </div>
      <div className="p-3">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{m.label}</p>
            <p className="truncate font-mono text-xs text-slate-500">{m.name}</p>
          </div>
          <CopyBtn value={m.name} title="Copy model name" />
        </div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="truncate font-mono text-xs text-slate-500">{m.hash}</p>
          <CopyBtn value={String(m.hash)} title="Copy hash" />
        </div>
        <div className="flex gap-2">
          <button onClick={onBeyaz} disabled={busy}
            className={cn("flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              !listed ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400 hover:bg-white/5")}>
            Whitelist
          </button>
          <button onClick={onKara} disabled={busy}
            className={cn("flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
              listed ? "border-rose-500/50 bg-rose-500/15 text-rose-300" : "border-white/10 text-slate-400 hover:bg-white/5")}>
            Blacklist
          </button>
        </div>
      </div>
    </div>
  );
}

function CopyBtn({ value, title }: { value: string; title: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button title={title}
      onClick={() => { navigator.clipboard?.writeText(value).then(() => { setOk(true); setTimeout(() => setOk(false), 1200); }); }}
      className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 text-slate-500 transition hover:text-slate-200">
      <Icons.copy size={13} className={ok ? "text-emerald-400" : ""} />
    </button>
  );
}
