"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { Icons } from "@/components/icons";

interface Props {
  server: {
    id: string;
    name: string;
    ip: string | null;
    maxSlots: number;
    discordWebhook: string;
    webhookEvents: Record<string, boolean>;
    hasToken: boolean;
  };
  appUrl: string;
  /** The server token and deleting the server are the owner's alone. */
  isOwner?: boolean;
}


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

export function ServerSettings({ server, appUrl, isOwner = true }: Props) {
  const router = useRouter();
  const [name, setName] = useState(server.name);
  const [ip, setIp] = useState(server.ip ?? "");
  const [maxSlots, setMaxSlots] = useState(String(server.maxSlots));
  const [webhook, setWebhook] = useState(server.discordWebhook);
  const [events, setEvents] = useState<Record<string, boolean>>(server.webhookEvents);
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
                  {appUrl || "https://coreac.online"}/api/v1
                </code>
                <CopyButton value={`${appUrl || "https://coreac.online"}/api/v1`} label="" className="h-9 w-9 justify-center px-0" />
              </div>
            </div>
            <div>
              <label className="label">Server token</label>
              {!isOwner ? (
                <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-base-900/60 px-3 py-2.5 text-sm text-slate-500">
                  <Icons.lock size={14} /> Only the server owner can see or regenerate the token.
                </div>
              ) : token ? (
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

        {/* CoreAC Network — managed on the Network page */}
        <Card>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <Icons.globe size={16} className="text-slate-400" /> CoreAC Network
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            What a player flagged by the shared ban network triggers here, and whether your bans are shared, is set on the
            Network page — together with who is flagged right now, your shared bans and an identifier look-up.
          </p>
          <Link href={`/dashboard/servers/${server.id}/network`} className="btn-secondary h-9 px-3 text-xs">
            <Icons.globe size={14} /> Open the Network page
          </Link>
        </Card>
      </div>

      {/* Tehlikeli bölge */}
      <div className="space-y-6">
        <Card>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <Icons.users size={16} className="text-slate-400" /> Team
          </h3>
          <p className="mb-4 text-sm text-slate-400">
            Give your staff their own panel login — Admins, Moderators and Viewers, each with only the rights you pick.
          </p>
          <Link href={`/dashboard/servers/${server.id}/team`} className="btn-secondary h-9 w-full justify-center text-xs">
            <Icons.users size={14} /> Open the Team page
          </Link>
        </Card>
        {isOwner && (
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
        )}
      </div>
    </div>
  );
}
