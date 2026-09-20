import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { PageHeader, Card, Badge } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function AccountSettings() {
  const user = (await getCurrentUser())!;
  const dbUser = await db.user.findUnique({
    where: { id: user.id },
    select: { createdAt: true, lastLoginAt: true },
  });

  return (
    <>
      <PageHeader title="Account settings" description="Your profile and security settings." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center text-center">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-brand-gradient text-2xl font-bold text-white shadow-glow">
              {user.username.charAt(0).toUpperCase()}
            </span>
            <h3 className="mt-3 text-base font-semibold text-white">{user.username}</h3>
            <p className="text-sm text-slate-500">{user.email}</p>
            <div className="mt-2">
              {user.role === "ADMIN" ? (
                <Badge tone="violet">Admin</Badge>
              ) : (
                <Badge tone="blue">Customer</Badge>
              )}
            </div>
          </div>
          <div className="mt-5 space-y-2 border-t border-white/5 pt-4 text-sm">
            <Row label="Registered" value={formatDateTime(dbUser?.createdAt)} />
            <Row label="Last sign-in" value={formatDateTime(dbUser?.lastLoginAt)} />
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-1 text-sm font-semibold text-white">Change password</h3>
          <p className="mb-5 text-xs text-slate-500">
            Changing your password signs you out on every other device.
          </p>
          <PasswordForm />
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-300">{value}</span>
    </div>
  );
}
