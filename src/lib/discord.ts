// Discord webhook logs.
//
// One tidy embed per event: a one-line summary, the evidence in readable
// lines, identifiers (Discord shown as a clickable user), the Ban ID and a link
// back to the panel. Colour follows the outcome: red ban, amber kick, slate
// log. Player names are attacker-controlled — mentions are disabled and code
// spans are escaped so nobody can ping @everyone through a nickname.

import { parseJson } from "./utils";
import { env } from "./env";
import { evidenceEntries } from "./evidence";

export type WebhookEvent =
  | "ban"
  | "unban"
  | "kick"
  | "warn"
  | "detection"
  | "autoban"
  | "connect"
  | "blacklist";

export interface WebhookConfig {
  url: string;
  events: Record<WebhookEvent, boolean>;
}

const EVENT_META: Record<WebhookEvent, { title: string; color: number; verb: string }> = {
  ban: { title: "Player banned", color: 0xf0605d, verb: "was banned" },
  unban: { title: "Ban lifted", color: 0x3ecf8e, verb: "was unbanned" },
  kick: { title: "Player kicked", color: 0xf2b33d, verb: "was kicked" },
  warn: { title: "Player warned", color: 0xf2b33d, verb: "was warned" },
  detection: { title: "Detection", color: 0x8b90ff, verb: "was flagged" },
  autoban: { title: "Automatic ban", color: 0xd83a36, verb: "was banned by the anti-cheat" },
  connect: { title: "Player connected", color: 0x5aa9f5, verb: "connected" },
  blacklist: { title: "Blacklist hit", color: 0xf0605d, verb: "used a blacklisted model" },
};

const ACTION_COLOR: Record<string, number> = { BAN: 0xd83a36, KICK: 0xf2b33d, LOG: 0x5d6572 };
const ACTION_VERB: Record<string, string> = { BAN: "was **banned**", KICK: "was **kicked**", LOG: "was **flagged** (logged only)" };

const DEFAULT_EVENTS: Record<WebhookEvent, boolean> = {
  ban: true, unban: true, kick: true, warn: false,
  detection: true, autoban: true, connect: false, blacklist: true,
};

/** Reads the webhook settings from server.config. */
export function readWebhookConfig(configJson: string): WebhookConfig {
  const cfg = parseJson<Record<string, unknown>>(configJson, {});
  const url = typeof cfg.discordWebhook === "string" ? cfg.discordWebhook : "";
  const events = { ...DEFAULT_EVENTS, ...(cfg.webhookEvents as object | undefined) };
  return { url, events };
}

function valid(url: string): boolean {
  return /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url);
}

/** True when this event would actually be posted (URL set and event enabled). */
export function webhookEnabled(configJson: string, event: WebhookEvent): boolean {
  const { url, events } = readWebhookConfig(configJson);
  return valid(url) && events[event] === true;
}

export interface LogFields {
  player?: string;
  reason?: string;
  by?: string;
  code?: string;
  identifiers?: { license?: string | null; discord?: string | null; steam?: string | null; ip?: string | null };
  extra?: Record<string, string>;
  /** Detection extras */
  action?: "LOG" | "KICK" | "BAN";
  detectionLabel?: string;
  origin?: "server" | "client";
  evidence?: Record<string, unknown>;
  staff?: boolean;
  /** Panel page to link to (path under the panel, e.g. /dashboard/servers/x/bans). */
  panelPath?: string;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const code = (s: string) => "`" + clip(String(s).replace(/`/g, "ˋ"), 80) + "`";

// ------------------------------------------------------------- evidence text
function evidenceLines(ev: Record<string, unknown> | undefined): string | null {
  const rows = evidenceEntries(ev).map((e) => `${e.label.padEnd(13)} ${e.value}`);
  return rows.length ? "```\n" + rows.join("\n").replace(/```/g, "ˋˋˋ") + "\n```" : null;
}

function panelUrl(path?: string): string | undefined {
  if (!path) return undefined;
  const base = (env.APP_URL || "").replace(/\/+$/, "");
  // Discord cannot open a localhost link, so only link a real address.
  if (!/^https?:\/\//.test(base) || /localhost|127\.0\.0\.1/.test(base)) return undefined;
  return base + path;
}

/**
 * Posts one embed to the server's Discord webhook (fire-and-forget; a failing
 * webhook never breaks the calling request).
 */
export async function sendWebhook(
  configJson: string,
  event: WebhookEvent,
  serverName: string,
  fields: LogFields
): Promise<void> {
  try {
    const { url, events } = readWebhookConfig(configJson);
    if (!valid(url) || !events[event]) return;

    const meta = EVENT_META[event];
    const isDetection = event === "detection" || event === "autoban";
    const action = fields.action ?? (event === "autoban" ? "BAN" : undefined);
    const color = fields.staff ? 0x5d6572 : isDetection && action ? ACTION_COLOR[action] ?? meta.color : meta.color;

    const who = fields.player ? `**${clip(fields.player.replace(/[*_~|`>]/g, ""), 48)}**` : "A player";
    let summary: string;
    if (isDetection) {
      const what = fields.detectionLabel ?? fields.reason ?? "a detection";
      summary = `${who} ${action ? ACTION_VERB[action] : "was flagged"} for **${what}**.`;
      if (fields.staff) summary += "\n*Server staff — logged only, not punished.*";
      summary += `\n-# ${fields.origin === "server" ? "Server-verified evidence" : "Reported by the player's own game"}`;
    } else {
      summary = `${who} ${meta.verb}${fields.by ? ` by **${clip(fields.by, 40)}**` : ""}.`;
      if (fields.reason) summary += `\n> ${clip(fields.reason.replace(/\n/g, " "), 300)}`;
    }

    const embedFields: { name: string; value: string; inline?: boolean }[] = [];
    if (fields.code) embedFields.push({ name: "Ban ID", value: code(fields.code), inline: true });
    if (action && isDetection) embedFields.push({ name: "Action", value: code(fields.staff ? "LOG (staff)" : action), inline: true });
    if (fields.by && isDetection) embedFields.push({ name: "By", value: clip(fields.by, 60), inline: true });
    const ev = evidenceLines(fields.evidence);
    if (ev) embedFields.push({ name: "Evidence", value: ev, inline: false });
    if (fields.identifiers) {
      const id = fields.identifiers;
      const lines: string[] = [];
      if (id.discord) {
        const d = id.discord.replace("discord:", "");
        lines.push(/^\d{15,21}$/.test(d) ? `Discord  <@${d}>` : `Discord  ${code(d)}`);
      }
      if (id.license) lines.push(`License  ${code(id.license.replace("license:", ""))}`);
      if (id.steam) lines.push(`Steam  ${code(id.steam)}`);
      if (lines.length) embedFields.push({ name: "Identifiers", value: lines.join("\n"), inline: false });
    }
    for (const [k, v] of Object.entries(fields.extra ?? {})) {
      embedFields.push({ name: clip(k, 60), value: clip(v, 200), inline: true });
    }

    const payload = {
      username: "CoreAC",
      allowed_mentions: { parse: [] as string[] },
      embeds: [
        {
          author: { name: clip(serverName, 80) },
          title: isDetection ? `${fields.detectionLabel ?? "Detection"} · ${fields.staff ? "Logged" : action === "BAN" ? "Banned" : action === "KICK" ? "Kicked" : "Logged"}` : meta.title,
          url: panelUrl(fields.panelPath),
          description: summary,
          color,
          fields: embedFields,
          footer: { text: "CoreAC Anti-Cheat" },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    }).finally(() => clearTimeout(t));
  } catch {
    // never let a webhook failure break the caller
  }
}

export { DEFAULT_EVENTS };
