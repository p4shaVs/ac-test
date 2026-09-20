// In-game admin permissions — single source of truth.
//
// Used by the admins API (validation + role defaults) and the Admins page
// (checkbox labels). Every key here is enforced by the FiveM resource
// (server/live.lua: Aeigs.hasPerm) before the action or data request runs, so
// the in-game menu can never do more than the panel allows.

export const ADMIN_PERMISSIONS = [
  "kick",
  "ban",
  "unban",
  "warn",
  "dm",
  "spectate",
  "revive",
  "reset",
  "tp",
  "bring",
  "freeze",
  "announce",
  "screenshot",
  "logs",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const PERMISSION_LABELS: Record<AdminPermission, string> = {
  kick: "Kick",
  ban: "Ban",
  unban: "Unban",
  warn: "Warn",
  dm: "Direct message",
  spectate: "Spectate",
  revive: "Heal / Revive",
  reset: "Reset / Clean",
  tp: "Go to",
  bring: "Bring",
  freeze: "Freeze",
  announce: "Announce",
  screenshot: "Screenshot",
  logs: "View logs",
};

// Role → default permissions (used when no explicit list is given).
export const ROLE_DEFAULTS: Record<string, AdminPermission[]> = {
  OWNER: [...ADMIN_PERMISSIONS],
  ADMIN: ["kick", "ban", "unban", "warn", "dm", "spectate", "revive", "reset", "tp", "bring", "freeze", "screenshot", "logs"],
  MODERATOR: ["warn", "dm", "spectate", "revive", "tp", "screenshot", "logs"],
};
