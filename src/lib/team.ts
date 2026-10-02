// =============================================================================
// Panel team — who besides the owner may open a server in the panel, and what
// they may do there.
//
//   OWNER      the account that owns the server. Everything, and the things
//              nobody else can ever get: deleting the server, the server API
//              token, the licence and the installer files.
//   ADMIN      every permission below; manages Moderators and Viewers.
//   MODERATOR  sees everything, moderates players.
//   VIEWER     sees everything, changes nothing.
//
// Roles are presets: a member's effective rights are the `permissions` stored
// on their membership, so an owner can give a Moderator the console, say.
// Two rules keep that safe:
//   * you only manage members ranked BELOW you (an Admin cannot touch another
//     Admin or the owner), and
//   * you can only hand out permissions you hold yourself.
// Seeing the server (every page, every log) is implied by membership.
// =============================================================================

import { parseJson } from "./utils";

export const PERMISSIONS = [
  {
    key: "moderate",
    label: "Moderate players",
    desc: "Kick, warn, ban and unban players, offline bans, ban notes, fixing false bans, screenshots.",
  },
  {
    key: "console",
    label: "Console & resources",
    desc: "Run console commands on the game server and start, stop or restart resources.",
  },
  {
    key: "config",
    label: "Configuration",
    desc: "Protections and punishments, server settings, models, Trust Whitelist, protected events, event log, network policy, config library.",
  },
  {
    key: "admins",
    label: "In-game admins",
    desc: "Who gets the in-game admin menu and what they can do with it.",
  },
  {
    key: "settings",
    label: "Server settings",
    desc: "Server name, address and the Discord webhook.",
  },
  {
    key: "team",
    label: "Team",
    desc: "Invite, change and remove staff ranked below them.",
  },
] as const;

export type Permission = (typeof PERMISSIONS)[number]["key"];
export const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.key) as Permission[];

export type MemberRole = "ADMIN" | "MODERATOR" | "VIEWER";
export type Role = "OWNER" | MemberRole;

export const ROLES: Record<MemberRole, { label: string; desc: string; perms: Permission[] }> = {
  ADMIN: {
    label: "Admin",
    desc: "Runs the server with you: every permission, and manages Moderators and Viewers.",
    perms: ["moderate", "console", "config", "admins", "settings", "team"],
  },
  MODERATOR: {
    label: "Moderator",
    desc: "Sees everything and handles players: bans, kicks, warnings, unbans, appeals.",
    perms: ["moderate"],
  },
  VIEWER: {
    label: "Viewer",
    desc: "Sees everything, changes nothing — for trial staff, developers or auditors.",
    perms: [],
  },
};

const RANK: Record<Role, number> = { OWNER: 3, ADMIN: 2, MODERATOR: 1, VIEWER: 0 };

export function roleLabel(role: Role): string {
  return role === "OWNER" ? "Owner" : ROLES[role].label;
}

export function isMemberRole(v: unknown): v is MemberRole {
  return v === "ADMIN" || v === "MODERATOR" || v === "VIEWER";
}

/** Known permissions only, no duplicates, in canonical order. */
export function sanitizePermissions(input: unknown): Permission[] {
  const set = new Set(Array.isArray(input) ? input : []);
  return ALL_PERMISSIONS.filter((p) => set.has(p));
}

export function parsePermissions(raw: string | null | undefined): Permission[] {
  return sanitizePermissions(parseJson<unknown>(raw ?? "[]", []));
}

/** Effective permissions of an actor. */
export function permissionsOf(role: Role, stored: Permission[]): Set<Permission> {
  if (role === "OWNER") return new Set(ALL_PERMISSIONS);
  return new Set(stored);
}

/**
 * Can `actor` invite, change or remove someone who is (or would become) `target`?
 * Requires the team permission and a strictly higher rank — and the new
 * permissions must be ones the actor holds.
 */
export function canManage(
  actor: { role: Role; perms: Set<Permission> },
  target: { role: Role },
  grant?: Permission[]
): boolean {
  if (target.role === "OWNER") return false;
  if (!actor.perms.has("team")) return false;
  if (RANK[actor.role] <= RANK[target.role]) return false;
  if (grant && grant.some((p) => !actor.perms.has(p))) return false;
  return true;
}

/**
 * May `actor` change someone's permissions from `before` to `after`? Only the
 * permissions that actually change count: you may add or take away what you
 * hold yourself, and whatever you do not hold must stay exactly as it was (so
 * an Admin without the console cannot strip — or grant — the console the owner
 * gave a Moderator).
 */
export function permissionChangeAllowed(
  actor: { perms: Set<Permission> },
  before: readonly Permission[],
  after: readonly Permission[]
): boolean {
  const b = new Set(before);
  const a = new Set(after);
  for (const p of ALL_PERMISSIONS) {
    if (b.has(p) !== a.has(p) && !actor.perms.has(p)) return false;
  }
  return true;
}

export const MAX_MEMBERS = 25;
export const MAX_PENDING_INVITES = 20;
export const INVITE_DAYS = 7;

export function rankOf(role: Role): number {
  return RANK[role];
}

/** Roles `actor` may hand out (strictly below their own). */
export function assignableRoles(actor: { role: Role; perms: Set<Permission> }): MemberRole[] {
  if (!actor.perms.has("team")) return [];
  return (Object.keys(ROLES) as MemberRole[]).filter((r) => RANK[actor.role] > RANK[r]);
}

/** What each permission unlocks in the panel (pages and actions). Used for the nav and the "no access" page. */
export const PAGE_PERMISSION: Record<string, Permission | "owner" | undefined> = {
  monitoring: "moderate",
  rules: "config",
  events: "config",
  blacklist: "config",
  whitelist: "config",
  "config-library": "config",
  setup: "config",
  console: "console",
  resources: "console",
  admins: "admins",
  settings: "settings",
};

/**
 * May someone holding `perms` (as owner when `isOwner`) open the server page
 * whose first path segment is `segment` ("" = overview)? Used to trim the menu
 * and the command palette — the pages and APIs enforce it on their own.
 */
export function canOpenPage(segment: string, perms: readonly Permission[], isOwner: boolean): boolean {
  const need = PAGE_PERMISSION[segment];
  if (!need) return true;
  if (need === "owner") return isOwner;
  return isOwner || perms.includes(need);
}

export interface Access {
  isOwner: boolean;
  role: Role;
  perms: Set<Permission>;
  memberId: string | null;
}

export function can(access: Pick<Access, "perms">, perm: Permission): boolean {
  return access.perms.has(perm);
}

/** Serialisable form for client components. */
export function accessSummary(a: Access): { role: Role; perms: Permission[]; isOwner: boolean } {
  return { role: a.role, perms: ALL_PERMISSIONS.filter((p) => a.perms.has(p)), isOwner: a.isOwner };
}
