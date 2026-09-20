"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Card, StatusBadge } from "@/components/ui";
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
const categoryLabel: Record<string, string> = {
  Detection: "Detection",
  Protection: "Protection",
  Panel: "Panel",
  Advanced: "Advanced",
};

export function KeyManager({
  keys,
  products,
}: {
  keys: KeyRow[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [genOpen, setGenOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  // Üretim formu state
  const [productId, setProductId] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quantity, setQuantity] = useState("1");
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
          ownerEmail: ownerEmail || undefined,
          features: Array.from(selected),
          maxServers: 1, // her anahtar tek sunucu için
          quantity: Number(quantity) || 1,
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
    setOwnerEmail("");
    setQuantity("1");
    setLifetime(true);
    setNote("");
    setError(null);
  }

  async function updateStatus(id: string, status: string) {
    await fetch(`/api/admin/keys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Permanently delete this key?")) return;
    const res = await fetch(`/api/admin/keys/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Silinemedi");
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
        (k.productName ?? "").toLowerCase().includes(q)
      );
    });
  }, [keys, query, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Araç çubuğu */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative sm:w-72">
            <Icons.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input pl-9"
              placeholder="Search key, email or product…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select
            className="input sm:w-44"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All statuses</option>
            <option value="UNUSED">Unused</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REVOKED">Cancel</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
        <button className="btn-primary" onClick={() => { resetForm(); setGenOpen(true); }}>
          <Icons.plus size={16} /> Generate keys
        </button>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-base-850/60">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Key</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Owner</th>
              <th className="px-4 py-3 font-medium">Feature</th>
              <th className="px-4 py-3 font-medium">Server</th>
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
                  {k.productName && <p className="mt-0.5 text-[11px] text-slate-500">{k.productName}</p>}
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
                    {k.status === "SUSPENDED" || k.status === "REVOKED" ? (
                      <MiniBtn label="Activate" onClick={() => updateStatus(k.id, "ACTIVE")} />
                    ) : (
                      <MiniBtn label="Suspend" onClick={() => updateStatus(k.id, "SUSPENDED")} />
                    )}
                    {k.status !== "REVOKED" && (
                      <MiniBtn label="Cancel" danger onClick={() => updateStatus(k.id, "REVOKED")} />
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

      {/* Üretim modalı */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate licence key"
      >
        {generated ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-300">
              <Icons.check size={18} />
              <span className="font-medium">{generated.length} keys generated</span>
            </div>
            <div className="max-h-60 space-y-2 overflow-y-auto">
              {generated.map((g) => (
                <div key={g.key} className="flex items-center gap-2 rounded-lg border border-white/10 bg-base-900/60 px-3 py-2">
                  <code className="flex-1 font-mono text-sm text-slate-200">{g.key}</code>
                  <CopyButton value={g.key} label="" className="h-7 w-7 justify-center px-0" />
                </div>
              ))}
            </div>
            <CopyButton
              value={generated.map((g) => g.key).join("\n")}
              label="Copy all"
              className="w-full justify-center py-2"
            />
            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setGenOpen(false)}>Close</button>
              <button className="btn-primary flex-1" onClick={resetForm}>Generate more</button>
            </div>
          </div>
        ) : (
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
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
              <label className="label">Owner email (optional)</label>
              <input
                className="input"
                type="email"
                value={ownerEmail}
                onChange={(e) => setOwnerEmail(e.target.value)}
                placeholder="customer@example.com — leave blank to hand out as a code"
              />
            </div>

            <div>
              <label className="label">Features ({selected.size} selected)</label>
              <div className="space-y-3">
                {CATEGORIES.map((cat) => (
                  <div key={cat}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      {categoryLabel[cat]}
                    </p>
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
                              on
                                ? "border-brand-500/50 bg-brand-500/10 text-white"
                                : "border-white/10 text-slate-400 hover:bg-white/5"
                            )}
                            title={f.description}
                          >
                            <span className={cn(
                              "grid h-4 w-4 shrink-0 place-items-center rounded border",
                              on ? "border-brand-400 bg-brand-500 text-white" : "border-white/20"
                            )}>
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

            <div>
              <label className="label">Quantity</label>
              <input className="input" type="number" min={1} max={100} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Each key is valid for a single server.</p>
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
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Campaign #12" />
            </div>

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <div className="flex gap-2 pt-2">
              <button className="btn-secondary flex-1" onClick={() => setGenOpen(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={generate} disabled={loading}>
                {loading ? "Generating…" : `${quantity} Generate keys`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function MiniBtn({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
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
