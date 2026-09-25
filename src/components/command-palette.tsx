"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icons, type IconName } from "./icons";
import { cn } from "@/lib/utils";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  href: string;
  icon: IconName;
  group: string;
  keywords?: string;
}

interface PaletteServer {
  id: string;
  name: string;
  status: string;
}

const SERVER_PAGES: { path: string; label: string; icon: IconName; keywords?: string }[] = [
  { path: "", label: "Overview", icon: "dashboard" },
  { path: "/players", label: "Players", icon: "users", keywords: "online kick ban" },
  { path: "/monitoring", label: "Live Monitor", icon: "eye", keywords: "screenshots screen" },
  { path: "/bans", label: "Bans", icon: "ban", keywords: "unban" },
  { path: "/map", label: "Interactive Map", icon: "map" },
  { path: "/lookup", label: "Lookup", icon: "search", keywords: "player identifier license discord" },
  { path: "/events", label: "Events", icon: "activity", keywords: "detections" },
  { path: "/logs", label: "Server Logs", icon: "logs" },
  { path: "/rules", label: "Configuration", icon: "config", keywords: "protections actions settings log-only" },
  { path: "/blacklist", label: "Models blacklist", icon: "lock", keywords: "vehicle weapon ped object" },
  { path: "/whitelist", label: "Trust Whitelist", icon: "shieldCheck", keywords: "bypass staff" },
  { path: "/admins", label: "Admins", icon: "user", keywords: "permissions in-game menu" },
  { path: "/console", label: "Console", icon: "terminal", keywords: "command announce" },
  { path: "/resources", label: "Resources", icon: "cube", keywords: "restart start stop" },
  { path: "/settings", label: "Settings", icon: "config", keywords: "token webhook discord" },
];

export function CommandPalette({
  open,
  onClose,
  servers,
  isAdmin,
}: {
  open: boolean;
  onClose: () => void;
  servers: PaletteServer[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [
      { id: "home", label: "Dashboard", href: "/dashboard", icon: "dashboard", group: "Pages" },
      { id: "servers", label: "My Servers", href: "/dashboard/servers", icon: "server", group: "Pages" },
      { id: "new", label: "Add a server", href: "/dashboard/servers/new", icon: "plus", group: "Pages", keywords: "create activate licence" },
      { id: "lic", label: "My Licences", href: "/dashboard/licenses", icon: "key", group: "Pages" },
      { id: "redeem", label: "Redeem a key", href: "/dashboard/redeem", icon: "gift", group: "Pages" },
      { id: "dl", label: "Download & installer", href: "/dashboard/download", icon: "download", group: "Pages", keywords: "install token resource" },
      { id: "acct", label: "Account settings", href: "/dashboard/settings", icon: "config", group: "Pages", keywords: "password" },
      { id: "docs", label: "Documentation", href: "/docs", icon: "book", group: "Pages", keywords: "help events console convars" },
      { id: "buy", label: "Buy a licence", href: "/purchase", icon: "cart", group: "Pages", keywords: "purchase discord pricing" },
    ];
    if (isAdmin) {
      out.push(
        { id: "a-home", label: "Admin dashboard", href: "/admin", icon: "crown", group: "Admin" },
        { id: "a-orders", label: "Orders · record a sale", href: "/admin/orders", icon: "cart", group: "Admin", keywords: "revenue refund" },
        { id: "a-keys", label: "Licence keys", href: "/admin/keys", icon: "key", group: "Admin", keywords: "generate extend revoke" },
        { id: "a-products", label: "Products", href: "/admin/products", icon: "cube", group: "Admin" },
        { id: "a-users", label: "Users", href: "/admin/users", icon: "users", group: "Admin" },
        { id: "a-servers", label: "All servers", href: "/admin/servers", icon: "server", group: "Admin" },
        { id: "a-audit", label: "Audit log", href: "/admin/audit", icon: "logs", group: "Admin" },
      );
    }
    for (const s of servers) {
      for (const p of SERVER_PAGES) {
        out.push({
          id: `${s.id}${p.path}`,
          label: p.path ? `${s.name} → ${p.label}` : s.name,
          hint: p.path ? undefined : s.status === "ONLINE" ? "Online" : "Offline",
          href: `/dashboard/servers/${s.id}${p.path}`,
          icon: p.path ? p.icon : "server",
          group: "Servers",
          keywords: `${s.name} ${p.label} ${p.keywords ?? ""}`,
        });
      }
    }
    return out;
  }, [servers, isAdmin]);

  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) {
      // Without a query: pages + each server's overview only (not every sub-page).
      return commands.filter((c) => c.group !== "Servers" || !c.label.includes("→")).slice(0, 40);
    }
    return commands
      .filter((c) => {
        const hay = `${c.label} ${c.keywords ?? ""} ${c.group}`.toLowerCase();
        return terms.every((t) => hay.includes(t));
      })
      .slice(0, 40);
  }, [commands, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);
  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  function go(c: Cmd | undefined) {
    if (!c) return;
    onClose();
    router.push(c.href);
  }

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl animate-scale-in overflow-hidden rounded-2xl border border-white/10 bg-base-850 shadow-card">
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Icons.search size={18} className="shrink-0 text-slate-500" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); go(results[active]); }
              else if (e.key === "Escape") { e.preventDefault(); onClose(); }
            }}
            placeholder="Jump to a page or server…"
            className="h-14 w-full bg-transparent text-[15px] text-slate-100 placeholder:text-slate-500 focus:outline-none"
            aria-label="Search pages and servers"
          />
          <kbd className="hidden shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:block">ESC</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && <p className="px-3 py-10 text-center text-sm text-slate-500">Nothing matches “{q}”.</p>}
          {results.map((c, i) => {
            const Icon = Icons[c.icon];
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">{header}</p>}
                <button
                  data-idx={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => go(c)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                    i === active ? "bg-brand-500/15 text-white" : "text-slate-300"
                  )}
                >
                  <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg", i === active ? "bg-brand-500/25 text-brand-200" : "bg-white/5 text-slate-400")}>
                    <Icon size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && (
                    <span className={cn("text-[11px]", c.hint === "Online" ? "text-emerald-400" : "text-slate-500")}>{c.hint}</span>
                  )}
                  {i === active && <Icons.arrowRight size={14} className="shrink-0 text-brand-300" />}
                </button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2 text-[11px] text-slate-500">
          <span><kbd className="font-semibold text-slate-400">↑↓</kbd> move</span>
          <span><kbd className="font-semibold text-slate-400">↵</kbd> open</span>
          <span><kbd className="font-semibold text-slate-400">Ctrl K</kbd> toggle</span>
        </div>
      </div>
    </div>
  );
}
