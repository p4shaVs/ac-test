"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icons } from "@/components/icons";
import { safeMediaUrl } from "@/lib/utils";

interface ReplayFrame {
  t: number;
  x: number; y: number; z: number;
  speed: number; vz: number;
  hp: number; armor: number;
  coll: boolean; inVeh: boolean;
}

interface ShotData {
  id: string;
  url: string | null;
  seq: number;
  completedAt: string | null;
}

interface ReplayData {
  id: string;
  type: string;
  severity: string;
  playerName: string;
  action: string | null;
  createdAt: string;
  details: Record<string, unknown>;
  replay: ReplayFrame[];
  screenshots: ShotData[];
}

// Ban anının son ~8 sn'sini oynatan izleyici: konum yolu (2D) + zaman
// çizelgesi + o anki durum okuması (hız/can/kalkan/çarpışma). "Neden
// banlandık"ı web'den görebilmek için.
export function ReplayViewer({
  serverId,
  detectionId,
  onClose,
}: {
  serverId: string;
  detectionId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/servers/${serverId}/detections/${detectionId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setData(json?.data ?? null);
        setIdx(0);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [serverId, detectionId]);

  const frames = data?.replay ?? [];

  // Oynatma
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    if (idx >= frames.length - 1) { setPlaying(false); return; }
    const timer = setTimeout(() => setIdx((i) => Math.min(i + 1, frames.length - 1)), 180);
    return () => clearTimeout(timer);
  }, [playing, idx, frames.length]);

  const bounds = useMemo(() => {
    if (frames.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const f of frames) {
      minX = Math.min(minX, f.x); maxX = Math.max(maxX, f.x);
      minY = Math.min(minY, f.y); maxY = Math.max(maxY, f.y);
    }
    const pad = 4;
    return { minX: minX - pad, maxX: maxX + pad, minY: minY - pad, maxY: maxY + pad };
  }, [frames]);

  // Yol çizimi
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bounds || frames.length === 0) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const W = canvas.width, H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.fillStyle = "rgba(255,255,255,0.03)";
    ctx2d.fillRect(0, 0, W, H);

    const spanX = Math.max(bounds.maxX - bounds.minX, 1);
    const spanY = Math.max(bounds.maxY - bounds.minY, 1);
    const toPx = (x: number, y: number) => [
      ((x - bounds.minX) / spanX) * (W - 20) + 10,
      H - (((y - bounds.minY) / spanY) * (H - 20) + 10),
    ];

    // yol
    ctx2d.strokeStyle = "rgba(139,92,246,0.5)";
    ctx2d.lineWidth = 2;
    ctx2d.beginPath();
    frames.forEach((f, i) => {
      const [px, py] = toPx(f.x, f.y);
      if (i === 0) ctx2d.moveTo(px, py); else ctx2d.lineTo(px, py);
    });
    ctx2d.stroke();

    // şu anki nokta
    const cur = frames[idx];
    if (cur) {
      const [px, py] = toPx(cur.x, cur.y);
      ctx2d.fillStyle = cur.coll ? "#f59e0b" : "#22c55e";
      ctx2d.beginPath();
      ctx2d.arc(px, py, 5, 0, Math.PI * 2);
      ctx2d.fill();
    }
    // ban anı (son kare) — kırmızı X
    const last = frames[frames.length - 1];
    if (last) {
      const [px, py] = toPx(last.x, last.y);
      ctx2d.strokeStyle = "#ef4444";
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      ctx2d.moveTo(px - 5, py - 5); ctx2d.lineTo(px + 5, py + 5);
      ctx2d.moveTo(px + 5, py - 5); ctx2d.lineTo(px - 5, py + 5);
      ctx2d.stroke();
    }
  }, [frames, bounds, idx]);

  const cur = frames[idx];
  const shots = data?.screenshots ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-base-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white">Ban Replay</h3>
            <p className="text-xs text-slate-500">
              {data ? `${data.type} · ${data.playerName}` : "Loading…"}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white">
            <Icons.x size={16} />
          </button>
        </div>

        {!loading && shots.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-slate-400">
              Ban evidence — real frames captured from the player's screen
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {shots.map((s) => {
                // The URL was reported by the banned player's own client —
                // never render it unchecked (javascript: hrefs execute).
                const safe = safeMediaUrl(s.url);
                return (
                  <a
                    key={s.id}
                    href={safe}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block aspect-video overflow-hidden rounded-lg border border-white/10 bg-base-950 hover:border-brand-500/50"
                  >
                    {safe && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={safe} alt={`Frame ${s.seq + 1}`} className="h-full w-full object-cover" />
                    )}
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading…</div>
        ) : frames.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500">
            {shots.length === 0
              ? "No replay or screenshot evidence for this detection (older record, or not a critical detection)."
              : "No position replay for this one, but the screenshots above are the evidence."}
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} width={480} height={280} className="w-full rounded-xl border border-white/5" />

            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={() => setPlaying((p) => !p)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/15 text-brand-300 ring-1 ring-inset ring-brand-500/30 hover:bg-brand-500/25"
              >
                {playing ? <Icons.pause size={14} /> : <Icons.play size={14} />}
              </button>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={idx}
                onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }}
                className="h-1.5 flex-1 accent-brand-500"
              />
              <span className="w-16 text-right font-mono text-xs text-slate-500">
                {idx + 1}/{frames.length}
              </span>
            </div>

            {cur && (
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs sm:grid-cols-6">
                <Stat label="Speed" value={`${cur.speed.toFixed(1)} m/s`} />
                <Stat label="Vertical speed" value={cur.vz.toFixed(2)} />
                <Stat label="Health" value={String(cur.hp)} />
                <Stat label="Armour" value={String(cur.armor)} />
                <Stat label="Collision" value={cur.coll ? "KAPALI" : "on"} warn={cur.coll} />
                <Stat label="Vehicle" value={cur.inVeh ? "in" : "—"} />
              </div>
            )}
            <p className="mt-3 text-[11px] text-slate-600">
              Red X = moment of the ban · green/orange dot = selected frame (orange: collision was off)
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-base-850/60 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-0.5 font-mono text-[13px] font-semibold ${warn ? "text-amber-300" : "text-slate-200"}`}>
        {value}
      </div>
    </div>
  );
}
