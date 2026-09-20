"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, EmptyState } from "@/components/ui";
import { Icons } from "@/components/icons";
import { formatDate } from "@/lib/utils";
import { ADMIN_PERMISSIONS, PERMISSION_LABELS } from "@/lib/admin-perms";

export interface AdminRow {
  id: string;
  identifier: string;
  displayName: string | null;
  role: string;
  permissions: string[];
  createdAt: string;
}

const PERMS: { key: string; label: string }[] = ADMIN_PERMISSIONS.map((key) => ({
  key,
  label: PERMISSION_LABELS[key],
}));

const roleTone: Record<string, "violet" | "blue" | "gray"> = {
  OWNER: "violet",
  ADMIN: "blue",
  MODERATOR: "gray",
};
const roleLabel: Record<string, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MODERATOR: "Moderator",
};

export function AdminsManager({
  serverId,
  admins,
}: {
  serverId: string;
  admins: AdminRow[];
}) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("MODERATOR");
  const [perms, setPerms] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-admin permissions, editable in place. Re-seeded whenever the server
  // sends a fresh list (router.refresh after add/remove/edit).
  const [permsById, setPermsById] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(admins.map((a) => [a.id, a.permissions]))
  );
  const [savingId, setSavingId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  useEffect(() => {
    setPermsById(Object.fromEntries(admins.map((a) => [a.id, a.permissions])));
  }, [admins]);

  async function toggleAdminPerm(adminId: string, key: string) {
    const before = permsById[adminId] ?? [];
    const next = before.includes(key) ? before.filter((p) => p !== key) : [...before, key];
    setPermsById((m) => ({ ...m, [adminId]: next }));
    setSavingId(adminId);
    setRowError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/admins/${adminId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save permissions");
    } catch (e) {
      setPermsById((m) => ({ ...m, [adminId]: before }));
      setRowError(e instanceof Error ? e.message : "Could not save permissions");
    } finally {
      setSavingId(null);
    }
  }

  function togglePerm(k: string) {
    setPerms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/servers/${serverId}/admins`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier,
          displayName: displayName || undefined,
          role,
          permissions: perms.length ? perms : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not add admin");
      setIdentifier("");
      setDisplayName("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this admin?")) return;
    const res = await fetch(`/api/servers/${serverId}/admins/${id}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {admins.length === 0 ? (
          <EmptyState
            icon="user"
            title="No admins yet"
            description="Add the people who should have in-game admin powers, by identifier."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/5 bg-base-850/60">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Admin</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Added</th>
                  <th className="px-4 py-3 text-right font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const current = permsById[a.id] ?? a.permissions;
                  return (
                    <Fragment key={a.id}>
                      <tr className="hover:bg-white/[0.02]">
                        <td className="px-4 pb-2 pt-3">
                          <p className="font-medium text-slate-200">{a.displayName ?? "—"}</p>
                          <code className="font-mono text-[11px] text-slate-500">{a.identifier}</code>
                        </td>
                        <td className="px-4 pb-2 pt-3">
                          <Badge tone={roleTone[a.role] ?? "gray"}>{roleLabel[a.role] ?? a.role}</Badge>
                        </td>
                        <td className="px-4 pb-2 pt-3 text-slate-500">{formatDate(a.createdAt)}</td>
                        <td className="px-4 pb-2 pt-3 text-right">
                          <button
                            onClick={() => remove(a.id)}
                            title="Remove admin"
                            className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
                          >
                            <Icons.trash size={14} />
                          </button>
                        </td>
                      </tr>
                      <tr className="border-b border-white/5 last:border-0">
                        <td colSpan={4} className="px-4 pb-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {PERMS.map((p) => {
                              const on = current.includes(p.key);
                              return (
                                <button
                                  key={p.key}
                                  type="button"
                                  disabled={savingId === a.id}
                                  onClick={() => toggleAdminPerm(a.id, p.key)}
                                  title={on ? `Revoke ${p.label}` : `Grant ${p.label}`}
                                  className={
                                    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition disabled:opacity-50 " +
                                    (on
                                      ? "border-brand-500/50 bg-brand-500/15 text-brand-200"
                                      : "border-white/10 text-slate-500 hover:bg-white/5 hover:text-slate-300")
                                  }
                                >
                                  {p.label}
                                </button>
                              );
                            })}
                            {savingId === a.id && <span className="text-[11px] text-slate-500">Saving…</span>}
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-white/5 px-4 py-2.5 text-[11px] text-slate-500">
              Click a permission to grant or revoke it. Changes reach the game within a minute.
            </p>
            {rowError && <p className="px-4 pb-3 text-xs text-rose-400">{rowError}</p>}
          </div>
        )}
      </div>

      <Card>
        <h3 className="mb-1 text-sm font-semibold text-white">Add admin</h3>
        <p className="mb-4 text-xs text-slate-500">
          Enter a license:, steam: or discord: identifier.
        </p>
        <form onSubmit={add} className="space-y-3">
          <div>
            <label className="label">Identifier</label>
            <input
              className="input font-mono text-xs"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="discord:123456789012345678"
              required
            />
          </div>
          <div>
            <label className="label">Display name (optional)</label>
            <input className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
          </div>
          <div>
            <label className="label">Role</label>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="MODERATOR">Moderator</option>
              <option value="ADMIN">Admin</option>
              <option value="OWNER">Owner</option>
            </select>
          </div>
          <div>
            <label className="label">In-game permissions (defaults to the role when empty)</label>
            <div className="grid grid-cols-3 gap-1.5">
              {PERMS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => togglePerm(p.key)}
                  className={
                    "rounded-lg border px-2 py-1.5 text-[11px] font-medium transition " +
                    (perms.includes(p.key)
                      ? "border-brand-500/50 bg-brand-500/10 text-white"
                      : "border-white/10 text-slate-400 hover:bg-white/5")
                  }
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Adding…" : "Add admin"}
          </button>
        </form>
      </Card>
    </div>
  );
}
