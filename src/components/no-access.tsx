import Link from "next/link";
import { Icons } from "@/components/icons";
import { PERMISSIONS, roleLabel, type Permission, type Role } from "@/lib/team";

/** Shown instead of a page the team member's role cannot open. */
export function NoAccess({ serverId, perm, role }: { serverId: string; perm: Permission | "owner"; role: Role }) {
  const needs = perm === "owner" ? null : PERMISSIONS.find((p) => p.key === perm);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400">
        <Icons.lock size={20} />
      </span>
      <h1 className="mt-5 text-lg font-semibold text-white">Your role can't open this page</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">
        You are a <b className="font-medium text-slate-200">{roleLabel(role)}</b> on this server.{" "}
        {needs ? (
          <>
            This page needs the <b className="font-medium text-slate-200">“{needs.label}”</b> permission — {needs.desc.charAt(0).toLowerCase() + needs.desc.slice(1)}
          </>
        ) : (
          "Only the server owner can open it."
        )}
      </p>
      {needs && <p className="mt-2 text-[13px] text-slate-500">The owner or an Admin can add it on the Team page.</p>}
      <div className="mt-6 flex gap-2">
        <Link href={`/dashboard/servers/${serverId}`} className="btn-secondary h-9 px-4 text-xs">
          <Icons.dashboard size={14} /> Server overview
        </Link>
        <Link href={`/dashboard/servers/${serverId}/team`} className="btn-ghost h-9 px-4 text-xs">
          <Icons.users size={14} /> Team
        </Link>
      </div>
    </div>
  );
}
