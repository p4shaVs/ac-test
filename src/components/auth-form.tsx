"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Icons } from "./icons";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload =
      mode === "login"
        ? {
            emailOrUsername: String(form.get("emailOrUsername") ?? ""),
            password: String(form.get("password") ?? ""),
          }
        : {
            email: String(form.get("email") ?? ""),
            username: String(form.get("username") ?? ""),
            password: String(form.get("password") ?? ""),
          };

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Something went wrong");
      }
      const dest =
        next ?? (json.data?.role === "ADMIN" ? "/admin" : "/dashboard");
      router.push(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold tracking-tight text-white">
        {mode === "login" ? "Welcome back" : "Create an account"}
      </h1>
      <p className="mt-1.5 text-sm text-slate-400">
        {mode === "login"
          ? "Sign in to reach your panel."
          : "Be protected in minutes."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        {mode === "register" && (
          <>
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="username">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                minLength={3}
                maxLength={24}
                autoComplete="username"
                placeholder="kullanici_adi"
                className="input"
              />
            </div>
          </>
        )}

        {mode === "login" && (
          <div>
            <label className="label" htmlFor="emailOrUsername">
              Email or username
            </label>
            <input
              id="emailOrUsername"
              name="emailOrUsername"
              type="text"
              required
              autoComplete="username"
              placeholder="you@example.com"
              className="input"
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="••••••••"
              className="input pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              tabIndex={-1}
            >
              {showPw ? <Icons.eyeOff size={17} /> : <Icons.eye size={17} />}
            </button>
          </div>
          {mode === "register" && (
            <p className="mt-1.5 text-xs text-slate-500">
              At least 8 characters, with a letter and a number.
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-300">
            <Icons.warn size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full py-3">
          {loading
            ? "Please wait…"
            : mode === "login"
            ? "Sign in"
            : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        {mode === "login" ? (
          <>
            No account yet?{" "}
            <Link href="/register" className="font-semibold text-brand-300 hover:text-brand-200">
              Register
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-brand-300 hover:text-brand-200">
              Sign in
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
