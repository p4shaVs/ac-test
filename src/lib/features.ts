// Anti-cheat özellik kataloğu.
// Admin bir lisans anahtarı üretirken bu özelliklerden seçer; müşteri panelinde
// ve FiveM kaynağı tarafında hangi korumaların açık olduğunu bu liste belirler.

export interface FeatureDef {
  key: string;
  label: string;
  description: string;
  category: "Detection" | "Protection" | "Panel" | "Advanced";
}

export const FEATURES: FeatureDef[] = [
  // --- Tespit (Detection) ---
  {
    key: "aimbot_detection",
    label: "Aimbot Detection",
    description: "Detects abnormal aim angular velocity and snapping.",
    category: "Detection",
  },
  {
    key: "silent_aim_detection",
    label: "Silent Aim Detection",
    description: "Catches server-side bullet/target mismatches.",
    category: "Detection",
  },
  {
    key: "overlay_detection",
    label: "Overlay / ESP Detection",
    description: "Scans for known cheat-menu and overlay signatures.",
    category: "Detection",
  },
  {
    key: "spoofer_detection",
    label: "Spoofer Detection",
    description: "Flags HWID and identifier spoofing attempts.",
    category: "Detection",
  },
  // --- Koruma (Protection) ---
  {
    key: "weapon_protection",
    label: "Weapon Protection",
    description: "Blocks unauthorised weapon spawns and modifications.",
    category: "Protection",
  },
  {
    key: "vehicle_protection",
    label: "Vehicle Protection",
    description: "Blocks unauthorised vehicle spawns and modifications.",
    category: "Protection",
  },
  {
    key: "godmode_protection",
    label: "Godmode Protection",
    description: "Stops invincibility and health manipulation.",
    category: "Protection",
  },
  {
    key: "resource_protection",
    label: "Resource Protection",
    description: "Blocks unauthorised resource starts, stops and injection.",
    category: "Protection",
  },
  {
    key: "event_protection",
    label: "Event Protection",
    description: "Filters server event trigger floods and exploits.",
    category: "Protection",
  },
  {
    key: "explosion_protection",
    label: "Explosion Protection",
    description: "Limits unauthorised explosion spam.",
    category: "Protection",
  },
  // --- Panel ---
  {
    key: "web_panel",
    label: "Web Panel",
    description: "Full panel access from the browser.",
    category: "Panel",
  },
  {
    key: "ingame_menu",
    label: "In-Game Menu",
    description: "In-game admin menu.",
    category: "Panel",
  },
  {
    key: "live_map",
    label: "Live Map",
    description: "A real-time interactive map of your players.",
    category: "Panel",
  },
  {
    key: "player_lookup",
    label: "Player Lookup",
    description: "Look up history and punishments by identifier.",
    category: "Panel",
  },
  // --- Gelişmiş (Advanced) ---
  {
    key: "discord_logs",
    label: "Discord Logs",
    description: "Forwards detections and punishments to a Discord webhook.",
    category: "Advanced",
  },
  {
    key: "api_access",
    label: "API Access",
    description: "REST API keys for your own integrations.",
    category: "Advanced",
  },
  {
    key: "auto_ban",
    label: "Automatic Ban",
    description: "Automatically bans on confirmed detections.",
    category: "Advanced",
  },
  {
    key: "screenshot",
    label: "Remote Screenshot",
    description: "Requests a screenshot from suspicious players.",
    category: "Advanced",
  },
];

export const FEATURE_KEYS = FEATURES.map((f) => f.key);
const FEATURE_SET = new Set(FEATURE_KEYS);

export function isValidFeature(key: string): boolean {
  return FEATURE_SET.has(key);
}

/** Bilinmeyen özellik anahtarlarını temizler ve tekrarları kaldırır. */
export function sanitizeFeatures(features: unknown): string[] {
  if (!Array.isArray(features)) return [];
  return Array.from(
    new Set(features.filter((f): f is string => typeof f === "string" && FEATURE_SET.has(f)))
  );
}

export function featureLabel(key: string): string {
  return FEATURES.find((f) => f.key === key)?.label ?? key;
}
