"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { StatusBadge } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { Icons } from "@/components/icons";
import { formatMoney, formatDateTime } from "@/lib/utils";

export interface OrderRow {
  id: string;
  createdAt: string;
  customer: string;
  email: string;
  product: string;
  amountCents: number;
  currency: string;
  status: string;
  provider: string;
  reference: string | null;
  key: string | null;
  keyStatus: string | null;
}
export interface SaleProduct {
  id: string;
  name: string;
  priceCents: number;
  currency: string;
  interval: string;
}

const INTERVAL: Record<string, string> = { MONTHLY: "30 days", YEARLY: "1 year", LIFETIME: "lifetime" };

export function OrdersManager({ orders, products }: { orders: OrderRow[]; products: SaleProduct[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [maxServers, setMaxServers] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ key: string; customer: string } | null>(null);

  const product = products.find((p) => p.id === productId);

  function openForm() {
    setCustomer("");
    setProductId(products[0]?.id ?? "");
    setAmount("");
    setReference("");
    setMaxServers("1");
    setError(null);
    setDone(null);
    setOpen(true);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const cents = amount.trim() === "" ? undefined : Math.round(Number(amount.replace(",", ".")) * 100);
      if (cents !== undefined && (!Number.isFinite(cents) || cents < 0)) throw new Error("Enter a valid amount");
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customer.trim(),
          productId,
          amountCents: cents,
          reference: reference.trim() || undefined,
          maxServers: Number(maxServers) || 1,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not record the sale");
      setDone({ key: json.data.key, customer: json.data.customer });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function refund(o: OrderRow) {
    if (!confirm(`Refund ${o.customer}'s ${o.product} order? Its licence key is revoked and every server using it stops working.`)) return;
    const res = await fetch(`/api/admin/orders/${o.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refund: true }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error ?? "Refund failed");
      return;
    }
    router.refresh();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) =>
      [o.customer, o.email, o.product, o.reference ?? "", o.key ?? ""].some((v) => v.toLowerCase().includes(q))
    );
  }, [orders, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Icons.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="input pl-9"
            placeholder="Search customer, product, reference or key…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="btn-primary" onClick={openForm} disabled={products.length === 0}>
          <Icons.plus size={16} /> Record sale
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-base-850/60">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">Amount</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Licence key</th>
              <th className="px-4 py-3 font-medium">Reference</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="whitespace-nowrap px-4 py-3 text-slate-400">{formatDateTime(o.createdAt)}</td>
                <td className="px-4 py-3">
                  <p className="text-slate-200">{o.customer}</p>
                  <p className="text-[11px] text-slate-500">{o.email}</p>
                </td>
                <td className="px-4 py-3 text-slate-300">{o.product}</td>
                <td className="whitespace-nowrap px-4 py-3 font-semibold text-emerald-300">{formatMoney(o.amountCents, o.currency)}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3">
                  {o.key ? (
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-xs text-slate-300">{o.key}</code>
                      <CopyButton value={o.key} label="" className="h-6 w-6 justify-center px-0" />
                    </div>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
                <td className="max-w-[180px] truncate px-4 py-3 text-slate-500" title={o.reference ?? ""}>
                  {o.reference ?? <span className="text-slate-600">{o.provider}</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  {o.status === "PAID" && (
                    <button
                      onClick={() => refund(o)}
                      className="rounded-lg border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 transition hover:border-rose-500/40 hover:bg-white/10 hover:text-rose-300"
                    >
                      Refund
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                  {orders.length === 0 ? "No orders yet — record your first Discord sale." : "No orders match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={done ? "Sale recorded" : "Record a sale"}>
        {done ? (
          <div className="space-y-4">
            <p className="flex items-center gap-2 text-sm text-emerald-300">
              <Icons.check size={17} /> The key is already on <b>{done.customer}</b>&apos;s account (My Licences).
            </p>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-base-900/60 px-3 py-2">
              <code className="flex-1 font-mono text-sm text-slate-200">{done.key}</code>
              <CopyButton value={done.key} label="" className="h-7 w-7 justify-center px-0" />
            </div>
            <p className="text-xs text-slate-500">Paste it into the Discord ticket too, if the customer asks for it.</p>
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setOpen(false)}>Close</button>
              <button className="btn-primary flex-1" onClick={openForm}>Record another</button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="label">Customer</label>
              <input
                className="input"
                value={customer}
                onChange={(e) => setCustomer(e.target.value)}
                placeholder="Panel email or username"
                autoFocus
              />
              <p className="mt-1 text-xs text-slate-500">They need a panel account — the purchase page tells them to share it in the ticket.</p>
            </div>
            <div>
              <label className="label">Product</label>
              <select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.priceCents, p.currency)} ({INTERVAL[p.interval] ?? p.interval})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Amount paid</label>
                <input
                  className="input"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={product ? (product.priceCents / 100).toFixed(2) : "0.00"}
                />
              </div>
              <div>
                <label className="label">Servers per key</label>
                <input className="input" type="number" min={1} max={50} value={maxServers} onChange={(e) => setMaxServers(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">Reference (optional)</label>
              <input
                className="input"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Ticket #, PayPal ID, note…"
              />
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button className="btn-secondary flex-1" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn-primary flex-1" onClick={submit} disabled={busy || !customer.trim() || !productId}>
                {busy ? "Recording…" : "Record sale & issue key"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
