"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UnbanButton({
  serverId,
  banId,
}: {
  serverId: string;
  banId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function unban() {
    if (!confirm("Remove this ban?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/servers/${serverId}/unban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banId }),
      });
      if (res.ok) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={unban}
      disabled={loading}
      className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-emerald-500/40 hover:text-emerald-300"
    >
      {loading ? "…" : "Remove ban"}
    </button>
  );
}
