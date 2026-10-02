import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { accessibleServers } from "@/lib/team-access";
import { PanelShell, type NavSection } from "@/components/panel-shell";

const nav: NavSection[] = [
  {
    title: "General",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true },
      { href: "/dashboard/servers", label: "My Servers", icon: "server" },
      { href: "/dashboard/licenses", label: "My Licenses", icon: "key" },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/dashboard/redeem", label: "Redeem Key", icon: "gift" },
      { href: "/dashboard/download", label: "Download", icon: "download" },
      { href: "/docs", label: "Documentation", icon: "book" },
    ],
  },
  {
    title: "Account",
    items: [
      { href: "/dashboard/settings", label: "Settings", icon: "config" },
      { href: "/pricing", label: "Upgrade Plan", icon: "cart" },
    ],
  },
];

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/dashboard");

  // Sunucu içi menü (switcher): kendi sunucuları + ekip üyesi olduğu sunucular.
  const servers = (await accessibleServers(user.id)).map(({ server, role, perms }) => ({
    id: server.id,
    name: server.name,
    status: server.status,
    role,
    perms,
  }));

  return (
    <PanelShell nav={nav} user={user} servers={servers} variant="customer">
      {children}
    </PanelShell>
  );
}
