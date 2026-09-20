"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { formatDate } from "@/lib/utils";

export interface UserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  servers: number;
  keys: number;
  locked: boolean;
  createdAt: string;
}

export function UsersTable({
  users,
  currentUserId,
}: {
  users: UserRow[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
  }, [users, query]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error ?? "Action failed");
      } else {
        router.refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative sm:w-80">
        <Icons.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          className="input pl-9"
          placeholder="Search username or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-base-850/60">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Server</th>
              <th className="px-4 py-3 font-medium">Licence</th>
              <th className="px-4 py-3 font-medium">Registered</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                      {u.username.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="flex items-center gap-2 font-medium text-slate-200">
                        {u.username}
                        {u.id === currentUserId && (
                          <span className="text-[10px] text-slate-500">(you)</span>
                        )}
                        {u.locked && <Badge tone="red">Locked</Badge>}
                      </p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {u.role === "ADMIN" ? (
                    <Badge tone="violet">Admin</Badge>
                  ) : (
                    <Badge tone="blue">Customer</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-400">{u.servers}</td>
                <td className="px-4 py-3 text-slate-400">{u.keys}</td>
                <td className="px-4 py-3 text-slate-500">{formatDate(u.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1.5">
                    {u.locked && (
                      <MiniBtn label="Unlock" onClick={() => patch(u.id, { unlock: true })} disabled={busy === u.id} />
                    )}
                    {u.role === "ADMIN" ? (
                      u.id !== currentUserId && (
                        <MiniBtn label="Revoke admin" danger onClick={() => patch(u.id, { role: "USER" })} disabled={busy === u.id} />
                      )
                    ) : (
                      <MiniBtn label="Admin Yap" onClick={() => patch(u.id, { role: "ADMIN" })} disabled={busy === u.id} />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MiniBtn({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={
        "rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50 " +
        (danger ? "hover:border-rose-500/40 hover:text-rose-300" : "")
      }
    >
      {label}
    </button>
  );
}
