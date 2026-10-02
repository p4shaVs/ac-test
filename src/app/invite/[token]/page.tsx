import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { Logo } from "@/components/ui";
import { Icons, type IconName } from "@/components/icons";
import { PERMISSIONS, ROLES, isMemberRole, parsePermissions, roleLabel } from "@/lib/team";
import { hashInviteToken, inviteState, isInviteTokenShape, maskEmail } from "@/lib/team-ops";
import { InviteActions, SignOutButton } from "./invite-actions";

export const metadata: Metadata = { title: "Team invite", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATE_TEXT: Record<string, { icon: IconName; title: string; text: string }> = {
  invalid: { icon: "link", title: "This invite link is not valid", text: "Check that you copied the whole link, or ask for a new one." },
  expired: { icon: "clock", title: "This invite has expired", text: "Invites last a week. Ask whoever invited you for a new link." },
  revoked: { icon: "x", title: "This invite was withdrawn", text: "It was revoked or replaced by a newer link. Ask for a new one if you still need access." },
  declined: { icon: "x", title: "This invite was declined", text: "Ask for a new one if you changed your mind." },
  accepted: { icon: "check", title: "This invite has been used", text: "Each link works once. If it was you, the server is already in your panel." },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#070708] px-4 py-12">
      <Link href="/" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-[440px]">{children}</div>
    </div>
  );
}

function StateCard({ state, signedIn }: { state: string; signedIn: boolean }) {
  const s = STATE_TEXT[state] ?? STATE_TEXT.invalid;
  const Icon = Icons[s.icon];
  return (
    <Shell>
      <div className="rounded-2xl border border-white/10 bg-[#0e0e10] p-7 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-300">
          <Icon size={20} />
        </span>
        <h1 className="mt-5 text-lg font-semibold text-white">{s.title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
        <Link href={signedIn ? "/dashboard" : "/login"} className="btn-secondary mt-6 inline-flex h-9 px-4 text-xs">
          {signedIn ? "Go to your dashboard" : "Sign in"}
        </Link>
      </div>
    </Shell>
  );
}

export default async function InvitePage({ params }: { params: { token: string } }) {
  const token = params.token;
  const user = await getCurrentUser();
  if (!isInviteTokenShape(token)) return <StateCard state="invalid" signedIn={!!user} />;

  const invite = await db.serverInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { server: { select: { id: true, name: true, ownerId: true } } },
  });
  if (!invite || !isMemberRole(invite.role)) return <StateCard state="invalid" signedIn={!!user} />;
  const state = inviteState(invite);
  if (state !== "pending") return <StateCard state={state} signedIn={!!user} />;

  const inviter = await db.user.findUnique({ where: { id: invite.createdById }, select: { username: true } });
  const perms = parsePermissions(invite.permissions);
  const next = `/invite/${token}`;
  const forMe = user ? (invite.userId ? invite.userId === user.id : invite.email === user.email.toLowerCase()) : false;
  const member = user
    ? await db.serverMember.findUnique({ where: { serverId_userId: { serverId: invite.serverId, userId: user.id } } })
    : null;
  const days = Math.max(1, Math.ceil((invite.expiresAt.getTime() - Date.now()) / 86_400_000));

  return (
    <Shell>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e0e10]">
        <div className="border-b border-white/[0.06] bg-gradient-to-br from-white/[0.05] to-transparent px-7 py-6">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-500">Panel team invite</p>
          <h1 className="mt-2 text-xl font-semibold leading-snug text-white">
            {inviter?.username ?? "Someone"} invited you to help run <span className="underline decoration-white/30 underline-offset-4">{invite.server.name}</span>
          </h1>
          <p className="mt-3 flex items-center gap-2 text-[13px] text-slate-400">
            as
            <span className="inline-flex h-6 items-center rounded-md border border-white/25 bg-white/[0.08] px-2 text-[11px] font-semibold text-white">
              {roleLabel(invite.role)}
            </span>
            <span className="text-slate-600">·</span> link valid for {days} more day{days === 1 ? "" : "s"}
          </p>
        </div>

        <div className="px-7 py-5">
          <p className="text-[12.5px] text-slate-500">{ROLES[invite.role].desc}</p>
          <ul className="mt-4 space-y-2">
            <li className="flex items-center gap-2.5 text-[13px] text-slate-200">
              <Icons.eye size={14} className="text-slate-400" /> See every page and log of this server
            </li>
            {PERMISSIONS.map((p) => {
              const on = perms.includes(p.key);
              return (
                <li key={p.key} className={on ? "flex items-center gap-2.5 text-[13px] text-slate-200" : "flex items-center gap-2.5 text-[13px] text-slate-600 line-through decoration-slate-700"}>
                  {on ? <Icons.check size={14} className="text-white" /> : <Icons.x size={14} />}
                  {p.label}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="border-t border-white/[0.06] px-7 py-5">
          {!user ? (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-slate-400">
                Sign in with {invite.userId ? "the account" : "an account using"} <b className="font-medium text-slate-200">{maskEmail(invite.email)}</b> to accept.
                {!invite.userId && " No account yet? Create one with exactly that e-mail."}
              </p>
              <div className="flex gap-2">
                <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary h-10 flex-1 justify-center text-sm">
                  Sign in
                </Link>
                <Link href={`/register?next=${encodeURIComponent(next)}`} className="btn-secondary h-10 flex-1 justify-center text-sm">
                  Create account
                </Link>
              </div>
            </div>
          ) : user.id === invite.server.ownerId ? (
            <p className="text-[13px] text-slate-400">You own this server — you already have every right on it.</p>
          ) : member ? (
            <div className="space-y-3">
              <p className="text-[13px] text-slate-400">You are already on this team.</p>
              <Link href={`/dashboard/servers/${invite.serverId}`} className="btn-primary h-10 w-full justify-center text-sm">
                Open {invite.server.name}
              </Link>
            </div>
          ) : forMe ? (
            <InviteActions token={token} serverName={invite.server.name} username={user.username} />
          ) : (
            <div className="space-y-3">
              <p className="text-[12.5px] leading-relaxed text-slate-400">
                This invite is for <b className="font-medium text-slate-200">{maskEmail(invite.email)}</b>, but you are signed in as{" "}
                <b className="font-medium text-slate-200">{user.username}</b>. Sign out and use the invited account.
              </p>
              <SignOutButton next={next} />
            </div>
          )}
        </div>
      </div>
      <p className="mt-4 text-center text-[11.5px] text-slate-600">
        Not expecting this? Just ignore it — nothing happens unless you accept.
      </p>
    </Shell>
  );
}
