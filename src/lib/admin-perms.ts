// In-game admin permissions — single source of truth.
//
// Used by the admins API (validation + role defaults) and the Admins page
// (checkbox labels). Every key here is enforced by the FiveM resource
// (server/live.lua: CAC.hasPerm) before the action or data request runs, so
// the in-game menu can never do more than the panel allows.
//
// Some menu actions share a permission (server/live.lua PERM_ALIAS):
//   revive → heal, armor, revive, repair vehicle
//   reset  → reset, wipe spawns
//   tp     → go to player, teleport to waypoint
//   spectate → spectate, player name tags
//   logs   → detections / server logs tabs, live detection alerts

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
  "disarm",
  "mute",
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
  spectate: "Spectate & player tags",
  revive: "Heal / Revive / Repair",
  reset: "Reset & wipe spawns",
  tp: "Go to & waypoint teleport",
  bring: "Bring",
  freeze: "Freeze",
  disarm: "Disarm",
  mute: "Mute voice",
  announce: "Announce",
  screenshot: "Screenshot",
  logs: "Logs & live alerts",
};

// Role → default permissions (used when no explicit list is given).
export const ROLE_DEFAULTS: Record<string, AdminPermission[]> = {
  OWNER: [...ADMIN_PERMISSIONS],
  ADMIN: ["kick", "ban", "unban", "warn", "dm", "spectate", "revive", "reset", "tp", "bring", "freeze", "disarm", "mute", "screenshot", "logs"],
  MODERATOR: ["warn", "dm", "spectate", "revive", "tp", "mute", "screenshot", "logs"],
};
