"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogoMark } from "./ui";
import { CommandPalette } from "./command-palette";
import { BRAND } from "@/lib/brand";
import { Icons, type IconName } from "./icons";
import { cn } from "@/lib/utils";
import { canOpenPage, roleLabel, type Permission, type Role } from "@/lib/team";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  badge?: string;
  exact?: boolean;
}
export interface NavSection {
  title?: string;
  items: NavItem[];
}

export interface ShellUser {
  username: string;
  email: string;
  role: "USER" | "ADMIN";
  avatarUrl: string | null;
}

export interface ShellServer {
  id: string;
  name: string;
  status: string;
  /** Your role on it — OWNER for your own servers. */
  role?: Role;
  /** Effective panel permissions (team members). */
  perms?: Permission[];
}

/** The menu while you are inside a server, trimmed to what your role can open. */
function serverNav(server: ShellServer): NavSection[] {
  const b = `/dashboard/servers/${server.id}`;
  const isOwner = (server.role ?? "OWNER") === "OWNER";
  const perms = server.perms ?? [];
  const open = (item: NavItem) => {
    if (!item.href.startsWith(b)) return item.href !== "/dashboard/download" || isOwner;
    const segment = item.href.slice(b.length + 1).split("/")[0] ?? "";
    return canOpenPage(segment, perms, isOwner);
  };
  const all: NavSection[] = [
    { items: [{ href: b, label: "Overview", icon: "dashboard", exact: true }] },
    {
      title: "Moderation",
      items: [
        { href: `${b}/players`, label: "Players", icon: "users" },
        { href: `${b}/monitoring`, label: "Live Monitor", icon: "eye" },
        { href: `${b}/bans`, label: "Bans", icon: "ban" },
        { href: `${b}/kicks`, label: "Kicks", icon: "kick" },
        { href: `${b}/warns`, label: "Warnings", icon: "warn" },
        { href: `${b}/lookup`, label: "Lookup", icon: "search" },
        { href: `${b}/linked-accounts`, label: "Linked Accounts", icon: "link" },
        { href: `${b}/network`, label: "CoreAC Network", icon: "globe" },
        { href: `${b}/map`, label: "Live Map", icon: "map" },
      ],
    },
    {
      title: "Logs",
      items: [
        { href: `${b}/detections`, label: "Detections", icon: "shieldCheck" },
        { href: `${b}/event-log`, label: "Event Log", icon: "scan" },
        { href: `${b}/logs`, label: "Server Logs", icon: "logs" },
        { href: `${b}/admin-logs`, label: "Admin Logs", icon: "history" },
        { href: `${b}/console`, label: "Console", icon: "terminal" },
        { href: `${b}/analytics`, label: "Analytics", icon: "chart" },
      ],
    },
    {
      title: "Configuration",
      items: [
        { href: `${b}/rules`, label: "Configuration", icon: "sliders" },
        { href: `${b}/events`, label: "Protected Events", icon: "activity" },
        { href: `${b}/blacklist`, label: "Models", icon: "lock" },
        { href: `${b}/whitelist`, label: "Trust Whitelist", icon: "shieldCheck" },
        { href: `${b}/admins`, label: "Admins", icon: "user" },
        { href: `${b}/config-library`, label: "Config Library", icon: "library" },
        { href: `${b}/resources`, label: "Resources", icon: "cube" },
        { href: `${b}/setup`, label: "Setup Assistant", icon: "wand" },
      ],
    },
    {
      title: "Account",
      items: [
        { href: `${b}/settings`, label: "Server Settings", icon: "config" },
        { href: `${b}/team`, label: "Team", icon: "users" },
        { href: `${b}/support`, label: "Support", icon: "lifebuoy" },
        { href: `/dashboard/download`, label: "Download", icon: "download" },
        { href: `/docs`, label: "Documentation", icon: "book" },
      ],
    },
  ];
  return all.map((s) => ({ ...s, items: s.items.filter(open) })).filter((s) => s.items.length > 0);
}

export function PanelShell({
  nav,
  user,
  servers = [],
  children,
  variant = "customer",
}: {
  nav: NavSection[];
  user: ShellUser;
  servers?: ShellServer[];
  children: React.ReactNode;
  variant?: "customer" | "admin";
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  // Ctrl/Cmd + K opens the command palette from anywhere in the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
      if (e.key === "Escape") {
        setSwitcherOpen(false);
        setUserOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close popovers on an outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) setSwitcherOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const match = pathname.match(/^\/dashboard\/servers\/([^/]+)/);
  const activeServerId = match?.[1];
  const activeServer = activeServerId ? servers.find((s) => s.id === activeServerId) : undefined;
  const inServer = !!activeServer;
  const sections = inServer ? serverNav(activeServer!) : nav;
  const activeRole = activeServer?.role ?? "OWNER";
  const owned = servers.filter((s) => (s.role ?? "OWNER") === "OWNER");
  const shared = servers.filter((s) => (s.role ?? "OWNER") !== "OWNER");

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  // Breadcrumb: the deepest menu item that matches the current page.
  const current = useMemo(() => {
    let best: NavItem | undefined;
    for (const s of sections) {
      for (const it of s.items) {
        if (isActive(it) && (!best || it.href.length > best.href.length)) best = it;
      }
    }
    return best;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, sections]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const online = activeServer?.status === "ONLINE";

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-[60px] shrink-0 items-center justify-between px-5">
        <Link href={variant === "admin" ? "/admin" : "/dashboard"} className="flex items-center gap-2.5" onClick={() => setMobileOpen(false)}>
          <LogoMark size={24} />
          <span className="text-[15px] font-semibold tracking-tight text-white">CoreAC</span>
        </Link>
        <span className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
          {variant === "admin" ? "admin" : "panel"}
        </span>
      </div>

      {/* Server switcher */}
      {inServer && (
        <div ref={switcherRef} className="relative px-3 pb-2">
          <button
            onClick={() => setSwitcherOpen((o) => !o)}
            className="flex w-full items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.025] px-2.5 py-2 text-left transition hover:border-white/15 hover:bg-white/[0.05]"
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-gradient text-[13px] font-semibold text-white ring-1 ring-inset ring-white/10">
              {activeServer!.name.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-white">{activeServer!.name}</span>
              <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <span className={cn("h-1.5 w-1.5 rounded-full", online ? "bg-emerald-400" : "bg-slate-600")} />
                {online ? "Online" : "Offline"}
                {activeRole !== "OWNER" && (
                  <span className="ml-auto rounded border border-white/10 px-1 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400">
                    {roleLabel(activeRole)}
                  </span>
                )}
              </span>
            </span>
            <Icons.chevronDown size={15} className={cn("shrink-0 text-slate-500 transition", switcherOpen && "rotate-180")} />
          </button>
          {switcherOpen && (
            <div className="absolute left-3 right-3 top-[calc(100%-2px)] z-40 rounded-xl border border-white/10 bg-[#131315] p-1.5 shadow-pop">
              {[
                { title: "Your servers", list: owned },
                { title: "Shared with you", list: shared },
              ]
                .filter((g) => g.list.length > 0)
                .map((g) => (
                  <div key={g.title}>
                    <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">{g.title}</p>
                    {g.list.map((s) => (
                      <Link
                        key={s.id}
                        href={`/dashboard/servers/${s.id}`}
                        onClick={() => setSwitcherOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] hover:bg-white/[0.05]",
                          s.id === activeServer!.id ? "text-white" : "text-slate-400"
                        )}
                      >
                        <span className={cn("h-1.5 w-1.5 rounded-full", s.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-600")} />
                        <span className="flex-1 truncate">{s.name}</span>
                        {s.role && s.role !== "OWNER" && <span className="text-[10.5px] text-slate-600">{roleLabel(s.role)}</span>}
                        {s.id === activeServer!.id && <Icons.check size={14} className="text-slate-300" />}
                      </Link>
                    ))}
                  </div>
                ))}
              <div className="my-1 h-px bg-white/[0.06]" />
              <Link href="/dashboard/servers" onClick={() => setSwitcherOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-400 hover:bg-white/[0.05] hover:text-white">
                <Icons.server size={14} /> All servers
              </Link>
              <Link href="/dashboard/servers/new" onClick={() => setSwitcherOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-400 hover:bg-white/[0.05] hover:text-white">
                <Icons.plus size={14} /> Add a server
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-2">
        {sections.map((section, i) => (
          <div key={i}>
            {section.title && (
              <p className="mb-1.5 px-2.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-600">{section.title}</p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = Icons[item.icon];
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={cn("nav-link", active && "nav-link-active")}
                  >
                    <span className="nav-ico">
                      <Icon size={16} />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <a
          href={BRAND.discordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-400 transition hover:bg-white/[0.045] hover:text-white"
        >
          <Icons.discord size={16} /> Support on Discord
          <Icons.external size={13} className="ml-auto opacity-50" />
        </a>
      </div>
    </div>
  );

  return (
    <div className="dash-root min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} servers={servers} isAdmin={user.role === "ADMIN"} />

      <aside className="sticky top-0 hidden h-screen border-r border-white/[0.06] bg-[#0b0b0c] lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-white/[0.06] bg-[#0b0b0c]">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-[60px] items-center gap-3 border-b border-white/[0.06] bg-[#070708]/85 px-4 backdrop-blur-md sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Open menu">
            <Icons.menu size={20} />
          </button>

          {/* Breadcrumb */}
          <div className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
            {inServer ? (
              <>
                <Link href="/dashboard/servers" className="text-slate-500 hover:text-slate-200">Servers</Link>
                <Icons.chevronRight size={13} className="text-slate-700" />
                <Link href={`/dashboard/servers/${activeServer!.id}`} className="max-w-[180px] truncate text-slate-500 hover:text-slate-200">
                  {activeServer!.name}
                </Link>
                {current && current.href !== `/dashboard/servers/${activeServer!.id}` && (
                  <>
                    <Icons.chevronRight size={13} className="text-slate-700" />
                    <span className="truncate font-medium text-slate-100">{current.label}</span>
                  </>
                )}
              </>
            ) : (
              <span className="font-medium text-slate-100">{current?.label ?? (variant === "admin" ? "Admin" : "Dashboard")}</span>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 text-[13px] text-slate-500 transition hover:border-white/15 hover:text-slate-300 sm:w-64"
              aria-label="Search pages and servers"
            >
              <Icons.search size={15} />
              <span className="hidden flex-1 text-left sm:block">Search…</span>
              <kbd className="kbd hidden sm:block">Ctrl K</kbd>
            </button>

            {inServer && (
              <span className={cn(
                "hidden items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-medium md:flex",
                online ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300" : "border-white/10 text-slate-500"
              )}>
                <span className={cn("h-1.5 w-1.5 rounded-full", online ? "animate-pulse bg-emerald-400" : "bg-slate-600")} />
                {online ? "Live" : "Offline"}
              </span>
            )}

            {variant === "admin" ? (
              <Link href="/dashboard" className="btn-secondary hidden h-9 px-3 text-[13px] sm:inline-flex">Customer panel</Link>
            ) : (
              user.role === "ADMIN" && (
                <Link href="/admin" className="btn-secondary hidden h-9 px-3 text-[13px] sm:inline-flex">
                  <Icons.crown size={14} /> Admin
                </Link>
              )
            )}

            <div ref={userRef} className="relative">
              <button
                onClick={() => setUserOpen((o) => !o)}
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-[13px] font-bold text-[#0a0a0b] ring-2 ring-white/10 transition hover:ring-white/25"
                aria-label="Account menu"
              >
                {user.username.charAt(0).toUpperCase()}
              </button>
              {userOpen && (
                <div className="absolute right-0 top-11 z-40 w-60 rounded-xl border border-white/10 bg-[#131315] p-1.5 shadow-pop">
                  <div className="px-2.5 py-2">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-white">
                      {user.username}
                      {user.role === "ADMIN" && <span className="rounded bg-white/10 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-slate-300">Admin</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                  <div className="my-1 h-px bg-white/[0.06]" />
                  <Link href="/dashboard/settings" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-300 hover:bg-white/[0.05] hover:text-white">
                    <Icons.config size={15} /> Account settings
                  </Link>
                  <Link href="/dashboard/licenses" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-300 hover:bg-white/[0.05] hover:text-white">
                    <Icons.key size={15} /> Licences
                  </Link>
                  <button onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-300 hover:bg-rose-400/10 hover:text-rose-300">
                    <Icons.logout size={15} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-7 sm:px-6 lg:px-10">
          <div className="animate-rise mx-auto max-w-[1360px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
