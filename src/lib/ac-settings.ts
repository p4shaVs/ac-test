// Typed reader for config.ac.Settings — the panel-side view of the Configuration
// → Settings tab. Routes use this instead of poking at `config.ac?.Settings?.X`
// (which silently yields `undefined` on a typo and skips sanitising).
//
// Every key here must exist in src/lib/ac-config.ts; `npm run check:ac` fails
// when the two drift apart.

import { sanitizeAcConfig } from "./ac-config";
import { parseJson } from "./utils";

export interface AcSettings {
  // Enforcement
  LogOnly: boolean;
  StaffBypass: boolean;

  // Safe Guard (server-side lists)
  SafeEvents: string[];
  SafeScripts: string[];
  IgnoredScripts: string[];
  AntiResourceInjectionSafeList: string[];

  // Connection & Identity
  AntiVPN: boolean;
  VpnMessage: string;
  VpnApiKey: string;
  AntiConnectionDupe: boolean;
  DupeMessage: string;
  RequireSteam: boolean;
  SteamRequiredMessage: string;
  RequireDiscord: boolean;
  DiscordRequiredMessage: string;
  RequireAlphanumericName: boolean;
  NameMessage: string;
  ReputationGateEnforce: boolean;
  MinReputationScore: number;
  ReputationMessage: string;
  MaxThreatScore: number;
  ThreatMessage: string;
  BlockIfVerifyFails: boolean;
  VerifyUnavailableMessage: string;

  // Bans & Evidence
  EnableBans: boolean;
  BanIpAddress: boolean;
  BanDuration: number;
  BanMessage: string;
  EnableScreenShots: boolean;
  EnableGameplayRecord: boolean;
  OptimizeRecordMode: boolean;
  BanVideoUrl: string;

  // Logs & Webhooks
  EnableDiscordLogs: boolean;
  BanWebhook: string;
  WarnWebhook: string;
  KickWebhook: string;
  ConnectWebhook: string;
  DisconnectWebhook: string;
  SilentAimWebhook: string;
  AdminLogsWebhook: string;
  LogOnConnect: boolean;
  LogConnectionsToDiscord: boolean;
  LogOnDisconnect: boolean;
  LogConnectionsToConsole: boolean;
  LogPunishmentsToConsole: boolean;
  ShowIpAddress: boolean;
  LogUnbansToDiscord: boolean;

  // Framework & API
  EsxResourceName: string;
  QbCoreResourceName: string;
  QbxCoreResourceName: string;
  TxAdminPath: string;
  CommandPrefix: string;
  HttpApiAllowWrite: boolean;
  HttpApiAllowedIps: string[];

  // Backdoor Protection
  EnableAntiBackdoors: boolean;
  StopServerWhenDetected: boolean;
}

/** Settings of one server, sanitised and with every default filled in. */
export function readAcSettings(serverConfig: string | null | undefined): AcSettings {
  const cfg = parseJson<Record<string, unknown>>(serverConfig, {});
  return sanitizeAcConfig(cfg.ac).Settings as unknown as AcSettings;
}

/**
 * Are detections allowed to kick / ban? False while Log-Only mode is on (the
 * temporary rollout switch) or Enable Bans is off (the standing policy switch).
 * Bans and kicks an admin issues by hand are never affected.
 */
export function punishmentsOn(s: Pick<AcSettings, "LogOnly" | "EnableBans">): boolean {
  return s.LogOnly !== true && s.EnableBans !== false;
}
