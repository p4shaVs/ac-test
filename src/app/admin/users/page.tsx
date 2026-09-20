import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { UsersTable, type UserRow } from "./users-table";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const me = (await getCurrentUser())!;
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    include: {
      _count: { select: { servers: true, licenseKeys: true } },
    },
  });

  const rows: UserRow[] = users.map((u) => ({
    id: u.id,
    email: u.email,
    username: u.username,
    role: u.role,
    servers: u._count.servers,
    keys: u._count.licenseKeys,
    locked: !!(u.lockedUntil && u.lockedUntil > new Date()),
    createdAt: u.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Users"
        description="Manage accounts, assign roles and clear lockouts."
      />
      <UsersTable users={rows} currentUserId={me.id} />
    </>
  );
}
