"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface ConsoleLine {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
}

const LEVEL: Record<string, { tag: string; cls: string; text: string }> = {
  INFO: { tag: "INF", cls: "text-sky-300", text: "text-slate-300" },
  WARN: { tag: "WRN", cls: "text-amber-300", text: "text-amber-100/90" },
  ERROR: { tag: "ERR", cls: "text-rose-400", text: "text-rose-200" },
  DETECTION: { tag: "DET", cls: "text-fuchsia-300", text: "text-slate-200" },
};

const SOURCE_CLS: Record<string, string> = {
  you: "text-white",
  console: "text-emerald-300",
  panel: "text-sky-300",
  ingame: "text-violet-300",
  admin: "text-violet-300",
  system: "text-slate-400",
  anticheat: "text-fuchsia-300",
};

// Every quick command is a real sub-command of the resource's console command
// (fivem-resource/coreac/server/commands.lua). Commands ending in a space are
// filled into the input for you to finish.
const QUICK: { label: string; cmd: string; confirm?: string }[] = [
  { label: "Players online", cmd: "ac players" },
  { label: "Delete empty vehicles", cmd: "ac clear vehicles", confirm: "Delete every vehicle on the server that has no player in it?" },
  { label: "Delete NPCs", cmd: "ac clear peds", confirm: "Delete every NPC on the server? Players are never touched." },
  { label: "Delete objects", cmd: "ac clear objects", confirm: "Delete every networked object on the server (props spawned by scripts included)?" },
  { label: "Reload config", cmd: "ac reload" },
  { label: "Announcement…", cmd: "ac announce " },
  { label: "Ban info…", cmd: "ac baninfo " },
  { label: "Unban…", cmd: "ac unban " },
];

/** Colours the parts of a log line that matter: commands, arrows, actions, numbers. */
function Message({ text, base }: { text: string; base: string }) {
  if (text.startsWith("> ")) {
    const m = /^> (.*?)(?: \(([^()]+)\))?$/.exec(text);
    return (
      <span className={base}>
        <span className="text-emerald-300">❯ </span>
        <span className="text-white">{m ? m[1] : text.slice(2)}</span>
        {m?.[2] && <span className="text-slate-500"> ({m[2]})</span>}
      </span>
    );
  }
  const parts = text.split(/(\b(?:BAN|KICK|WARN|UNBAN|FALSE BAN FIXED|DETECTION)\b|→|—|\b\d+(?:\.\d+)?\b)/g);
  return (
    <span className={base}>
      {parts.map((p, i) => {
        if (!p) return null;
        if (p === "BAN" || p === "DETECTION") return <span key={i} className="font-semibold text-rose-300">{p}</span>;
        if (p === "KICK" || p === "WARN") return <span key={i} className="font-semibold text-amber-300">{p}</span>;
        if (p === "UNBAN" || p === "FALSE BAN FIXED") return <span key={i} className="font-semibold text-emerald-300">{p}</span>;
        if (p === "→" || p === "—") return <span key={i} className="text-slate-600">{p}</span>;
        if (/^\d/.test(p)) return <span key={i} className="text-amber-200/90">{p}</span>;
        return <span key={i}>{p}</span>;
      })}
    </span>
  );
}

export function ConsoleClient({
  serverId,
  initialLines,
  online: initialOnline,
}: {
  serverId: string;
  initialLines: ConsoleLine[];
  online: boolean;
}) {
  const [lines, setLines] = useState<ConsoleLine[]>(initialLines);
  const [online, setOnline] = useState(initialOnline);
  const [cmd, setCmd] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [live, setLive] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastAt = useRef<string | null>(initialLines.length ? initialLines[initialLines.length - 1].createdAt : null);
  const seen = useRef(new Set(initialLines.map((l) => l.id)));

  useEffect(() => {
    if (autoScroll && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines, autoScroll]);

  const fetchNew = useCallback(
    async (full = false) => {
      try {
        const qs = !full && lastAt.current ? `?since=${encodeURIComponent(lastAt.current)}` : "";
        const res = await fetch(`/api/servers/${serverId}/console${qs}`, { cache: "no-store" });
        const json = await res.json();
        if (!res.ok || !json.ok) return;
        setOnline(json.data.online);
        const incoming: ConsoleLine[] = json.data.lines ?? [];
        if (full) {
          seen.current = new Set(incoming.map((l) => l.id));
          setLines(incoming);
        } else {
          const fresh = incoming.filter((l) => !seen.current.has(l.id));
          fresh.forEach((l) => seen.current.add(l.id));
          // Server lines replace the local echo of the command they confirm.
          if (fresh.length) setLines((prev) => [...prev.filter((l) => !l.id.startsWith("local-") || l.source !== "you"), ...fresh].slice(-500));
        }
        if (incoming.length) lastAt.current = incoming[incoming.length - 1].createdAt;
      } catch {
        /* ignore */
      }
    },
    [serverId]
  );

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => fetchNew(), 3000);
    return () => clearInterval(t);
  }, [live, fetchNew]);

  function pushLocal(message: string, level = "INFO", source = "system") {
    setLines((l) => [...l, { id: `local-${Date.now()}-${Math.random()}`, level, source, message, createdAt: new Date().toISOString() }]);
  }

  async function send(command: string) {
    const c = command.trim();
    if (!c) return;
    setBusy(true);
    setHistory((h) => [c, ...h.filter((x) => x !== c)].slice(0, 30));
    setHIdx(-1);
    pushLocal(`> ${c}`, "INFO", "you");
    try {
      const res = await fetch(`/api/servers/${serverId}/console`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: c }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        pushLocal(online ? "Queued — the server runs it within ~5 s." : "Queued — the server is offline and runs it when it reconnects.", "WARN");
        setTimeout(() => fetchNew(), 1200);
      } else {
        pushLocal(json.error ?? "Could not send the command", "ERROR");
      }
    } catch {
      pushLocal("Network error", "ERROR");
    } finally {
      setBusy(false);
      setCmd("");
    }
  }

  return (
    <div className="space-y-3">
      {/* Quick commands */}
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q.cmd}
            type="button"
            onClick={() => {
              if (q.cmd.endsWith(" ")) {
                setCmd(q.cmd);
                inputRef.current?.focus();
                return;
              }
              if (q.confirm && !window.confirm(q.confirm)) return;
              send(q.cmd);
            }}
            className="h-8 rounded-full border border-white/10 bg-white/[0.02] px-3 text-[12px] font-medium text-slate-300 transition hover:border-white/25 hover:text-white"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Terminal */}
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#060607] shadow-card">
        <div className="flex items-center gap-3 border-b border-white/[0.06] bg-[#0b0b0d] px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          </div>
          <span className="font-mono text-[12px] text-slate-400">coreac — server console</span>
          <span className={cn("ml-1 flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-semibold", online ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.05] text-slate-500")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", online ? "animate-pulse bg-emerald-400" : "bg-slate-500")} />
            {online ? "connected" : "offline"}
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={async () => {
                setRefreshing(true);
                await fetchNew(true);
                setRefreshing(false);
              }}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
            >
              <Icons.refresh size={12} className={cn(refreshing && "animate-spin")} /> Refresh
            </button>
            <button
              type="button"
              onClick={() => setLines([])}
              className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] text-slate-400 transition hover:bg-white/[0.06] hover:text-white"
              title="Clears this view only — the log is kept"
            >
              <Icons.trash size={12} /> Clear
            </button>
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] transition hover:bg-white/[0.06]", live ? "text-emerald-300" : "text-slate-500")}
            >
              {live ? <Icons.pause size={12} /> : <Icons.play size={12} />} {live ? "Live" : "Paused"}
            </button>
            <button
              type="button"
              onClick={() => setAutoScroll((v) => !v)}
              className={cn("flex h-7 items-center gap-1.5 rounded-md px-2 text-[11.5px] transition hover:bg-white/[0.06]", autoScroll ? "text-white" : "text-slate-500")}
              aria-pressed={autoScroll}
            >
              <Icons.chevronDown size={12} /> Auto-scroll
            </button>
          </div>
        </div>

        <div ref={boxRef} className="h-[56vh] min-h-[360px] overflow-y-auto px-4 py-3 font-mono text-[12px] leading-[1.7]" onClick={() => inputRef.current?.focus()}>
          {lines.length === 0 && <p className="text-slate-600">No output. Commands you send and server log lines appear here.</p>}
          {lines.map((l) => {
            const lv = LEVEL[l.level] ?? LEVEL.INFO;
            return (
              <div key={l.id} className="flex gap-2.5 whitespace-pre-wrap break-words hover:bg-white/[0.02]">
                <span className="shrink-0 text-slate-600">{new Date(l.createdAt).toLocaleTimeString("en-GB")}</span>
                <span className={cn("w-7 shrink-0 font-semibold", lv.cls)}>{lv.tag}</span>
                <span className={cn("hidden w-[78px] shrink-0 truncate sm:block", SOURCE_CLS[l.source.toLowerCase()] ?? "text-slate-500")}>[{l.source}]</span>
                <Message text={l.message} base={lv.text} />
              </div>
            );
          })}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(cmd);
          }}
          className="flex items-center gap-2 border-t border-white/[0.06] bg-[#0b0b0d] px-4 py-2.5"
        >
          <span className="font-mono text-[13px] text-emerald-300">❯</span>
          <input
            ref={inputRef}
            className="h-8 min-w-0 flex-1 bg-transparent font-mono text-[13px] text-white placeholder:text-slate-600 focus:outline-none"
            placeholder="ac announce Server restart in 5 minutes"
            value={cmd}
            maxLength={500}
            spellCheck={false}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" && history.length) {
                e.preventDefault();
                const i = Math.min(hIdx + 1, history.length - 1);
                setHIdx(i);
                setCmd(history[i]);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                const i = hIdx - 1;
                setHIdx(Math.max(i, -1));
                setCmd(i >= 0 ? history[i] : "");
              }
            }}
          />
          <button type="submit" disabled={busy || !cmd.trim()} className="btn-primary h-8 px-3 text-xs">
            <Icons.arrowRight size={14} /> Run
          </button>
        </form>
      </div>

      <p className="text-[12px] leading-relaxed text-slate-500">
        Commands are queued and run by the resource on its next poll (about 5 s). Type <code className="kbd">ac</code> for the CoreAC command list — its output appears
        here. ↑ / ↓ walks through what you sent. Other server commands (e.g. <code className="kbd">restart myresource</code>) need{" "}
        <code className="kbd">add_ace resource.&lt;CoreAC folder&gt; command allow</code>, which the installer adds.
      </p>
    </div>
  );
}
