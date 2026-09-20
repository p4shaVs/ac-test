"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { cn, safeMediaUrl } from "@/lib/utils";

export interface MonPlayer {
  id: string;
  name: string;
  trustScore: number;
  health: number | null;
  armor: number | null;
  activity: string | null;
}

// Bir oyuncudan izin istemeden tek kare alır (panel → resource → screenshot-basic).
// Başarılıysa görüntü URL'ini döndürür, değilse null.
async function captureOnce(serverId: string, playerId: string): Promise<string | null> {
  await fetch(`/api/servers/${serverId}/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId }),
  });
  // Sonuç birkaç saniye içinde gelir (yakala + yükle + panele dön).
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 700));
    const res = await fetch(`/api/servers/${serverId}/screenshot?playerId=${playerId}`);
    const json = await res.json();
    if (json.ok && json.data.status === "DONE" && json.data.url) {
      // Reported by the player's client — reject anything that isn't http(s)
      // or a same-origin path before it reaches an <img src>.
      const safe = safeMediaUrl(json.data.url);
      if (!safe) return null;
      return safe + (safe.includes("?") ? "&" : "?") + "t=" + Date.now();
    }
    if (json.ok && json.data.status === "FAILED") return null;
  }
  return null;
}

export function MonitoringGrid({ serverId, players }: { serverId: string; players: MonPlayer[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(players[0]?.id ?? null);
  const [query, setQuery] = useState("");

  const selected = players.find((p) => p.id === selectedId) ?? null;
  const filtered = players.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-3 lg:h-[calc(100vh-11rem)] lg:flex-row">
      {/* Ana canlı görüntü — seçili oyuncu, sürekli otomatik yenilenir */}
      <div className="min-w-0 flex-1">
        {selected ? (
          <LiveViewer key={selected.id} serverId={serverId} player={selected} />
        ) : (
          <div className="grid h-full min-h-[320px] place-items-center rounded-xl border border-white/5 bg-base-850/60 text-slate-500">
            <span className="flex flex-col items-center gap-2">
              <Icons.eye size={28} />
              <span className="text-sm">Pick a player on the right</span>
            </span>
          </div>
        )}
      </div>

      {/* Sağ panel — oyuncu seçme listesi */}
      <aside className="flex w-full flex-col rounded-xl border border-white/5 bg-base-850/60 lg:w-72">
        <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2.5">
          <Icons.users size={16} className="text-slate-400" />
          <span className="text-sm font-medium text-slate-200">Players</span>
          <span className="ml-auto rounded-md bg-white/5 px-1.5 py-0.5 text-[11px] text-slate-400">
            {players.length}
          </span>
        </div>
        <div className="border-b border-white/5 p-2">
          <div className="flex items-center gap-2 rounded-lg bg-base-950/60 px-2.5 py-1.5">
            <Icons.search size={14} className="text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name…"
              className="w-full bg-transparent text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-6 text-center text-xs text-slate-600">Player not found</p>
          ) : (
            filtered.map((p) => {
              const tone = p.trustScore >= 70 ? "green" : p.trustScore >= 40 ? "amber" : "red";
              const active = p.id === selectedId;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition",
                    active ? "bg-brand-500/15 ring-1 ring-brand-500/40" : "hover:bg-white/5"
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      active ? "animate-pulse bg-emerald-400" : "bg-slate-600"
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-200">{p.name}</span>
                  <Badge tone={tone as "green" | "amber" | "red"}>{100 - p.trustScore}</Badge>
                </button>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}

// Seçili oyuncunun canlı görüntüsü — deşarj olana kadar sürekli yeni kare çeker.
function LiveViewer({ serverId, player }: { serverId: string; player: MonPlayer }) {
  const [url, setUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const runRef = useRef(true);

  const loop = useCallback(async () => {
    runRef.current = true;
    while (runRef.current) {
      const shot = await captureOnce(serverId, player.id);
      if (!runRef.current) break;
      if (shot) {
        setUrl(shot);
        setStatus("live");
      } else {
        setStatus((s) => (s === "live" ? "live" : "error"));
      }
      // Kare arası kısa nefes — screenshot-basic yakalama süresiyle sınırlı.
      await new Promise((r) => setTimeout(r, 300));
    }
  }, [serverId, player.id]);

  useEffect(() => {
    loop();
    return () => {
      runRef.current = false;
    };
  }, [loop]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-white/5 bg-base-850/60">
      <div className="relative flex-1 bg-gradient-to-br from-slate-800/40 to-base-950">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={player.name} className="h-full w-full object-contain" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-slate-500">
            <span className="flex flex-col items-center gap-2 text-sm">
              {status === "error" ? (
                <>
                  <Icons.x size={26} className="text-rose-400" />
                  <span className="text-rose-300">Could not capture the screen</span>
                  <span className="max-w-xs text-center text-[11px] text-slate-500">
                    screencapture (or screenshot-basic) must be running, and the panel URL must be reachable from players.
                  </span>
                </>
              ) : (
                <>
                  <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-600 border-t-brand-400" />
                  <span>Connecting…</span>
                </>
              )}
            </span>
          </div>
        )}

        {/* Canlı rozeti */}
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[11px] font-medium text-emerald-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          LIVE
        </span>

        {/* İsim + aktivite */}
        <span className="absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] text-slate-200">
          {player.name}
          {player.activity ? <span className="text-slate-400"> · {player.activity}</span> : null}
        </span>

        {/* Can / kalkan barları */}
        {player.health != null && (
          <div className="absolute inset-x-3 bottom-3 flex gap-2">
            <div className="flex-1">
              <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                <span>Can</span>
                <span>{Math.max(0, player.health - 100)}</span>
              </div>
              <span className="block h-1.5 overflow-hidden rounded-full bg-black/50">
                <span
                  className="block h-full rounded-full bg-rose-400"
                  style={{ width: `${Math.min(100, Math.max(0, player.health - 100))}%` }}
                />
              </span>
            </div>
            {player.armor != null && (
              <div className="flex-1">
                <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                  <span>Armour</span>
                  <span>{player.armor}</span>
                </div>
                <span className="block h-1.5 overflow-hidden rounded-full bg-black/50">
                  <span
                    className="block h-full rounded-full bg-brand-400"
                    style={{ width: `${Math.min(100, player.armor)}%` }}
                  />
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
