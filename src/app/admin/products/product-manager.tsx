"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { Card, Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { FEATURES, featureLabel } from "@/lib/features";
import { cn, formatMoney } from "@/lib/utils";

export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceCents: number;
  currency: string;
  interval: string;
  features: string[];
  active: boolean;
  orders: number;
  keys: number;
}

const CATEGORIES = ["Detection", "Protection", "Panel", "Advanced"] as const;
const categoryLabel: Record<string, string> = {
  Detection: "Detection", Protection: "Protection", Panel: "Panel", Advanced: "Advanced",
};

const emptyForm = {
  id: "",
  slug: "",
  name: "",
  description: "",
  price: "29.99",
  currency: "EUR",
  interval: "MONTHLY",
  active: true,
  features: new Set<string>(),
};

export function ProductManager({ products }: { products: ProductRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = !!form.id;

  function openNew() {
    setForm({ ...emptyForm, features: new Set() });
    setError(null);
    setOpen(true);
  }
  function openEdit(p: ProductRow) {
    setForm({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      price: (p.priceCents / 100).toFixed(2),
      currency: p.currency,
      interval: p.interval,
      active: p.active,
      features: new Set(p.features),
    });
    setError(null);
    setOpen(true);
  }

  function toggleFeature(k: string) {
    setForm((f) => {
      const next = new Set(f.features);
      next.has(k) ? next.delete(k) : next.add(k);
      return { ...f, features: next };
    });
  }

  async function save() {
    setLoading(true);
    setError(null);
    const payload = {
      slug: form.slug,
      name: form.name,
      description: form.description,
      priceCents: Math.round(parseFloat(form.price || "0") * 100),
      currency: form.currency.toUpperCase(),
      interval: form.interval,
      active: form.active,
      features: Array.from(form.features),
    };
    try {
      const res = await fetch(
        editing ? `/api/admin/products/${form.id}` : "/api/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Kaydedilemedi");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleActive(p: ProductRow) {
    await fetch(`/api/admin/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !p.active }),
    });
    router.refresh();
  }

  async function remove(p: ProductRow) {
    if (!confirm(`"${p.name}" — delete or deactivate it?`)) return;
    await fetch(`/api/admin/products/${p.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={openNew}>
          <Icons.plus size={16} /> New product
        </button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-500">
          No products yet. Create your first plan.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id} className="flex flex-col">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white">{p.name}</h3>
                  <p className="text-xs text-slate-500">/{p.slug}</p>
                </div>
                {p.active ? <Badge tone="green" dot>Active</Badge> : <Badge tone="gray">Inactive</Badge>}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-400">{p.description}</p>
              <div className="mt-3 text-2xl font-bold text-white">
                {formatMoney(p.priceCents, p.currency)}
                <span className="ml-1 text-xs font-normal text-slate-500">
                  {p.interval === "MONTHLY" ? "/ay" : p.interval === "YEARLY" ? "/year" : "lifetime"}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {p.features.slice(0, 4).map((f) => (
                  <span key={f} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                    {featureLabel(f)}
                  </span>
                ))}
                {p.features.length > 4 && (
                  <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">
                    +{p.features.length - 4}
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                <span>{p.orders} sales</span>
                <span>{p.keys} anahtar</span>
              </div>
              <div className="mt-4 flex gap-2 border-t border-white/5 pt-3">
                <button className="btn-secondary flex-1 text-xs" onClick={() => openEdit(p)}>
                  Edit
                </button>
                <button className="btn-ghost text-xs" onClick={() => toggleActive(p)}>
                  {p.active ? "Deactivate" : "Activate"}
                </button>
                <button
                  className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:text-rose-300"
                  onClick={() => remove(p)}
                >
                  <Icons.trash size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Edit product" : "New product"}>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Ad</label>
              <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Slug</label>
              <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="premium" disabled={editing} />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Price</label>
              <input className="input" type="number" step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className="label">Currency</label>
              <select className="input" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="TRY">TRY</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
            <div>
              <label className="label">Billing period</label>
              <select className="input" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>
                <option value="MONTHLY">Monthly</option>
                <option value="YEARLY">Yearly</option>
                <option value="LIFETIME">Lifetime</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label">Features ({form.features.size})</label>
            <div className="space-y-2">
              {CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">{categoryLabel[cat]}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {FEATURES.filter((f) => f.category === cat).map((f) => {
                      const on = form.features.has(f.key);
                      return (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => toggleFeature(f.key)}
                          className={cn(
                            "flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition",
                            on ? "border-brand-500/50 bg-brand-500/10 text-white" : "border-white/10 text-slate-400 hover:bg-white/5"
                          )}
                        >
                          <span className={cn("grid h-4 w-4 place-items-center rounded border", on ? "border-brand-400 bg-brand-500 text-white" : "border-white/20")}>
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

          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-4 w-4 rounded border-white/20 bg-base-900" />
            On sale
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button className="btn-secondary flex-1" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn-primary flex-1" onClick={save} disabled={loading}>
              {loading ? "Kaydediliyor…" : editing ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
