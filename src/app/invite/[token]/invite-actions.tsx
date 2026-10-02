"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";

/** Accept / decline buttons — shared by the invite link page and the dashboard. */
export function InviteActions({
  token,
  inviteId,
  serverName,
  username,
  compact = false,
}: {
  token?: string;
  inviteId?: string;
  serverName: string;
  username?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function act(action: "accept" | "decline") {
    if (action === "decline" && !confirm(`Decline the invite to ${serverName}?`)) return;
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, action } : { inviteId, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Something went wrong");
      if (action === "accept") {
        setDone("Welcome aboard — opening the server…");
        router.push(`/dashboard/servers/${json.data.serverId}`);
        router.refresh();
      } else {
        setDone("Invite declined.");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  if (done) return <p className="flex items-center gap-2 text-[13px] text-slate-300"><Icons.check size={14} /> {done}</p>;

  return (
    <div className="space-y-3">
      {!compact && username && (
        <p className="text-[12.5px] text-slate-400">
          Joining as <b className="font-medium text-slate-200">{username}</b>.
        </p>
      )}
      {error && <p className="rounded-lg border border-rose-400/25 bg-rose-400/[0.06] px-3 py-2 text-[12.5px] text-rose-200">{error}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => act("accept")}
          disabled={busy !== null}
          className={compact ? "btn-primary h-8 px-3 text-xs" : "btn-primary h-10 flex-1 justify-center text-sm"}
        >
          <Icons.check size={compact ? 13 : 15} /> {busy === "accept" ? "Joining…" : "Accept"}
        </button>
        <button
          type="button"
          onClick={() => act("decline")}
          disabled={busy !== null}
          className={compact ? "btn-secondary h-8 px-3 text-xs" : "btn-secondary h-10 justify-center px-4 text-sm"}
        >
          {busy === "decline" ? "…" : "Decline"}
        </button>
      </div>
    </div>
  );
}

export function SignOutButton({ next }: { next: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        router.push(`/login?next=${encodeURIComponent(next)}`);
        router.refresh();
      }}
      className="btn-secondary h-10 w-full justify-center text-sm"
    >
      <Icons.logout size={15} /> {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
