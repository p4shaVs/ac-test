"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

const ACTIONS = [
  { key: "REMOVE", label: "Remove", hint: "Block the prop and log it. Repeated attempts (3 in a minute) are kicked automatically." },
  { key: "KICK", label: "Kick", hint: "Block the prop and kick the player." },
  { key: "BAN", label: "Ban", hint: "Block the prop and ban the player." },
] as const;

export function PresetCard({
  serverId,
  total,
  installed,
}: {
  serverId: string;
  total: number;
  installed: number;
}) {
  const router = useRouter();
  const [action, setAction] = useState<(typeof ACTIONS)[number]["key"]>("REMOVE");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const complete = installed >= total;

  async function call(method: "POST" | "DELETE") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/blacklist/preset`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(method === "POST" ? { preset: "troll-props", action } : { preset: "troll-props" }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMsg(json.error ?? "Something went wrong");
      } else {
        setMsg(method === "POST" ? `${json.data.added} models added` : `${json.data.removed} models removed`);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-6 rounded-2xl border border-brand-500/20 bg-brand-500/[0.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            <Icons.shieldCheck size={16} className="text-brand-300" /> Recommended pack · Troll &amp; giant props
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">
            {total} models cheat menus drop on players and roads: giant stunt blocks, XXL ramps, boulders and asteroids
            (&ldquo;spawning a mountain&rdquo;), map buildings and terrain (&ldquo;spawning a house&rdquo;) and cages that trap
            players. No roleplay script creates these, so blocking them costs nothing. Containers and race props are left out.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            <span className={cn("font-semibold", complete ? "text-emerald-300" : "text-slate-300")}>
              {installed}/{total}
            </span>{" "}
            on your blacklist{msg ? ` · ${msg}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-base-900/60 p-1">
            {ACTIONS.map((a) => (
              <button
                key={a.key}
                title={a.hint}
                onClick={() => setAction(a.key)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-semibold transition",
                  action === a.key ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {installed > 0 && (
              <button className="btn-ghost text-xs" disabled={busy} onClick={() => call("DELETE")}>
                Remove pack
              </button>
            )}
            <button className="btn-primary text-xs" disabled={busy || complete} onClick={() => call("POST")}>
              {busy ? "…" : complete ? "Installed" : installed ? "Add missing" : "Add all"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
