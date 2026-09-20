import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getCurrentUser } from "@/lib/session";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // DB doğrulamalı kontrol (middleware ile tutarlı → döngü yok).
  const user = await getCurrentUser();
  if (user) redirect(user.role === "ADMIN" ? "/admin" : "/dashboard");
  return renderLogin();
}

function renderLogin() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Loading…</div>}>
      <AuthForm mode="login" />
    </Suspense>
  );
}
