"use client";

import Link from "next/link";
import { useState } from "react";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

// WaveShield referansındaki üst bilgi satırı: Server Status / Server IP /
// License Key (göster+kopyala) / License Expiry.
export function ServerInfoCards({
  serverName,
  online,
  ip,
  licenseKey,
  expiryText,
  expirySoon,
  settingsHref,
}: {
  serverName: string;
  online: boolean;
  ip: string | null;
  licenseKey: string | null;
  expiryText: string;
  expirySoon: boolean;
  settingsHref: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyKey() {
    if (!licenseKey) return;
    navigator.clipboard?.writeText(licenseKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const masked = licenseKey ? "•".repeat(Math.min(28, licenseKey.length)) : "—";

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Server Status */}
      <InfoCard icon="shieldCheck" label="Server Status">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", online ? "bg-emerald-400" : "bg-slate-600")} />
          <span className="truncate text-lg font-semibold text-white">{serverName}</span>
        </div>
      </InfoCard>

      {/* Server IP */}
      <InfoCard
        icon="server"
        label="Server IP"
        action={
          <Link href={settingsHref} className="rounded-lg bg-brand-500/15 px-2.5 py-1 text-[11px] font-medium text-brand-200 ring-1 ring-inset ring-brand-500/30 transition hover:bg-brand-500/25">
            Manage
          </Link>
        }
      >
        <span className="text-lg font-semibold text-white">{ip || "Not set"}</span>
      </InfoCard>

      {/* License Key */}
      <InfoCard
        icon="key"
        label="License Key"
        action={
          <div className="flex items-center gap-1">
            <button onClick={() => setRevealed((r) => !r)} title={revealed ? "Hide" : "Reveal"} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-slate-200">
              {revealed ? <Icons.eyeOff size={15} /> : <Icons.eye size={15} />}
            </button>
            <button onClick={copyKey} title="Copy" className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-slate-200">
              {copied ? <Icons.check size={15} className="text-emerald-400" /> : <Icons.copy size={15} />}
            </button>
          </div>
        }
      >
        <span className="block truncate font-mono text-sm text-slate-300">
          {revealed ? (licenseKey || "—") : masked}
        </span>
      </InfoCard>

      {/* License Expiry */}
      <InfoCard icon="activity" label="License Expiry">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-white">{expiryText}</span>
          <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset", expirySoon ? "bg-amber-500/10 text-amber-300 ring-amber-500/20" : "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20")}>
            {expirySoon ? "renew soon" : "active"}
          </span>
        </div>
      </InfoCard>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  action,
  children,
}: {
  icon: keyof typeof Icons;
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const Icon = Icons[icon];
  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Icon size={15} className="text-slate-400" /> {label}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}
