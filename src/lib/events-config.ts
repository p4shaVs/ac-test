// Protected Events — customer-managed honeypot event names.
//
// The resource traps each name twice: as a client event (client/events.lua,
// client-origin → KICK at most) and as a server event (server/entity_guard.lua,
// server-origin). Cheat menus mostly fire money/job exploits with
// TriggerServerEvent, which only the server-side trap can see. Names whose
// "prefix:" matches a resource installed on the server are skipped, so a
// resource's own events can never be trapped by accident. The type defaults to
// KICK; owners may raise CHEAT_EVENT_HONEYPOT to BAN in Actions.
//
// IMPORTANT (shown in the UI): only add events that NO legitimate resource on
// the server ever fires. We do NOT name-mangle events (that needs invasive
// global hooks that break other resources), so adding an event your own
// scripts use would flag real players.

const EVENT_RE = /^[A-Za-z0-9_.:\-]{2,100}$/;

export function isValidEventName(raw: string): boolean {
  return EVENT_RE.test(raw.trim());
}

export function sanitizeProtectedEvents(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const e = v.trim();
    if (!EVENT_RE.test(e) || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
    if (out.length >= 200) break;
  }
  return out;
}

// A few well-known cheat-menu / executor event names, shown read-only as a
// reference. The resource ships its own built-in list too (client/events.lua);
// these are just examples of what "cheat-only" event names look like.
export const KNOWN_CHEAT_EVENTS: string[] = [
  "HCheat:TempDisableDetection",
  "adminmenu:allowall",
  "antilynx8:crashuser",
  "antilynxr4:crashuser",
  "esx_truckerjob:pay",
  "esx_billing:sendBill",
  "vrp_slotmachine:server:2",
];
