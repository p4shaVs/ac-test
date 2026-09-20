"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface ConsoleLine {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
}

const levelColor: Record<string, string> = {
  INFO: "text-slate-300",
  WARN: "text-amber-300",
  ERROR: "text-rose-300",
  DETECTION: "text-brand-300",
};

const QUICK = [
  { label: "Delete vehicles", cmd: "aeigs:deleteVehicles" },
  { label: "Delete peds", cmd: "aeigs:deletePeds" },
  { label: "Delete objects", cmd: "aeigs:deleteObjects" },
  { label: "Send announcement", cmd: "aeigs:announce " },
];

export function ConsoleClient({
  serverId,
  initialLines,
  online,
}: {
  serverId: string;
  initialLines: ConsoleLine[];
  online: boolean;
}) {
  const [lines, setLines] = useState<ConsoleLine[]>(initialLines);
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  function pushLocal(message: string, level = "INFO", source = "console") {
    setLines((l) => [
      ...l,
      { id: `local-${Date.now()}-${Math.random()}`, level, source, message, createdAt: new Date().toISOString() },
    ]);
  }

  async function send(command: string) {
    const c = command.trim();
    if (!c) return;
    setBusy(true);
    pushLocal(`> ${c}`, "INFO", "you");
    try {
      const res = await fetch(`/api/servers/${serverId}/console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: c }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        pushLocal(
          online ? "Command queued, sending to the server…" : "Command queued — the server is offline and will run it on connect.",
          "WARN",
          "system"
        );
      } else {
        pushLocal(json.error ?? "Could not send the command", "ERROR", "system");
      }
    } catch {
      pushLocal("Network error", "ERROR", "system");
    } finally {
      setBusy(false);
      setCmd("");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icons.terminal size={18} className="text-brand-300" />
          <h3 className="text-sm font-semibold text-white">Remote console</h3>
        </div>
        <Badge tone={online ? "green" : "gray"} dot>
          {online ? "Connected" : "Offline"}
        </Badge>
      </div>

      {/* Hızlı komutlar */}
      <div className="flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <button
            key={q.cmd}
            onClick={() => (q.cmd.endsWith(" ") ? setCmd(q.cmd) : send(q.cmd))}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Çıktı */}
      <div className="h-[420px] overflow-y-auto rounded-2xl border border-white/5 bg-base-950/80 p-3 font-mono text-xs">
        {lines.map((l) => (
          <div key={l.id} className="flex gap-2 py-0.5">
            <span className="shrink-0 text-slate-600">
              {new Date(l.createdAt).toLocaleTimeString("en-GB")}
            </span>
            <span className="shrink-0 text-slate-600">[{l.source}]</span>
            <span className={cn(levelColor[l.level] ?? "text-slate-300")}>{l.message}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Giriş */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(cmd);
        }}
        className="flex gap-2"
      >
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-brand-400">$</span>
          <input
            className="input pl-7 font-mono"
            placeholder="type a command… (e.g. aeigs:announce Hello)"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
          />
        </div>
        <button type="submit" disabled={busy} className="btn-primary">
          <Icons.arrowRight size={16} /> Send
        </button>
      </form>
      <p className="text-xs text-slate-500">
        Commands are queued and run by the resource on its next poll.
      </p>
    </div>
  );
}
