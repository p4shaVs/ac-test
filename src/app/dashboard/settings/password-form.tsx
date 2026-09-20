"use client";

import { useState } from "react";
import { Icons } from "@/components/icons";

export function PasswordForm() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const newPassword = String(data.get("newPassword"));
    const confirm = String(data.get("confirm"));

    if (newPassword !== confirm) {
      setMsg({ type: "err", text: "The new passwords do not match." });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: String(data.get("currentPassword")),
          newPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error");
      setMsg({ type: "ok", text: "Your password has been updated." });
      form.reset();
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4">
      <div>
        <label className="label">Current password</label>
        <input name="currentPassword" type="password" required className="input" autoComplete="current-password" />
      </div>
      <div>
        <label className="label">New password</label>
        <input name="newPassword" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </div>
      <div>
        <label className="label">Confirm new password</label>
        <input name="confirm" type="password" required minLength={8} className="input" autoComplete="new-password" />
      </div>
      {msg && (
        <div
          className={
            "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm " +
            (msg.type === "ok"
              ? "border border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
              : "border border-rose-500/20 bg-rose-500/10 text-rose-300")
          }
        >
          {msg.type === "ok" ? <Icons.check size={16} /> : <Icons.warn size={16} />}
          {msg.text}
        </div>
      )}
      <button type="submit" disabled={loading} className="btn-primary">
        {loading ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
