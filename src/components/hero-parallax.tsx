"use client";

import { useEffect, useRef } from "react";
import { Icons } from "./icons";

/**
 * electron-services tarzı hero görseli:
 * - Eğik (3B perspektif) dashboard önizlemesi
 * - Etrafında yüzen ürün özelliği rozetleri (uydurma kullanım rakamı YOK)
 * - Mouse hareketine göre eğilir, katmanlar parallax yapar
 */
export function HeroParallax() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const raf = useRef<number>();

  useEffect(() => {
    const wrapEl = wrapRef.current;
    const sceneEl = sceneRef.current;
    if (!wrapEl || !sceneEl) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let tx = 0, ty = 0, cx = 0, cy = 0;
    const schedule = () => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(apply);
    };
    const apply = () => {
      raf.current = undefined;
      cx += (tx - cx) * 0.1;
      cy += (ty - cy) * 0.1;
      // temel eğim + mouse etkisi
      const ry = -12 + cx * 12;
      const rx = 8 - cy * 10;
      sceneEl.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      sceneEl.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      sceneEl.style.setProperty("--px", `${(cx * 30).toFixed(1)}px`);
      sceneEl.style.setProperty("--py", `${(cy * 30).toFixed(1)}px`);
      if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001) schedule();
    };
    const onMove = (e: MouseEvent) => {
      const r = wrapEl.getBoundingClientRect();
      tx = (e.clientX - r.left) / r.width - 0.5;
      ty = (e.clientY - r.top) / r.height - 0.5;
      schedule();
    };
    const onLeave = () => { tx = 0; ty = 0; schedule(); };

    window.addEventListener("mousemove", onMove);
    wrapEl.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      wrapEl.removeEventListener("mouseleave", onLeave);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative min-h-[420px] [perspective:1600px]">
      <div
        ref={sceneRef}
        className="relative [transform-style:preserve-3d] will-change-transform"
        style={{
          transform:
            "rotateX(var(--rx,8deg)) rotateY(var(--ry,-12deg)) rotateZ(1deg)",
        }}
      >
        {/* Dashboard panosu */}
        <div
          className="overflow-hidden rounded-2xl border border-white/10 bg-base-850/90 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] backdrop-blur-xl"
          style={{ transform: "translate(var(--px,0), var(--py,0))" }}
        >
          {/* üst bar */}
          <div className="flex items-center justify-between border-b border-white/5 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-brand-gradient text-white">
                <Icons.shieldCheck size={13} />
              </span>
              <span className="text-xs font-semibold text-white">Demo Server</span>
              <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300">Online</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[9px] text-white">Web Panel</span>
              <span className="rounded-md px-2 py-0.5 text-[9px] text-slate-500">In-Game</span>
            </div>
          </div>
          <div className="flex">
            {/* sidebar */}
            <div className="hidden w-32 shrink-0 space-y-1 border-r border-white/5 p-2 sm:block">
              {([
                ["dashboard", "Dashboard", true],
                ["users", "Players", false],
                ["map", "Map", false],
                ["search", "Lookup", false],
                ["ban", "Bans", false],
                ["terminal", "Console", false],
              ] as [string, string, boolean][]).map(([ic, l, active]) => {
                const Icon = (Icons as any)[ic];
                return (
                  <div
                    key={l}
                    className={
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[10px] " +
                      (active ? "bg-brand-500/15 text-white" : "text-slate-500")
                    }
                  >
                    <Icon size={12} /> {l}
                  </div>
                );
              })}
            </div>
            {/* main */}
            <div className="flex-1 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-white">Server Analytics</span>
                <span className="text-[9px] text-slate-500">9/100 online</span>
              </div>
              {/* büyük grafik */}
              <div className="h-28 rounded-lg border border-white/5 bg-base-900/60 p-2">
                <svg viewBox="0 0 300 90" className="h-full w-full" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#6366f1" stopOpacity="0.5" />
                      <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0,70 C40,66 60,20 100,18 C140,16 150,55 190,58 C230,61 250,35 300,30 L300,90 L0,90 Z" fill="url(#hg)" />
                  <path d="M0,70 C40,66 60,20 100,18 C140,16 150,55 190,58 C230,61 250,35 300,30" fill="none" stroke="#818cf8" strokeWidth="1.5" />
                </svg>
              </div>
              {/* 3 mini grafik */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[["WARNS", "30", "#f59e0b"], ["KICKS", "32", "#f97316"], ["BANS", "29", "#f43f5e"]].map(([l, v, c]) => (
                  <div key={l} className="rounded-lg border border-white/5 bg-base-900/60 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] text-slate-500">{l}</span>
                      <span className="text-[11px] font-bold text-white">{v}</span>
                    </div>
                    <div className="mt-1 flex h-6 items-end gap-0.5">
                      {[4, 8, 5, 10, 6, 9, 3].map((h, i) => (
                        <div key={i} className="flex-1 rounded-sm" style={{ height: `${h * 8}%`, background: c as string }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* actions */}
            <div className="hidden w-32 shrink-0 space-y-1.5 border-l border-white/5 p-2 lg:block">
              {["Delete vehicles", "Delete peds", "Delete objects", "Send announcement"].map((a) => (
                <div key={a} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[9px] text-slate-300">
                  {a}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Floating badges describe what the product does, not invented usage
            numbers. The previous "9,462 servers / 443,808 bans / 3,193,105
            protected players" counters were fabricated and have been removed. */}
        <Badge className="-left-6 -top-6" value="Server-side" label="Godmode check" delay="0s" tz={90} />
        <Badge className="-right-5 top-1/3" value="Ban ID" label="On every ban" delay="1.2s" tz={110} />
        <Badge className="-bottom-6 left-1/4" value="Log-only" label="Safe rollout" delay="0.6s" tz={120} />
      </div>
    </div>
  );
}

function Badge({
  className,
  value,
  label,
  delay,
  tz,
}: {
  className: string;
  value: string;
  label: string;
  delay: string;
  tz: number;
}) {
  return (
    <div
      className={
        "absolute animate-float rounded-2xl border border-white/10 bg-base-850/95 px-4 py-2.5 shadow-card backdrop-blur " +
        className
      }
      style={{ animationDelay: delay, transform: `translateZ(${tz}px)` }}
    >
      <div className="text-base font-extrabold text-white">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}
