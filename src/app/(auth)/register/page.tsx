import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Register" };
export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
  return renderRegister();
}

function renderRegister() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <AuthForm mode="register" />
    </Suspense>
  );
}
