import { relativeDays, cn } from "@/lib/utils";

/** Who counts as "the anti-cheat" rather than a staff member in Ban.bannedBy. */
export const AUTO_BANNERS = new Set(["AntiCheat", "CoreAC", "System"]);

type StatusInput = { active: boolean; permanent: boolean; expiresAt: string | null; falsePositive: boolean };

export function banStatus(b: StatusInput) {
  if (b.falsePositive) return { label: "False positive", cls: "border-amber-400/25 bg-amber-400/[0.08] text-amber-200", dot: "bg-amber-300" };
  if (!b.active) return { label: "Lifted", cls: "border-white/10 bg-white/[0.03] text-slate-400", dot: "bg-slate-500" };
  if (b.permanent) return { label: "Permanent", cls: "border-rose-400/25 bg-rose-400/[0.08] text-rose-200", dot: "bg-rose-400" };
  const left = relativeDays(b.expiresAt);
  return { label: left === "Expired" || left === "No expiry" ? left : left + " left", cls: "border-rose-400/20 bg-rose-400/[0.05] text-rose-200/90", dot: "bg-rose-300" };
}

export function StatusPill({ b }: { b: StatusInput }) {
  const s = banStatus(b);
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[11px] font-medium", s.cls)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
