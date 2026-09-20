"use client";

import { useState } from "react";
import { Icons } from "./icons";
import { cn } from "@/lib/utils";

export function CopyButton({
  value,
  className,
  label,
}: {
  value: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard yoksa sessiz geç */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-white/10",
        className
      )}
      title="Copy"
    >
      {copied ? (
        <Icons.check size={14} className="text-emerald-400" />
      ) : (
        <Icons.copy size={14} />
      )}
      {label ?? (copied ? "Copied" : "Copy")}
    </button>
  );
}

/** Gizli değer + göster/gizle + kopyala (lisans anahtarı için). */
export function SecretField({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="flex-1 truncate rounded-lg border border-white/10 bg-base-900/80 px-3 py-2 font-mono text-sm text-slate-200">
        {shown ? value : "•".repeat(Math.min(value.length, 28))}
      </code>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="grid h-9 w-9 place-items-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
        title={shown ? "Hide" : "Show"}
      >
        {shown ? <Icons.eyeOff size={16} /> : <Icons.eye size={16} />}
      </button>
      <CopyButton value={value} label="" className="h-9 w-9 justify-center px-0" />
    </div>
  );
}
