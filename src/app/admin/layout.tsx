import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { PanelShell, type NavSection } from "@/components/panel-shell";

const nav: NavSection[] = [
  {
    title: "General",
    items: [
      { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true },
      { href: "/admin/servers", label: "Servers", icon: "server" },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/admin/products", label: "Products", icon: "cube" },
      { href: "/admin/keys", label: "Licence Keys", icon: "key" },
    ],
  },
  {
    title: "Management",
    items: [
      { href: "/admin/users", label: "Users", icon: "users" },
      { href: "/admin/audit", label: "Audit Log", icon: "logs" },
    ],
  },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "ADMIN") redirect("/dashboard");

  return (
    <PanelShell nav={nav} user={user} variant="admin">
      {children}
    </PanelShell>
  );
}
