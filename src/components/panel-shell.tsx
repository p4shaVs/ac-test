"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./ui";
import { CommandPalette } from "./command-palette";
import { BRAND } from "@/lib/brand";
import { Icons, type IconName } from "./icons";
import { cn } from "@/lib/utils";

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
}

/** Bir sunucunun içindeyken gösterilen gruplu menü (electron-services düzeni). */
function serverNav(id: string): NavSection[] {
  const b = `/dashboard/servers/${id}`;
  return [
    {
      items: [{ href: b, label: "Overview", icon: "dashboard", exact: true }],
    },
    {
      title: "Moderation",
      items: [
        { href: `${b}/players`, label: "Players", icon: "users" },
        { href: `${b}/monitoring`, label: "Live Monitor", icon: "eye" },
        { href: `${b}/bans`, label: "Bans", icon: "ban" },
        { href: `${b}/warns`, label: "Warns", icon: "warn" },
        { href: `${b}/kicks`, label: "Kicks", icon: "kick" },
        { href: `${b}/network`, label: "Network Bans", icon: "globe" },
        { href: `${b}/map`, label: "Interactive Map", icon: "map" },
        { href: `${b}/lookup`, label: "Lookup", icon: "search" },
        { href: `${b}/linked-accounts`, label: "Linked Accounts", icon: "link" },
        { href: `${b}/events`, label: "Events", icon: "activity" },
        { href: `${b}/event-log`, label: "Event Log", icon: "scan" },
        { href: `${b}/logs`, label: "Server Logs", icon: "logs" },
        { href: `${b}/analytics`, label: "Analytics", icon: "chart" },
      ],
    },
    {
      title: "Configuration",
      items: [
        { href: `${b}/rules`, label: "Configuration", icon: "config" },
        { href: `${b}/config-library`, label: "Config Library", icon: "library" },
        { href: `${b}/setup`, label: "Setup Assistant", icon: "wand" },
        { href: `${b}/resources`, label: "Resources", icon: "cube" },
        { href: `${b}/blacklist`, label: "Models", icon: "lock" },
        { href: `${b}/whitelist`, label: "Trust Whitelist", icon: "shieldCheck" },
      ],
    },
    {
      title: "Team",
      items: [
        { href: `${b}/admins`, label: "Admins", icon: "user" },
        { href: `${b}/admin-logs`, label: "Admin Logs", icon: "history" },
        { href: `${b}/console`, label: "Console", icon: "terminal" },
      ],
    },
    {
      title: "Account",
      items: [
        { href: `${b}/support`, label: "Support", icon: "lifebuoy" },
        { href: `${b}/settings`, label: "Settings", icon: "config" },
        { href: `/dashboard/download`, label: "Download", icon: "download" },
        { href: `/docs`, label: "Documentation", icon: "book" },
      ],
    },
  ];
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

  // Ctrl/Cmd + K opens the command palette from anywhere in the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Bir sunucu detayındaysak sol menü sunucu menüsüne döner.
  const match = pathname.match(/^\/dashboard\/servers\/([^/]+)/);
  const activeServerId = match?.[1];
  const activeServer = activeServerId
    ? servers.find((s) => s.id === activeServerId)
    : undefined;
  const inServer = !!activeServer;
  const sections = inServer ? serverNav(activeServer!.id) : nav;

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Üst: logo veya sunucu switcher */}
      <div className="relative h-16 shrink-0 px-3 py-2.5">
        {inServer ? (
          <>
            <button
              onClick={() => setSwitcherOpen((o) => !o)}
              className="flex w-full items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 transition hover:bg-white/10"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-gradient text-white">
                <Icons.server size={15} />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-sm font-semibold text-white">
                  {activeServer!.name}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className={cn("h-1.5 w-1.5 rounded-full", activeServer!.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-600")} />
                  {activeServer!.status === "ONLINE" ? "Online" : "Offline"}
                </span>
              </span>
              <Icons.chevronDown size={15} className="shrink-0 text-slate-400" />
            </button>
            {switcherOpen && (
              <div className="absolute left-3 right-3 top-14 z-30 rounded-xl border border-white/10 bg-base-850 p-1.5 shadow-card">
                <Link href="/dashboard/servers" onClick={() => setSwitcherOpen(false)} className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-slate-300 hover:bg-white/5">
                  <Icons.arrowRight size={13} className="rotate-180" /> All servers
                </Link>
                {servers.map((s) => (
                  <Link
                    key={s.id}
                    href={`/dashboard/servers/${s.id}`}
                    onClick={() => setSwitcherOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs hover:bg-white/5",
                      s.id === activeServer!.id ? "text-white" : "text-slate-400"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", s.status === "ONLINE" ? "bg-emerald-400" : "bg-slate-600")} />
                    <span className="truncate">{s.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-between">
            <Link href="/" onClick={() => setMobileOpen(false)}>
              <Logo />
            </Link>
            {variant === "admin" && (
              <span className="badge bg-purple-500/10 text-purple-300 ring-1 ring-inset ring-purple-500/20">Admin</span>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {sections.map((section, i) => (
          <div key={i}>
            {section.title && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
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
                    <Icon size={18} className="shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge && (
                      <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">{item.badge}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-white/10 p-3">
        <a
          href={BRAND.discordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mb-2 flex items-center gap-2.5 rounded-xl border border-[#5865F2]/25 bg-[#5865F2]/10 px-3 py-2 text-xs font-medium text-[#c9cdfb] transition hover:bg-[#5865F2]/20"
        >
          <Icons.discord size={15} /> Support on Discord
          <Icons.arrowRight size={13} className="ml-auto opacity-60" />
        </a>
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-bold text-white">
            {user.username.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-200">
              {user.username}
              {user.role === "ADMIN" && (
                <span className="rounded bg-purple-500/15 px-1 py-px text-[9px] font-bold uppercase tracking-wider text-purple-300">Admin</span>
              )}
            </p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <button onClick={logout} title="Sign out" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-rose-300">
            <Icons.logout size={17} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="dash-root min-h-screen lg:grid lg:grid-cols-[264px_1fr]">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        servers={servers}
        isAdmin={user.role === "ADMIN"}
      />
      <aside className="sticky top-0 hidden h-screen border-r border-white/10 bg-base-900/90 backdrop-blur-xl lg:block">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-72 border-r border-white/10 bg-base-900">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-white/10 bg-base-950/85 px-4 backdrop-blur-xl sm:px-6">
          <button onClick={() => setMobileOpen(true)} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/5 lg:hidden">
            <Icons.menu size={20} />
          </button>
          <div className="flex flex-1 items-center gap-2">
            <button
              onClick={() => setPaletteOpen(true)}
              className="group flex items-center gap-2 rounded-xl border border-white/10 bg-base-900/60 px-3 py-2 text-sm text-slate-500 transition hover:border-brand-500/40 hover:text-slate-300 sm:w-72"
              aria-label="Search pages and servers"
            >
              <Icons.search size={16} />
              <span className="hidden flex-1 text-left sm:block">Jump to a page or server…</span>
              <kbd className="hidden rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400 group-hover:text-slate-300 sm:block">Ctrl K</kbd>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {variant === "admin" ? (
              <Link href="/dashboard" className="btn-secondary hidden sm:inline-flex">Customer panel</Link>
            ) : (
              user.role === "ADMIN" && (
                <Link href="/admin" className="btn-secondary hidden sm:inline-flex"><Icons.crown size={15} /> Admin</Link>
              )
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
