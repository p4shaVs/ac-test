import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
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

  // Sunucu içi menü (switcher) için kullanıcının sunucuları.
  const servers = await db.server.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true },
  });

  return (
    <PanelShell nav={nav} user={user} servers={servers} variant="customer">
      {children}
    </PanelShell>
  );
}
