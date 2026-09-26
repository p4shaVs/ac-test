// Turns a detection's raw `details` object (sent by the resource) into short,
// readable evidence lines. Shared by the panel feed and Discord webhooks so
// both describe a detection the same way.

const LABELS: Record<string, string> = {
  distance: "Distance", flight: "Flight", seconds: "Duration", kmh: "Speed", capKmh: "Limit",
  speed: "Speed", vehicles: "Vehicles", perMinute: "Per minute", source: "Check", reason: "Reason",
  type: "Type", detection: "Check", weapon: "Weapon", dmg: "Damage", damage: "Damage", cap: "Limit",
  hits: "Hits", model: "Model", event: "Event", volume: "Volume", voiceRange: "Voice range",
  immuneForMs: "Immune for", count: "Count", armor: "Armor", health: "Health", explosionName: "Explosion",
  sound: "Sound", side: "Side", poolBefore: "HP before", poolAfter: "HP after", ammoInWeapon: "Ammo",
  lastAmmoInWeapon: "Previous ammo", ammoInClip: "Clip", lastAmmoInClip: "Previous clip",
};

const SOURCES: Record<string, string> = {
  server_flight: "server: movement physics can't explain",
  server_launch: "server: driverless vehicle flying",
  server_minute: "server: per-minute spawn cap",
  server_fallback: "server: collision-off flight",
  damage_no_pool_drop: "server: hit without losing health",
  Flight: "client: flight without velocity",
  "Script Cam": "client: script camera far from player",
};

const SKIP = new Set(["replay", "bypass", "hash", "inCombat", "custom", "blocked", "info"]);

function unit(key: string, v: unknown): string {
  if (typeof v === "number") {
    if (key === "distance" || key === "flight" || key === "voiceRange") return `${Math.round(v)} m`;
    if (key === "seconds") return `${v} s`;
    if (key === "kmh" || key === "capKmh") return `${Math.round(v)} km/h`;
    if (key === "immuneForMs") return `${(v / 1000).toFixed(1)} s`;
    return String(Math.round(v * 100) / 100);
  }
  if ((key === "source" || key === "reason" || key === "detection") && typeof v === "string" && SOURCES[v]) return SOURCES[v];
  return String(v);
}

export interface EvidenceEntry {
  label: string;
  value: string;
}

/** Up to `max` readable evidence entries from a details object or JSON string. */
export function evidenceEntries(details: unknown, max = 8): EvidenceEntry[] {
  let obj: Record<string, unknown> | null = null;
  if (typeof details === "string") {
    try { obj = JSON.parse(details); } catch { obj = null; }
  } else if (details && typeof details === "object") {
    obj = details as Record<string, unknown>;
  }
  if (!obj) return [];
  const out: EvidenceEntry[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k) || k.startsWith("__") || v === null || v === undefined || typeof v === "object") continue;
    const value = unit(k, v);
    // A known check name (e.g. "server_flight") reads as the check, whatever key carried it.
    const label = typeof v === "string" && SOURCES[v] ? "Check" : LABELS[k] ?? k;
    out.push({ label, value: value.length > 60 ? value.slice(0, 59) + "…" : value });
    if (out.length >= max) break;
  }
  return out;
}

/** One-line summary, e.g. "Distance 79 m · Duration 4 s". */
export function evidenceLine(details: unknown, max = 3): string {
  return evidenceEntries(details, max).map((e) => `${e.label} ${e.value}`).join(" · ");
}
