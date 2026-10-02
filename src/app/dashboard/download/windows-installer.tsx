"use client";

import { useState } from "react";
import { Icons } from "@/components/icons";
import { CopyButton } from "@/components/copy-button";
import { cn } from "@/lib/utils";

export interface LicenceRow {
  serverName: string;
  key: string;
  status: string;
}

function mask(key: string) {
  const parts = key.split("-");
  return parts.map((p, i) => (i === 0 || i === parts.length - 1 ? p : "•".repeat(p.length))).join("-");
}

// The recommended way in: one exe, the licence key, done.
export function WindowsInstaller({ licences, ready }: { licences: LicenceRow[]; ready: boolean }) {
  const [shown, setShown] = useState<string | null>(null);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0e0e10]">
      <div className="grid gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <div className="p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
              <Icons.download size={20} className="text-white" />
            </span>
            <div>
              <p className="flex items-center gap-2 text-[15px] font-semibold text-white">
                CoreAC Setup <span className="rounded-full border border-white/15 px-2 text-[10.5px] font-medium text-slate-300">Recommended</span>
              </p>
              <p className="text-[12px] text-slate-500">Windows 10 / 11 / Server 2016+ · about 110 KB · nothing else to install</p>
            </div>
          </div>

          <ol className="mt-6 space-y-4">
            {[
              ["Download and open it", "On the PC that runs your FiveM server."],
              ["Paste your licence key", "It checks the key with this panel and fetches the protected resource and your server token from here."],
              ["Pick the server folder", "Found automatically (next to the installer, in txAdmin, on your drives) — or browse to the folder with server.cfg."],
              ["Restart the server", "CoreAC is written above your other resources and shows ONLINE here within a minute."],
            ].map(([t, d], i) => (
              <li key={t} className="flex gap-3.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 text-[11px] font-semibold text-slate-300">{i + 1}</span>
                <span>
                  <span className="block text-[13.5px] font-medium text-slate-100">{t}</span>
                  <span className="block text-[12.5px] leading-relaxed text-slate-500">{d}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {ready ? (
              <a href="/api/account/installer" className="btn-primary h-11 px-5 text-sm" download>
                <Icons.download size={16} /> Download CoreAC-Setup.exe
              </a>
            ) : (
              <span className="text-[12.5px] text-amber-200">The installer has not been built on this panel yet (npm run build:installer).</span>
            )}
            <span className="text-[11.5px] text-slate-500">Updates in place when you run it again.</span>
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-slate-600">
            Windows SmartScreen may say it does not recognise the app (it is not code-signed yet): choose More info → Run anyway.
          </p>
        </div>

        <div className="border-t border-white/[0.07] bg-white/[0.015] p-6 sm:p-7 lg:border-l lg:border-t-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">Your licence keys</p>
          <p className="mt-1 text-[12.5px] text-slate-500">The installer asks for one of these. Keep them private — a key can install your server.</p>
          {licences.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-[12.5px] text-slate-500">No server has a licence key attached.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {licences.map((l) => {
                const open = shown === l.key;
                const inactive = l.status !== "ACTIVE" && l.status !== "UNUSED";
                return (
                  <li key={l.key + l.serverName} className="rounded-xl border border-white/[0.08] bg-[#0b0b0c] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[12.5px] font-medium text-slate-200">{l.serverName}</span>
                      {inactive && <span className="text-[10.5px] text-rose-300">{l.status.toLowerCase()}</span>}
                    </div>
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <code className={cn("min-w-0 flex-1 truncate font-mono text-[12px]", open ? "text-white" : "text-slate-400")}>{open ? l.key : mask(l.key)}</code>
                      <button
                        type="button"
                        onClick={() => setShown(open ? null : l.key)}
                        className="grid h-7 w-7 place-items-center rounded-lg text-slate-500 transition hover:bg-white/[0.06] hover:text-white"
                        aria-label={open ? "Hide key" : "Show key"}
                      >
                        {open ? <Icons.eyeOff size={13} /> : <Icons.eye size={13} />}
                      </button>
                      <CopyButton value={l.key} label="" className="h-7 w-7 justify-center px-0" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
