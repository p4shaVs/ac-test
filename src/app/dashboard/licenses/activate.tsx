"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";

export function ActivateLicense({ licenseKeyId }: { licenseKeyId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [ip, setIp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/servers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, ip: ip || undefined, licenseKeyId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not create the server");
      router.push(`/dashboard/servers/${json.data.serverId}?created=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-primary">
        <Icons.plus size={16} /> Create server
      </button>
    );
  }

  return (
    <form onSubmit={create} className="w-full space-y-2 lg:w-64">
      <input
        className="input"
        placeholder="Server name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        minLength={2}
        autoFocus
      />
      <input
        className="input"
        placeholder="Server IP (optional)"
        value={ip}
        onChange={(e) => setIp(e.target.value)}
      />
      {error && <p className="text-xs text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? "…" : "Create"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}
