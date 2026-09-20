"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { Icons } from "@/components/icons";

interface Created {
  serverId: string;
  apiToken: string;
}

export function NewServerFlow({ appUrl }: { appUrl: string }) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("30120");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);

  const base = appUrl || (typeof window !== "undefined" ? window.location.origin : "");
  const apiUrl = `${base}/api/v1`;

  async function activate() {
    setError(null);
    if (name.trim().length < 2) return setError("Enter a server name.");
    setLoading(true);
    try {
      const res = await fetch("/api/servers/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: key.trim(),
          name: name.trim(),
          ip: ip.trim() || undefined,
          port: Number(port) || 30120,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not be created");
      setCreated({ serverId: json.data.serverId, apiToken: json.data.apiToken });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  // ---- Kurulum ekranı (oluşturulduktan sonra) — Core Shield kendi tarzı ----
  if (created) {
    const cfg =
      `## ─── Core Shield Anti-Cheat ───\n` +
      `set aeigs_api "${apiUrl}"\n` +
      `set aeigs_token "${created.apiToken}"\n` +
      `add_ace resource.aeigs-anticheat command allow\n` +
      // No screenshot resource in this block on purpose. Pasting it into a cfg
      // that already ensures one created a second ensure: two concurrent yarn
      // builds deadlock and the server never finishes starting.
      `ensure aeigs-anticheat`;
    return (
      <div className="mx-auto grid max-w-4xl gap-4 lg:grid-cols-[1fr_300px]">
        {/* Sol: tek birleşik cfg bloğu (terminal görünümü) */}
        <div className="overflow-hidden rounded-2xl border border-brand-500/25 bg-base-900/80">
          <div className="flex items-center justify-between border-b border-white/5 bg-base-850/70 px-4 py-2.5">
            <span className="flex items-center gap-2 font-mono text-xs text-slate-400">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
              <span className="ml-2">server.cfg</span>
            </span>
            <CopyButton value={cfg} label="Copy all" className="h-7 text-xs" />
          </div>
          <pre className="overflow-x-auto whitespace-pre px-4 py-4 font-mono text-[13px] leading-relaxed text-slate-200">{cfg}</pre>
          <div className="border-t border-white/5 bg-amber-500/5 px-4 py-2.5 text-xs text-amber-200/80">
            The token is shown only once — copy it somewhere safe.
          </div>
        </div>

        {/* Sağ: kısa açıklama şeridi (numaralı kart değil) */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-emerald-300">
              <Icons.check size={16} /> Ready
            </p>
            <p className="mt-1 text-slate-400">Your server is ready. Copy the block on the left into <code className="text-slate-300">server.cfg</code>.</p>
          </div>
          <ul className="space-y-2.5 rounded-2xl border border-white/5 bg-base-850/60 p-4 text-xs text-slate-400">
            <li className="flex gap-2"><span className="text-brand-300">›</span> <span><b className="text-slate-200">Resource:</b> <code>aeigs-anticheat</code> folder into <code>resources/</code>.</span></li>
            <li className="flex gap-2"><span className="text-brand-300">›</span> <span><b className="text-slate-200">Monitoring:</b> screenshots need <code>screencapture</code> (or <code>screenshot-basic</code>) — ensure it <b className="text-slate-200">once</b>, never twice.</span></li>
            <li className="flex gap-2"><span className="text-brand-300">›</span> <span><b className="text-slate-200">ensure order:</b> these lines must come before your other <code>ensure</code>must come before your other resources.</span></li>
            <li className="flex gap-2"><span className="text-brand-300">›</span> <span><b className="text-slate-200">add_ace:</b> required for console, kick and resource commands.</span></li>
          </ul>
          <div className="flex flex-col gap-2">
            <button className="btn-primary" onClick={() => router.push(`/dashboard/servers/${created.serverId}`)}>
              Open panel <Icons.arrowRight size={16} />
            </button>
            <button className="btn-secondary" onClick={() => router.push("/dashboard/servers")}>My Servers</button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Oluşturma formu (FeloxAC tarzı) ----
  return (
    <Card className="mx-auto max-w-2xl">
      <h3 className="text-lg font-semibold text-white">Create a new server</h3>
      <p className="mt-1 text-sm text-slate-400">Use this form for first-time setup after purchase.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className="label">Licence key</label>
          <input
            className="input font-mono tracking-wide"
            placeholder="AEIGS-XXXX-XXXX-XXXX-XXXX"
            value={key}
            onChange={(e) => setKey(e.target.value.toUpperCase())}
          />
          <p className="mt-1 text-xs text-slate-500">Paste the licence or redeem key you received after purchase.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <div>
            <label className="label">Public server IP <span className="text-slate-600">(optional)</span></label>
            <input className="input" placeholder="185.137.98.19" value={ip} onChange={(e) => setIp(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500">The public IP players connect to (display only).</p>
          </div>
          <div>
            <label className="label">Port</label>
            <input className="input" value={port} onChange={(e) => setPort(e.target.value.replace(/[^0-9]/g, ""))} />
            <p className="mt-1 text-xs text-slate-500">Usually 30120.</p>
          </div>
        </div>

        <div>
          <label className="label">Server name</label>
          <input className="input" placeholder="My Server" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="mt-1 text-xs text-slate-500">The name shown in the panel.</p>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button className="btn-primary w-full" onClick={activate} disabled={loading}>
          {loading ? "Creating…" : "Activate & create server"}
        </button>
        <p className="text-center text-xs text-slate-600">No key? You can redeem a gift code from the My Licences page.</p>
      </div>
    </Card>
  );
}

