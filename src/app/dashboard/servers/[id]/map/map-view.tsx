"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Icons } from "@/components/icons";
import { cn, safeMediaUrl } from "@/lib/utils";
import type { Marker3D } from "./map3d";

const Map3D = dynamic(() => import("./map3d"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">Loading map…</div>
  ),
});

export interface MapPlayer {
  id: string;
  name: string;
  trustScore: number;
  license: string | null;
  playtimeSec: number;
  posX: number | null;
  posY: number | null;
  heading: number | null;
  health: number | null;
  armor: number | null;
  activity: string | null;
  ping: number | null;
}

const WORLD = { minX: -4000, maxX: 4500, topY: 8000, botY: -4000 };
function worldToPct(x: number, y: number) {
  const px = ((x - WORLD.minX) / (WORLD.maxX - WORLD.minX)) * 100;
  const py = ((WORLD.topY - y) / (WORLD.topY - WORLD.botY)) * 100;
  return { x: Math.max(1, Math.min(99, px)), y: Math.max(1, Math.min(99, py)) };
}
function fallbackPos(id: string) {
  let h1 = 0, h2 = 0;
  for (let i = 0; i < id.length; i++) {
    h1 = (h1 * 31 + id.charCodeAt(i)) % 100000;
    h2 = (h2 * 17 + id.charCodeAt(i) * 7) % 100000;
  }
  return { x: 25 + (h1 % 55), y: 25 + (h2 % 55) };
}
function threatColor(score: number) {
  if (score >= 70) return "#10b981";
  if (score >= 40) return "#f59e0b";
  return "#f43f5e";
}
const ACTIVITY_LABEL: Record<string, string> = {
  driving: "In vehicle", walking: "On foot", shooting: "Shooting",
  swimming: "Swimming", parachuting: "Parachuting", idle: "Idle",
  falling: "Falling", ragdoll: "Yerde",
};

type ViewMode = "iso" | "top" | "city";
type FilterMode = "heat" | "risky" | "cluster";

export function MapView({ serverId, players, maxSlots }: { serverId: string; players: MapPlayer[]; maxSlots: number }) {
  const router = useRouter();
  const [view, setView] = useState<ViewMode>("iso");
  const [mode, setMode] = useState<FilterMode>("cluster");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [live, setLive] = useState(true);
  const [minTrust, setMinTrust] = useState(0);
  const [maxTrust, setMaxTrust] = useState(100);
  const [maxPlaytimeH, setMaxPlaytimeH] = useState(24);
  const [recentOnly, setRecentOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [live, router]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return players.filter((p) => {
      if (p.trustScore < minTrust || p.trustScore > maxTrust) return false;
      const ph = p.playtimeSec / 3600;
      if (maxPlaytimeH < 24 && ph > maxPlaytimeH) return false;
      if (newOnly && ph > 5) return false;
      if (mode === "risky" && p.trustScore >= 40) return false;
      if (q && !(p.name.toLowerCase().includes(q) || (p.license ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [players, query, minTrust, maxTrust, maxPlaytimeH, newOnly, mode]);

  function coordOf(p: MapPlayer) {
    if (p.posX != null && p.posY != null) return worldToPct(p.posX, p.posY);
    return fallbackPos(p.id);
  }

  const shown = filtered;
  const shownIds = new Set(shown.map((p) => p.id));
  const sel = players.find((p) => p.id === selected) ?? null;

  // 3D harita için işaretçiler (tüm oyuncular; filtre dışındakiler soluk)
  const markers: Marker3D[] = useMemo(
    () =>
      players.map((p) => {
        const c = coordOf(p);
        return { id: p.id, u: c.x / 100, v: c.y / 100, color: threatColor(p.trustScore), selected: p.id === selected, dim: !shownIds.has(p.id) || (mode === "risky" && p.trustScore >= 40) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [players, selected, shownIds.size, mode, minTrust, maxTrust]
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      {/* 3D Harita (three.js — gerçek GTA V uydu dokusu + yükseklik) */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0a1119]"
        style={{ aspectRatio: "10 / 9" }}>
        <Map3D markers={markers} view={view} onSelect={(id) => setSelected((s) => (s === id ? null : id))} />

        {/* Görünüm anahtarları */}
        <div className="absolute right-3 top-3 z-30 flex items-center gap-0.5 rounded-xl border border-white/10 bg-base-950/70 p-1 backdrop-blur">
          {([["iso", "Isometric"], ["top", "Top-down"], ["city", "City"]] as [ViewMode, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition", view === k ? "bg-white/10 text-white" : "text-slate-400 hover:text-slate-200")}>
              {label}
            </button>
          ))}
        </div>
        <div className="absolute left-3 top-3 z-30 flex items-center gap-2 rounded-xl border border-white/10 bg-base-950/70 px-3 py-1.5 text-xs text-slate-300 backdrop-blur">
          <Icons.map size={14} className="text-brand-300" /> {shown.length}/{maxSlots} online
        </div>
        <button onClick={() => setLive((l) => !l)}
          className={cn("absolute bottom-3 left-3 z-30 flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs backdrop-blur transition",
            live ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-white/10 bg-base-950/70 text-slate-400")}>
          <span className={cn("h-1.5 w-1.5 rounded-full", live && "animate-pulse bg-emerald-400")} /> {live ? "LIVE" : "Paused"}
        </button>
        <div className="absolute bottom-3 right-3 z-20 rounded-lg border border-white/10 bg-base-950/60 px-2.5 py-1 text-[10px] text-slate-500 backdrop-blur">
          Drag to rotate · scroll to zoom
        </div>
      </div>

      {/* Sağ panel: filtreler + oyuncu listesi */}
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-white/5 bg-base-850/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-white">Players</span>
            <span className="text-xs text-slate-500">{shown.length} shown</span>
          </div>
          <p className="mb-3 text-xs text-slate-500">Click a player to open their profile.</p>

          {/* Mod radyoları */}
          <div className="mb-3 flex gap-1.5">
            {([["heat", "Heatmap"], ["risky", "Sadece riskli"], ["cluster", "Stall"]] as [FilterMode, string][]).map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)}
                className={cn("flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition",
                  mode === k ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-white/10 text-slate-400 hover:bg-white/5")}>
                {label}
              </button>
            ))}
          </div>

          <div className="relative mb-3">
            <Icons.search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input h-9 pl-9 text-sm" placeholder="Search by player or Discord…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          {/* İtibar puanı aralığı */}
          <RangeRow label="Trust score" min={0} max={100} lo={minTrust} hi={maxTrust}
            onLo={setMinTrust} onHi={setMaxTrust} />
          {/* Oyun zamanı */}
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Play time</span>
              <span className="font-mono text-slate-500">0s – {maxPlaytimeH >= 24 ? "24s+" : `${maxPlaytimeH}s`}</span>
            </div>
            <input type="range" min={1} max={24} value={maxPlaytimeH} onChange={(e) => setMaxPlaytimeH(Number(e.target.value))} className="ac-range w-full" />
          </div>

          <div className="mt-3 flex gap-1.5">
            <button onClick={() => setRecentOnly((v) => !v)}
              className={cn("flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition",
                recentOnly ? "border-brand-500/40 bg-brand-500/10 text-white" : "border-white/10 text-slate-400 hover:bg-white/5")}>
              Joined recently
            </button>
            <button onClick={() => setNewOnly((v) => !v)}
              className={cn("flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition",
                newOnly ? "border-brand-500/40 bg-brand-500/10 text-white" : "border-white/10 text-slate-400 hover:bg-white/5")}>
              New players
            </button>
          </div>
        </div>

        {sel && <PlayerDetail serverId={serverId} p={sel} />}

        <div className="max-h-[300px] overflow-y-auto rounded-2xl border border-white/5 bg-base-850/60 p-2">
          {shown.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No matching players</p>
          ) : (
            shown.map((p) => (
              <button key={p.id} onClick={() => setSelected(p.id)}
                className={cn("flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5",
                  selected === p.id && "bg-brand-500/10 ring-1 ring-inset ring-brand-500/30")}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: threatColor(p.trustScore) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-slate-200">{p.name}</span>
                  <span className="block text-[11px] text-slate-500">
                    {p.activity ? ACTIVITY_LABEL[p.activity] ?? p.activity : `${Math.round(p.playtimeSec / 3600)}s oynama`}
                  </span>
                </span>
                {p.health != null && <span className="shrink-0 text-[11px] text-rose-300">{Math.max(0, p.health - 100)}hp</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function RangeRow({ label, min, max, lo, hi, onLo, onHi }: {
  label: string; min: number; max: number; lo: number; hi: number; onLo: (n: number) => void; onHi: (n: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-slate-400">{label}</span>
        <span className="font-mono text-slate-500">{lo} – {hi}</span>
      </div>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} value={lo} onChange={(e) => onLo(Math.min(Number(e.target.value), hi))} className="ac-range w-full" />
        <input type="range" min={min} max={max} value={hi} onChange={(e) => onHi(Math.max(Number(e.target.value), lo))} className="ac-range w-full" />
      </div>
    </div>
  );
}

function PlayerDetail({ serverId, p }: { serverId: string; p: MapPlayer }) {
  const [ssUrl, setSsUrl] = useState<string | null>(null);
  const [ssStatus, setSsStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const hp = p.health != null ? Math.max(0, Math.min(100, p.health - 100)) : null;

  async function requestScreenshot() {
    setBusy(true); setSsStatus("Request sent…"); setSsUrl(null);
    try {
      await fetch(`/api/servers/${serverId}/screenshot`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playerId: p.id }),
      });
      for (let i = 0; i < 18; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await fetch(`/api/servers/${serverId}/screenshot?playerId=${p.id}`);
        const json = await res.json();
        if (json.ok && json.data.status === "DONE" && json.data.url) { setSsUrl(safeMediaUrl(json.data.url) ?? null); setSsStatus(""); return; }
        if (json.ok && json.data.status === "FAILED") { setSsStatus("Failed — is screencapture (or screenshot-basic) running?"); return; }
      }
      setSsStatus("Timed out");
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-base-850/80 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold text-white">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: threatColor(p.trustScore) }} /> {p.name}
        </span>
        <span className="text-xs text-slate-500">threat {100 - p.trustScore}</span>
      </div>
      <div className="mb-3 space-y-2">
        <Bar label="Health" value={hp} color="#f43f5e" icon="activity" />
        <Bar label="Armour" value={p.armor} color="#3b82f6" icon="shield" />
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-xs">
        <Info label="Activity" value={p.activity ? ACTIVITY_LABEL[p.activity] ?? p.activity : "—"} />
        <Info label="Ping" value={p.ping != null ? `${p.ping} ms` : "—"} />
        <Info label="Position" value={p.posX != null ? `${Math.round(p.posX)}, ${Math.round(p.posY!)}` : "—"} />
        <Info label="Play time" value={`${Math.round(p.playtimeSec / 3600)}h`} />
      </div>
      <div className="overflow-hidden rounded-xl border border-white/10 bg-base-950">
        {ssUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ssUrl} alt="Player screen" className="aspect-video w-full object-cover" />
        ) : (
          <div className="grid aspect-video place-items-center text-center text-xs text-slate-500">{ssStatus || "Request a screenshot"}</div>
        )}
      </div>
      <button className="btn-secondary mt-2 w-full" onClick={requestScreenshot} disabled={busy}>
        <Icons.eye size={15} /> {busy ? "Fetching…" : "Request live view"}
      </button>
    </div>
  );
}

function Bar({ label, value, color, icon }: { label: string; value: number | null; color: string; icon: "activity" | "shield" }) {
  const Icon = Icons[icon];
  const v = value ?? 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="flex items-center gap-1 text-slate-400"><Icon size={11} /> {label}</span>
        <span className="text-slate-300">{value != null ? v : "—"}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, v)}%`, background: color }} />
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/5 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate font-mono text-slate-300">{value}</div>
    </div>
  );
}
