"use client";

import { useMemo, useState } from "react";
import { Card, Badge } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

interface ServerLite {
  id: string;
  name: string;
  status: string;
  hasToken: boolean;
}

export function DownloadCenter({ appUrl, servers }: { appUrl: string; servers: ServerLite[] }) {
  const [activeId, setActiveId] = useState(servers[0]?.id ?? "");
  const active = useMemo(() => servers.find((s) => s.id === activeId) ?? servers[0], [servers, activeId]);

  const [token, setToken] = useState<string | null>(null);
  const [regen, setRegen] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [stealth, setStealth] = useState(true);

  const apiUrl = `${appUrl}/api/v1`;

  async function revealToken() {
    if (token && !confirm("Generate a NEW token? The old one stops working (and any server already using it goes offline until you update it).")) {
      return;
    }
    if (!token && active.hasToken && !confirm("The current token is hidden for safety. Generating a new one replaces it — any server already using the old token must be updated. Continue?")) {
      return;
    }
    setRegen(true);
    try {
      const res = await fetch(`/api/servers/${active.id}/token`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.ok) setToken(json.data.apiToken);
    } finally {
      setRegen(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Sunucu seçici */}
      {servers.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setActiveId(s.id);
                setToken(null);
              }}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition",
                s.id === active.id
                  ? "border-brand-500/50 bg-brand-500/10 text-white"
                  : "border-white/10 text-slate-400 hover:bg-white/5"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", s.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-600")} />
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Sol: kurulum adımları */}
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-white shadow-glow">
                  <Icons.download size={22} />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-white">One-click installer</h3>
                  <p className="text-xs text-slate-500">for {active.name}</p>
                </div>
              </div>
              <Badge tone="blue">Windows</Badge>
            </div>

            <p className="mt-4 text-sm text-slate-400">
              Download the installer, drop it in your server folder (next to <code className="text-slate-300">server.cfg</code>),
              and double-click it. It checks your licence, downloads the protected resource, and writes your{" "}
              <code className="text-slate-300">server.cfg</code> for you.
            </p>

            <ol className="mt-5 space-y-4">
              <Step n={1} title="Reveal your server token">
                Click <span className="text-slate-300">Reveal token</span> on the right and copy it. The installer asks for
                it once — that&apos;s how it proves the licence is yours.
              </Step>
              <Step n={2} title="Download the installer">
                <label className="mb-3 mt-1 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-base-900/50 px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={stealth}
                    onChange={(e) => setStealth(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-white/20 bg-base-900"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-200">Stealth folder name (recommended)</span>
                    <span className="block text-xs text-slate-500">
                      Installs under a random name like <code className="text-slate-400">qx_7k2m9d4a</code> instead of{" "}
                      <code className="text-slate-400">coreac</code>, so cheat menus can&apos;t find and stop the anti-cheat by name.
                      Re-running the installer later keeps the same folder.
                    </span>
                  </span>
                </label>
                <a
                  href={`/api/servers/${active.id}/installer${stealth ? "" : "?stealth=0"}`}
                  className="btn-primary inline-flex"
                  download
                >
                  <Icons.download size={16} /> Download installer (.bat)
                </a>
                <p className="mt-2 text-xs text-slate-500">
                  Personalised for <span className="text-slate-400">{active.name}</span>. No token is stored inside the file.
                </p>
              </Step>
              <Step n={3} title="Run it in your server folder">
                Move the file next to your <code className="text-slate-300">server.cfg</code> and double-click. Paste the
                token when asked. When it finishes, restart your server — it shows{" "}
                <span className="text-emerald-300">ONLINE</span> here.
              </Step>
            </ol>

            <div className="mt-5 rounded-xl border border-white/10 bg-base-900/50 px-4 py-3 text-xs text-slate-400">
              <Icons.shieldCheck size={14} className="mr-1.5 inline text-brand-400" />
              Windows may warn about an unknown script — it&apos;s your own installer from your own panel. Choose{" "}
              <span className="text-slate-300">More info → Run anyway</span> if SmartScreen prompts.
            </div>
          </Card>

          {/* Manuel kurulum (alternatif) */}
          <Card>
            <button
              onClick={() => setShowManual((v) => !v)}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                <Icons.cube size={16} className="text-slate-400" /> Prefer to install manually?
              </span>
              <Icons.chevronDown size={16} className={cn("text-slate-400 transition", showManual && "rotate-180")} />
            </button>
            {showManual && (
              <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                <a href={`/api/servers/${active.id}/resource-zip`} className="btn-secondary inline-flex" download>
                  <Icons.download size={15} /> Download resource (.zip)
                </a>
                <ol className="space-y-2 text-sm text-slate-400">
                  <li>1. Extract into <code className="text-slate-300">resources/</code> (creates the <code className="text-slate-300">coreac</code> folder — you may rename it).</li>
                  <li>2. Add these lines to <code className="text-slate-300">server.cfg</code>, <b className="text-slate-300">above</b> your other <code className="text-slate-300">ensure</code> lines:</li>
                </ol>
                <pre className="overflow-x-auto rounded-xl border border-white/10 bg-base-950 p-3 font-mono text-xs text-slate-300">
{`set coreac_api "${apiUrl}"
set coreac_token "<your token>"
add_ace resource.coreac command allow
ensure coreac`}
                </pre>
                <p className="text-xs text-slate-500">
                  3. Restart the server. If you renamed the folder, use the new name in the last two lines.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Sağ: bağlantı bilgileri */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
              <Icons.key size={16} className="text-brand-400" /> Server token
            </h3>
            <p className="mb-4 text-xs text-slate-500">
              A secret that ties this server to your licence. Treat it like a password.
            </p>

            {token ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 font-mono text-sm text-emerald-200">
                    {token}
                  </code>
                  <CopyButton value={token} label="" className="h-9 w-9 justify-center px-0" />
                </div>
                <p className="text-xs text-amber-300">Shown once — copy it now and paste it into the installer.</p>
              </div>
            ) : (
              <button onClick={revealToken} disabled={regen} className="btn-secondary w-full justify-center">
                <Icons.key size={15} />
                {regen ? "…" : active.hasToken ? "Reveal (new) token" : "Generate token"}
              </button>
            )}
          </Card>

          <Card>
            <h3 className="mb-1 text-sm font-semibold text-white">API URL</h3>
            <p className="mb-3 text-xs text-slate-500">The installer uses this automatically.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-white/10 bg-base-900/80 px-3 py-2 font-mono text-xs text-slate-200">
                {apiUrl}
              </code>
              <CopyButton value={apiUrl} label="" className="h-9 w-9 justify-center px-0" />
            </div>
          </Card>

          <Card>
            <h3 className="mb-3 text-sm font-semibold text-white">What the installer does</h3>
            <ul className="space-y-2.5 text-sm text-slate-400">
              {[
                ["shieldCheck", "Verifies your licence with the panel"],
                ["cube", "Downloads & installs the protected resource"],
                ["config", "Writes server.cfg above your other resources (with a backup)"],
                ["key", "Grants the resource command access for the web console"],
                ["history", "Updates in place and removes an old Aeigs-era install"],
                ["check", "Leaves nothing running until you restart"],
              ].map(([icon, text]) => {
                const Icon = Icons[icon as keyof typeof Icons];
                return (
                  <li key={text} className="flex items-start gap-2.5">
                    <Icon size={16} className="mt-0.5 shrink-0 text-brand-400" />
                    <span>{text}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/5 text-xs font-semibold text-brand-300 ring-1 ring-inset ring-white/10">
        {n}
      </span>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-200">{title}</p>
        <div className="mt-1 text-sm text-slate-400">{children}</div>
      </div>
    </li>
  );
}
