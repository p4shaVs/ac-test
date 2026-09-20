// Discord webhook log sistemi.
// Sunucu yapılandırmasında (server.config) saklanan webhook URL'ine embed gönderir.
// Ban / Kick / Uyarı / Tespit / Bypass gibi olaylar buradan bildirilir.

import { parseJson } from "./utils";

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

const EVENT_META: Record<WebhookEvent, { title: string; color: number; emoji: string }> = {
  ban: { title: "Player Banned", color: 0xf43f5e, emoji: "⛔" },
  unban: { title: "Unbanned", color: 0x10b981, emoji: "✅" },
  kick: { title: "Player Kicked", color: 0xf59e0b, emoji: "👢" },
  warn: { title: "Player Warned", color: 0xeab308, emoji: "⚠️" },
  detection: { title: "Cheat Detection", color: 0xa855f7, emoji: "🚨" },
  autoban: { title: "Automatic Ban (Anti-Cheat)", color: 0xdc2626, emoji: "🤖" },
  connect: { title: "Player Connected", color: 0x38bdf8, emoji: "🔌" },
  blacklist: { title: "Blacklist Violation", color: 0xef4444, emoji: "🚫" },
};

const DEFAULT_EVENTS: Record<WebhookEvent, boolean> = {
  ban: true, unban: true, kick: true, warn: false,
  detection: true, autoban: true, connect: false, blacklist: true,
};

/** server.config'ten webhook yapılandırmasını okur. */
export function readWebhookConfig(configJson: string): WebhookConfig {
  const cfg = parseJson<Record<string, unknown>>(configJson, {});
  const url = typeof cfg.discordWebhook === "string" ? cfg.discordWebhook : "";
  const events = { ...DEFAULT_EVENTS, ...(cfg.webhookEvents as object | undefined) };
  return { url, events };
}

function valid(url: string): boolean {
  return /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\//.test(url);
}

export interface LogFields {
  player?: string;
  reason?: string;
  by?: string;
  code?: string;
  identifiers?: { license?: string | null; discord?: string | null; steam?: string | null; ip?: string | null };
  extra?: Record<string, string>;
}

/**
 * Discord'a embed gönderir (fire-and-forget). Hata olursa sessizce yutar —
 * webhook başarısızlığı asla ana akışı bozmamalı.
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
    const embedFields: { name: string; value: string; inline?: boolean }[] = [];
    if (fields.player) embedFields.push({ name: "Player", value: `\`${fields.player}\``, inline: true });
    if (fields.by) embedFields.push({ name: "Admin", value: fields.by, inline: true });
    if (fields.code) embedFields.push({ name: "Ban Kodu", value: `\`${fields.code}\``, inline: true });
    if (fields.reason) embedFields.push({ name: "Reason", value: fields.reason, inline: false });
    if (fields.identifiers) {
      const id = fields.identifiers;
      const parts: string[] = [];
      if (id.license) parts.push(`license: \`${id.license.replace("license:", "")}\``);
      if (id.discord) parts.push(`discord: \`${id.discord.replace("discord:", "")}\``);
      if (id.steam) parts.push(`steam: \`${id.steam}\``);
      if (id.ip) parts.push(`ip: \`${id.ip}\``);
      if (parts.length) embedFields.push({ name: "Identifiers", value: parts.join("\n"), inline: false });
    }
    for (const [k, v] of Object.entries(fields.extra ?? {})) {
      embedFields.push({ name: k, value: v, inline: true });
    }

    const payload = {
      username: "Core Shield Anti-Cheat",
      embeds: [
        {
          title: `${meta.emoji} ${meta.title}`,
          color: meta.color,
          fields: embedFields,
          footer: { text: `${serverName} • Core Shield` },
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
    // sessizce yut
  }
}

export { DEFAULT_EVENTS };
