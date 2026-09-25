// Human-readable names for audit-log action codes (AuditLog.action).
// Every code the API writes should be listed; unknown codes fall back to the
// raw value so a missing entry never hides an event.
const LABELS: Record<string, string> = {
  LOGIN: "Signed in",
  LOGIN_FAIL: "Failed sign-in",
  REGISTER: "Registered",
  PASSWORD_CHANGE: "Changed their password",
  USER_UPDATE: "Updated a user",
  REDEEM: "Redeemed a key",
  CHECKOUT: "Checkout (old free-key flow — removed)",
  SALE_RECORD: "Recorded a sale",
  ORDER_REFUND: "Refunded an order",
  KEY_GENERATE: "Generated keys",
  KEY_UPDATE: "Updated a key",
  KEY_DELETE: "Deleted a key",
  PRODUCT_CREATE: "Created a product",
  PRODUCT_UPDATE: "Updated a product",
  PRODUCT_DELETE: "Deleted a product",
  SERVER_ACTIVATE: "Activated a server",
  SERVER_CREATE: "Created a server",
  SERVER_UPDATE: "Updated a server",
  SERVER_DELETE: "Deleted a server",
  SERVER_TOKEN_REGEN: "Regenerated a server token",
  SERVER_ADMIN_ADD: "Added an in-game admin",
  SERVER_ADMIN_UPDATE: "Changed an in-game admin",
  SERVER_ADMIN_REMOVE: "Removed an in-game admin",
  CONFIG_UPDATE: "Changed protection settings",
  RULES_UPDATE: "Changed server guards",
  ACTIONS_UPDATE: "Changed detection actions",
  PROTECTED_EVENTS_UPDATE: "Changed protected events",
  CONSOLE_COMMAND: "Ran a console command",
  RESOURCE_ACTION: "Started/stopped a resource",
  UNBAN: "Lifted a ban",
  BANS_UNBAN_ALL: "Lifted every ban",
  BANS_CLEAR_INACTIVE: "Purged lifted bans",
};

export function auditLabel(action: string): string {
  return LABELS[action] ?? action;
}
