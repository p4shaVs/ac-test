// Live Event Log — a per-server ring buffer of recent game events, held in
// memory only. It's a "turn it on while you watch" debugging feed, so it never
// needs a DB column or migration; it's fine that it's ephemeral and per-process.

export interface LiveEvent {
  id: string;
  t: number; // epoch ms
  kind: LiveEventKind;
  player: string;
  /** Server id of the player (0 = server / unknown). */
  src: number;
  detail: string;
  /** Identical lines inside one 2 s batch are merged by the resource. */
  count: number;
}

export const LIVE_EVENT_KINDS = ["spawn", "remove", "explosion", "damage", "particle", "kill", "event", "join", "leave", "other"] as const;
export type LiveEventKind = (typeof LIVE_EVENT_KINDS)[number];

const MAX = 400;
const store = new Map<string, LiveEvent[]>();
let seq = 0;

export function pushEvents(serverId: string, events: Omit<LiveEvent, "id">[]): void {
  if (!events.length) return;
  let buf = store.get(serverId);
  if (!buf) {
    buf = [];
    store.set(serverId, buf);
  }
  for (const e of events) {
    buf.push({ ...e, id: `${Date.now().toString(36)}${(seq++).toString(36)}` });
  }
  if (buf.length > MAX) buf.splice(0, buf.length - MAX);
  if (store.size > 200) {
    // Drop the oldest server's buffer if we somehow track too many.
    const first = store.keys().next().value;
    if (first && first !== serverId) store.delete(first);
  }
}

export function getEvents(serverId: string, sinceId?: string): LiveEvent[] {
  const buf = store.get(serverId) ?? [];
  if (!sinceId) return buf.slice(-200);
  const idx = buf.findIndex((e) => e.id === sinceId);
  return idx === -1 ? buf.slice(-200) : buf.slice(idx + 1);
}

export function clearEvents(serverId: string): void {
  store.delete(serverId);
}
