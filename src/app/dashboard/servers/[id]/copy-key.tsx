"use client";

import { useState } from "react";
import { Icons } from "@/components/icons";

/** Masked licence key with reveal + copy. */
export function CopyKey({ value }: { value: string | null }) {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="font-mono text-xs text-slate-500">no licence</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <code className="truncate font-mono text-xs text-slate-300">{shown ? value : value.slice(0, 7) + "•".repeat(12)}</code>
      <button onClick={() => setShown((s) => !s)} title={shown ? "Hide" : "Show"} className="text-slate-500 transition hover:text-slate-200">
        {shown ? <Icons.eyeOff size={13} /> : <Icons.eye size={13} />}
      </button>
      <button
        title="Copy"
        onClick={() => navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); })}
        className="text-slate-500 transition hover:text-slate-200"
      >
        {copied ? <Icons.check size={13} /> : <Icons.copy size={13} />}
      </button>
    </span>
  );
}
