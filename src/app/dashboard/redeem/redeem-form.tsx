"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";

export function RedeemForm() {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key.trim().toUpperCase() }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Error");
      setMsg({ type: "ok", text: "Key added to your account — redirecting…" });
      setTimeout(() => {
        router.push("/dashboard/licenses");
        router.refresh();
      }, 900);
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        className="input font-mono uppercase tracking-wider"
        placeholder="AEIGS-XXXX-XXXX-XXXX-XXXX"
        value={key}
        onChange={(e) => setKey(e.target.value)}
        maxLength={26}
        required
      />
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
      <button type="submit" disabled={loading} className="btn-primary w-full py-3">
        {loading ? "Kontrol ediliyor…" : "Redeem key"}
      </button>
    </form>
  );
}
