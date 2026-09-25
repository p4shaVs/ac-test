"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { StatusBadge } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { Icons } from "@/components/icons";
import { FEATURES, featureLabel } from "@/lib/features";
import { cn, relativeDays } from "@/lib/utils";

export interface KeyRow {
  id: string;
  key: string;
  status: string;
  features: string[];
  maxServers: number;
  serverCount: number;
  productName: string | null;
  ownerEmail: string | null;
  ownerUsername: string | null;
  note: string | null;
  createdAt: string;
  expiresAt: string | null;
}
export interface ProductOption {
  id: string;
  name: string;
  features: string[];
}

const CATEGORIES = ["Detection", "Protection", "Panel", "Advanced"] as const;

async function patchKey(id: string, body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch(`/api/admin/keys/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return null;
  const j = await res.json().catch(() => ({}));
  return j.error ?? "Update failed";
}

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formulas (=, +, -, @) and quote everything.
  const safe = /^[=+\-@]/.test(s) ? "'" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function KeyManager({ keys, products }: { keys: KeyRow[]; products: ProductOption[] }) {
  const router = useRouter();
  const [genOpen, setGenOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [manage, setManage] = useState<KeyRow | null>(null);

  // Üretim formu state
  const [productId, setProductId] = useState("");
  const [owner, setOwner] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState("1");
  const [maxServers, setMaxServers] = useState("1");
  const [lifetime, setLifetime] = useState(true);
  const [expiresInDays, setExpiresInDays] = useState("30");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ key: string }[] | null>(null);

  function toggleFeature(k: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  }

  function applyProductFeatures(pid: string) {
    setProductId(pid);
    const p = products.find((x) => x.id === pid);
    if (p) setSelected(new Set(p.features));
  }

  async function generate() {
    setLoading(true);
    setError(null);
    setGenerated(null);
    try {
      const res = await fetch("/api/admin/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: productId || undefined,
          owner: owner.trim() || undefined,
          features: Array.from(selected),
          maxServers: Math.min(50, Math.max(1, Number(maxServers) || 1)),
          quantity: Math.min(100, Math.max(1, Number(quantity) || 1)),
          expiresInDays: lifetime ? null : Number(expiresInDays) || 30,
          note: note || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Generation failed");
      setGenerated(json.data.keys);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setGenerated(null);
    setSelected(new Set());
    setProductId("");
    setOwner("");
    setQuantity("1");
    setMaxServers("1");
    setLifetime(true);
    setNote("");
    setError(null);
  }

  async function quickStatus(id: string, status: string) {
    const err = await patchKey(id, { status });
    if (err) alert(err);
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Permanently delete this key?")) return;
    const res = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Could not delete the key");
      return;
    }
    router.refresh();
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return keys.filter((k) => {
      if (statusFilter !== "ALL" && k.status !== statusFilter) return false;
      if (!q) return true;
      return (
        k.key.toLowerCase().includes(q) ||
        (k.ownerEmail ?? "").toLowerCase().includes(q) ||
        (k.ownerUsername ?? "").toLowerCase().includes(q) ||
        (k.productName ?? "").toLowerCase().includes(q) ||
        (k.note ?? "").toLowerCase().includes(q)
      );
    });
  }, [keys, query, statusFilter]);

  function exportCsv() {
    const header = ["key", "status", "product", "owner", "email", "servers", "maxServers", "expires", "created", "note", "features"];
    const lines = filtered.map((k) =>
      [
        k.key, k.status, k.productName, k.ownerUsername, k.ownerEmail, k.serverCount, k.maxServers,
        k.expiresAt ?? "lifetime", k.createdAt, k.note, k.features.join(" "),
      ].map(csvCell).join(",")
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coreac-keys-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      {/* Araç çubuğu */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-72">
            <Icons.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search key, owner, product or note…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select className="input sm:w-44" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="ALL">All statuses</option>
            <option value="UNUSED">Unused</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REVOKED">Revoked</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={exportCsv} disabled={filtered.length === 0}>
            <Icons.download size={16} /> Export CSV
          </button>
          <button className="btn-primary" onClick={() => { resetForm(); setGenOpen(true); }}>
            <Icons.plus size={16} /> Generate keys
          </button>
        </div>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-base-850/60">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Features</th>
              <th className="px-4 py-3 font-medium">Servers</th>
              <th className="px-4 py-3 font-medium">Expires</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((k) => (
              <tr key={k.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-xs text-slate-200">{k.key}</code>
                    <CopyButton value={k.key} label="" className="h-6 w-6 justify-center px-0" />
                  </div>
                  {(k.productName || k.note) && (
                    <p className="mt-0.5 max-w-[260px] truncate text-[11px] text-slate-500" title={k.note ?? ""}>
                      {[k.productName, k.note].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3"><StatusBadge status={k.status} /></td>
                <td className="px-4 py-3">
                  {k.ownerEmail ? (
                    <div>
                      <p className="text-slate-300">{k.ownerUsername}</p>
                      <p className="text-[11px] text-slate-500">{k.ownerEmail}</p>
                    </div>
                  ) : (
                    <span className="text-slate-600">Unassigned</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="rounded-md bg-white/5 px-2 py-0.5 text-xs text-slate-400" title={k.features.map(featureLabel).join(", ")}>
                    {k.features.length} features
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-400">{k.serverCount}/{k.maxServers}</td>
                <td className="px-4 py-3 text-slate-400">
                  {k.expiresAt ? relativeDays(k.expiresAt) : "No expiry"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    <MiniBtn label="Manage" onClick={() => setManage(k)} />
                    {k.status === "SUSPENDED" || k.status === "REVOKED" ? (
                      <MiniBtn label="Activate" onClick={() => quickStatus(k.id, "ACTIVE")} />
                    ) : (
                      <MiniBtn label="Suspend" onClick={() => quickStatus(k.id, "SUSPENDED")} />
                    )}
                    <button
                      onClick={() => remove(k.id)}
                      title="Delete"
                      className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-slate-400 hover:border-rose-500/40 hover:text-rose-300"
                    >
                      <Icons.trash size={13} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No keys found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {manage && <ManageKey row={manage} onClose={() => setManage(null)} onSaved={() => { setManage(null); router.refresh(); }} />}

      {/* Üretim modalı */}
      <Modal open={genOpen} onClose={() => setGenOpen(false)} title="Generate licence keys">
        {generated ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <Icons.check size={18} />
              <span className="font-medium">{generated.length} {generated.length === 1 ? "key" : "keys"} generated</span>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {generated.map((g) => (
                <div key={g.key} className="flex items-center gap-2 rounded-lg border border-white/10 bg-base-900/60 px-3 py-2">
                  <code className="flex-1 font-mono text-sm text-slate-200">{g.key}</code>
                  <CopyButton value={g.key} label="" className="h-7 w-7 justify-center px-0" />
                </div>
              ))}
            </div>
            <CopyButton value={generated.map((g) => g.key).join("\n")} label="Copy all" className="w-full justify-center py-2" />
            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setGenOpen(false)}>Close</button>
              <button className="btn-primary flex-1" onClick={resetForm}>Generate more</button>
            </div>
          </div>
        ) : (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <p className="rounded-lg border border-white/10 bg-base-900/50 px-3 py-2 text-xs text-slate-400">
              Selling to a customer? <b className="text-slate-300">Orders → Record sale</b> also logs the payment and revenue.
            </p>
            <div>
              <label className="label">Product (optional)</label>
              <select className="input" value={productId} onChange={(e) => applyProductFeatures(e.target.value)}>
                <option value="">No product (custom)</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">Owner (optional)</label>
              <input
                className="input"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Email or username — blank to hand out as a code"
              />
            </div>

            <div>
              <label className="label">Features ({selected.size} selected)</label>
              <div className="space-y-3">
                {CATEGORIES.map((cat) => (
                  <div key={cat}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{cat}</p>
                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                      {FEATURES.filter((f) => f.category === cat).map((f) => {
                        const on = selected.has(f.key);
                        return (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => toggleFeature(f.key)}
                            className={cn(
                              "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition",
                              on ? "border-brand-500/50 bg-brand-500/10 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"
                            )}
                            title={f.description}
                          >
                            <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-brand-400 bg-brand-500 text-white" : "border-white/20")}>
                              {on && <Icons.check size={11} />}
                            </span>
                            {f.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Quantity</label>
                <input className="input" type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div>
                <label className="label">Servers per key</label>
                <input className="input" type="number" min={1} max={50} value={maxServers} onChange={(e) => setMaxServers(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={lifetime} onChange={(e) => setLifetime(e.target.checked)} className="h-4 w-4 rounded border-white/20 bg-base-900" />
                No expiry (lifetime)
              </label>
              {!lifetime && (
                <div className="mt-2">
                  <label className="label">Valid for (days)</label>
                  <input className="input" type="number" min={1} value={expiresInDays} onChange={(e) => setExpiresInDays(e.target.value)} />
                </div>
              )}
            </div>

            <div>
              <label className="label">Note (optional)</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Giveaway #12" />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setGenOpen(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={generate} disabled={loading}>
                {loading ? "Generating…" : `Generate ${Number(quantity) > 1 ? `${quantity} keys` : "key"}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function ManageKey({ row, onClose, onSaved }: { row: KeyRow; onClose: () => void; onSaved: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxServers, setMaxServers] = useState(String(row.maxServers));
  const [owner, setOwner] = useState(row.ownerUsername ?? "");
  const [note, setNote] = useState(row.note ?? "");

  async function run(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const err = await patchKey(row.id, body);
    setBusy(false);
    if (err) setError(err);
    else onSaved();
  }

  const locked = row.serverCount > 0;

  return (
    <Modal open onClose={onClose} title="Manage key">
      <div className="space-y-5">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-base-900/60 px-3 py-2">
          <code className="flex-1 font-mono text-sm text-slate-200">{row.key}</code>
          <StatusBadge status={row.status} />
        </div>

        <div>
          <label className="label">Validity · {row.expiresAt ? relativeDays(row.expiresAt) : "no expiry"}</label>
          <div className="grid grid-cols-4 gap-2">
            {[30, 90, 365].map((d) => (
              <button key={d} className="btn-secondary px-2 py-2 text-xs" disabled={busy} onClick={() => run({ extendDays: d })}>
                +{d === 365 ? "1 year" : `${d} days`}
              </button>
            ))}
            <button className="btn-secondary px-2 py-2 text-xs" disabled={busy || !row.expiresAt} onClick={() => run({ lifetime: true })}>
              Lifetime
            </button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <div>
            <label className="label">Servers allowed ({row.serverCount} in use)</label>
            <input className="input" type="number" min={Math.max(1, row.serverCount)} max={50} value={maxServers} onChange={(e) => setMaxServers(e.target.value)} />
          </div>
          <button className="btn-secondary" disabled={busy || Number(maxServers) === row.maxServers} onClick={() => run({ maxServers: Number(maxServers) })}>
            Save
          </button>
        </div>

        <div>
          <label className="label">Owner</label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input className="input" value={owner} disabled={locked} onChange={(e) => setOwner(e.target.value)} placeholder="Email or username" />
            <button className="btn-secondary" disabled={busy || locked || owner === (row.ownerUsername ?? "")} onClick={() => run({ owner: owner.trim() })}>
              {owner.trim() ? "Transfer" : "Unassign"}
            </button>
          </div>
          {locked && <p className="mt-1 text-xs text-slate-500">Servers are using this key — remove them before moving it to another account.</p>}
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-2">
          <div>
            <label className="label">Note</label>
            <input className="input" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className="btn-secondary" disabled={busy || note === (row.note ?? "")} onClick={() => run({ note })}>
            Save
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          {row.status !== "ACTIVE" && row.status !== "UNUSED" && (
            <button className="btn-secondary" disabled={busy} onClick={() => run({ status: row.serverCount > 0 ? "ACTIVE" : "UNUSED" })}>
              Reactivate
            </button>
          )}
          {row.status !== "SUSPENDED" && (
            <button className="btn-secondary" disabled={busy} onClick={() => run({ status: "SUSPENDED" })}>Suspend</button>
          )}
          {row.status !== "REVOKED" && (
            <button className="btn-danger" disabled={busy} onClick={() => { if (confirm("Revoke this key? Servers using it stop working.")) run({ status: "REVOKED" }); }}>
              Revoke
            </button>
          )}
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}
      </div>
    </Modal>
  );
}

function MiniBtn({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:bg-white/10",
        danger && "hover:border-rose-500/40 hover:text-rose-300"
      )}
    >
      {label}
    </button>
  );
}
