"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { Icons } from "@/components/icons";

type NetworkAction = "OFF" | "LOG" | "KICK";

interface Props {
  server: {
    id: string;
    name: string;
    ip: string | null;
    maxSlots: number;
    discordWebhook: string;
    webhookEvents: Record<string, boolean>;
    network: { action: NetworkAction; contribute: boolean };
    hasToken: boolean;
  };
  appUrl: string;
}

const NETWORK_ACTIONS: { key: NetworkAction; label: string; desc: string }[] = [
  { key: "OFF", label: "Off", desc: "Do not check connecting players against the network." },
  { key: "LOG", label: "Log / alert", desc: "Let them in, but flag it in detections + Discord." },
  { key: "KICK", label: "Block entry", desc: "Deny entry to players flagged by the network." },
];

const WEBHOOK_EVENTS: { key: string; label: string }[] = [
  { key: "ban", label: "Ban" },
  { key: "unban", label: "Unban" },
  { key: "kick", label: "Kick" },
  { key: "warn", label: "Warning" },
  { key: "detection", label: "Cheat Detection" },
  { key: "autoban", label: "Auto Ban" },
  { key: "blacklist", label: "Blacklist Violation" },
  { key: "connect", label: "Connection" },
];

export function ServerSettings({ server, appUrl }: Props) {
  const router = useRouter();
  const [name, setName] = useState(server.name);
  const [ip, setIp] = useState(server.ip ?? "");
  const [maxSlots, setMaxSlots] = useState(String(server.maxSlots));
  const [webhook, setWebhook] = useState(server.discordWebhook);
  const [events, setEvents] = useState<Record<string, boolean>>(server.webhookEvents);
  const [netAction, setNetAction] = useState<NetworkAction>(server.network.action);
  const [netContribute, setNetContribute] = useState<boolean>(server.network.contribute);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/servers/${server.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          ip: ip || null,
          maxSlots: Number(maxSlots) || 64,
          discordWebhook: webhook || null,
          webhookEvents: events,
          network: { action: netAction, contribute: netContribute },
        }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    if (!confirm("A new token will be generated and the old one will stop working. Continue?")) return;
    setRegenLoading(true);
    try {
      const res = await fetch(`/api/servers/${server.id}/token`, { method: "POST" });
      const json = await res.json();
      if (res.ok && json.ok) setToken(json.data.apiToken);
    } finally {
      setRegenLoading(false);
    }
  }

  async function remove() {
    if (!confirm(`"${server.name}" and all of its data will be deleted. This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/servers/${server.id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/dashboard/servers");
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Genel ayarlar */}
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-white">General</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label">Server name</label>
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Server IP</label>
              <input className="input" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="123.45.67.89" />
            </div>
            <div>
              <label className="label">Max slots</label>
              <input
                className="input"
                type="number"
                min={1}
                value={maxSlots}
                onChange={(e) => setMaxSlots(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Discord Webhook (optional)</label>
              <input
                className="input"
                value={webhook}
                onChange={(e) => setWebhook(e.target.value)}
                placeholder="https://discord.com/api/webhooks/…"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Bans, kicks and detections are posted to this webhook as embeds.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                {WEBHOOK_EVENTS.map((e) => {
                  const on = events[e.key] ?? false;
                  return (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => setEvents((prev) => ({ ...prev, [e.key]: !on }))}
                      className={
                        "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition " +
                        (on
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                          : "border-white/10 text-slate-500 hover:bg-white/5")
                      }
                    >
                      {e.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                <Icons.check size={16} /> Saved
              </span>
            )}
          </div>
        </Card>

        {/* Bağlantı / kurulum */}
        <Card>
          <h3 className="mb-1 text-sm font-semibold text-white">FiveM connection</h3>
          <p className="mb-4 text-xs text-slate-500">
            Put these values into the anti-cheat's server.cfg / config file.
          </p>
          <div className="space-y-3">
            <div>
              <label className="label">API URL</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded-lg border border-white/10 bg-base-900/80 px-3 py-2 font-mono text-sm text-slate-200">
                  {appUrl || "https://panel.aeigs.gg"}/api/v1
                </code>
                <CopyButton value={`${appUrl || "https://panel.aeigs.gg"}/api/v1`} label="" className="h-9 w-9 justify-center px-0" />
              </div>
            </div>
            <div>
              <label className="label">Server token</label>
              {token ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 truncate rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 font-mono text-sm text-emerald-200">
                      {token}
                    </code>
                    <CopyButton value={token} label="" className="h-9 w-9 justify-center px-0" />
                  </div>
                  <p className="text-xs text-amber-300">
                    This token is shown only once — save it somewhere safe.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border border-white/10 bg-base-900/60 px-3 py-2.5">
                  <span className="text-sm text-slate-500">
                    {server.hasToken ? "The token is hidden for safety. Regenerate it if needed." : "No token yet."}
                  </span>
                  <button onClick={regenerate} disabled={regenLoading} className="btn-secondary text-xs">
                    <Icons.key size={14} />
                    {regenLoading ? "…" : "Regenerate token"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Network reputation (global ban network) */}
        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <Icons.shieldCheck size={16} className="text-brand-400" /> Network reputation
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            When a player is banned across several servers in the network, this server is warned on
            connect. Only anonymised (hashed) identifiers are shared — never IPs. A player is flagged
            only after distinct server owners have banned them.
          </p>

          <label className="label">On a flagged player</label>
          <div className="grid gap-2 sm:grid-cols-3">
            {NETWORK_ACTIONS.map((a) => {
              const on = netAction === a.key;
              return (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => setNetAction(a.key)}
                  className={
                    "rounded-xl border px-3 py-2.5 text-left transition " +
                    (on
                      ? "border-brand-500/50 bg-brand-500/10"
                      : "border-white/10 hover:bg-white/5")
                  }
                >
                  <span className={"block text-sm font-semibold " + (on ? "text-brand-200" : "text-slate-300")}>
                    {a.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-slate-500">{a.desc}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setNetContribute((v) => !v)}
            className="mt-4 flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2.5 text-left hover:bg-white/5"
          >
            <span>
              <span className="block text-sm font-medium text-slate-200">Contribute my bans to the network</span>
              <span className="mt-0.5 block text-[11px] text-slate-500">
                Share your permanent bans (hashed) so other servers benefit. Turning this off keeps your
                bans private.
              </span>
            </span>
            <span
              className={
                "relative h-5 w-9 shrink-0 rounded-full transition " +
                (netContribute ? "bg-emerald-500/70" : "bg-white/15")
              }
            >
              <span
                className={
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all " +
                  (netContribute ? "left-4" : "left-0.5")
                }
              />
            </span>
          </button>

          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-400">
                <Icons.check size={16} /> Saved
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* Tehlikeli bölge */}
      <div>
        <Card className="border-rose-500/20">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-300">
            <Icons.trash size={16} /> Danger zone
          </h3>
          <p className="mb-4 text-sm text-slate-400">
            Deleting the server permanently removes every player, ban and log record.
          </p>
          <button onClick={remove} disabled={deleting} className="btn-danger w-full">
            {deleting ? "Deleting…" : "Delete server"}
          </button>
        </Card>
      </div>
    </div>
  );
}
