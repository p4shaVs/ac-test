// Parses what staff paste into the offline-ban box: prefixed FiveM identifiers
// ("license:…", "discord:…") or bare values copied from Discord, Steam or a log.
// Shared by the panel form (live chips) and the API (which re-checks everything).
//
// A FiveM ban matches on licence, Steam and Discord — and on IP only when the
// server owner turned on "Ban Ip Address" (server/main.lua matchBan). Other
// identifier kinds are recognised so we can say why they are not used.

export type IdentKind = "license" | "steam" | "discord" | "ip" | "license2" | "fivem" | "xbl" | "live" | "unknown";

export interface ParsedIdent {
  raw: string;
  kind: IdentKind;
  /** Normalised value as the ban stores it (ip without prefix), or null if unusable. */
  value: string | null;
  /** Used for matching a ban. */
  usable: boolean;
  note?: string;
}

const HEX40 = /^[0-9a-f]{40}$/i;
const STEAM_HEX = /^1100001[0-9a-f]{8}$/i;
const STEAM64 = /^7656119\d{10}$/;
const DISCORD = /^\d{17,20}$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]{2,39}$/i;
const PREFIXES = new Set(["license", "license2", "steam", "discord", "ip", "fivem", "xbl", "live"]);

/** SteamID64 (decimal, as Steam shows it) → FiveM "steam:" hex. */
export function steam64ToHex(dec: string): string | null {
  if (!STEAM64.test(dec)) return null;
  try {
    return BigInt(dec).toString(16);
  } catch {
    return null;
  }
}

export function parseIdentifier(input: string): ParsedIdent {
  const raw = input.trim().replace(/^["'<]+|["'>]+$/g, "");
  const lower = raw.toLowerCase();
  const m = /^([a-z0-9]+):(.+)$/.exec(lower);
  // "2001:db8::1" also looks like "<word>:<rest>" — only known kinds are prefixes.
  const prefix = m && PREFIXES.has(m[1]) ? m[1] : null;
  const rest = prefix && m ? m[2].trim() : lower;

  if (prefix === "license" || (!prefix && HEX40.test(rest))) {
    return HEX40.test(rest)
      ? { raw, kind: "license", value: `license:${rest}`, usable: true }
      : { raw, kind: "license", value: null, usable: false, note: "A licence is 40 hex characters" };
  }
  if (prefix === "license2") {
    return { raw, kind: "license2", value: null, usable: false, note: "license2 is not used for bans — add the main licence" };
  }
  if (prefix === "steam" || (!prefix && (STEAM_HEX.test(rest) || STEAM64.test(rest)))) {
    if (STEAM_HEX.test(rest)) return { raw, kind: "steam", value: `steam:${rest}`, usable: true };
    const hex = steam64ToHex(rest);
    if (hex) return { raw, kind: "steam", value: `steam:${hex}`, usable: true, note: "Converted from SteamID64" };
    return { raw, kind: "steam", value: null, usable: false, note: "Not a Steam ID" };
  }
  if (prefix === "discord" || (!prefix && DISCORD.test(rest))) {
    return DISCORD.test(rest)
      ? { raw, kind: "discord", value: `discord:${rest}`, usable: true }
      : { raw, kind: "discord", value: null, usable: false, note: "A Discord ID is 17–20 digits" };
  }
  // An endpoint copied from a log ("85.10.20.30:30120") carries a port.
  const ipv4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(rest);
  if (prefix === "ip" || (!prefix && (IPV4.test(rest) || ipv4Port || (rest.includes(":") && IPV6.test(rest))))) {
    const v = ipv4Port ? ipv4Port[1] : rest;
    if (IPV4.test(v) || (v.includes(":") && IPV6.test(v))) {
      return { raw, kind: "ip", value: v, usable: true, note: "Only matched when Ban Ip Address is on" };
    }
    return { raw, kind: "ip", value: null, usable: false, note: "Not an IP address" };
  }
  if (prefix === "fivem" || prefix === "xbl" || prefix === "live") {
    return { raw, kind: prefix, value: null, usable: false, note: `${prefix} IDs are not used for bans` };
  }
  return { raw, kind: "unknown", value: null, usable: false, note: "Not recognised" };
}

/** Splits on commas, whitespace and new lines; drops duplicates. */
export function parseIdentifiers(text: string): ParsedIdent[] {
  const seen = new Set<string>();
  const out: ParsedIdent[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    if (!part.trim()) continue;
    const p = parseIdentifier(part);
    const key = p.value ?? p.raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.slice(0, 20);
}

export interface BanIdentity {
  license: string | null;
  steam: string | null;
  discord: string | null;
  ip: string | null;
}

/**
 * The identity a ban stores. Each kind may appear once — two licences would be
 * two accounts, which need two bans. Returns an error message instead when the
 * list cannot make a ban.
 */
export function identityFrom(parsed: ParsedIdent[]): { identity: BanIdentity } | { error: string } {
  const id: BanIdentity = { license: null, steam: null, discord: null, ip: null };
  for (const p of parsed) {
    if (!p.usable || !p.value) continue;
    const k = p.kind as keyof BanIdentity;
    if (id[k] && id[k] !== p.value) return { error: `Two different ${k === "ip" ? "IP addresses" : `${k} IDs`} — ban each account separately.` };
    id[k] = p.value;
  }
  if (!id.license && !id.steam && !id.discord && !id.ip) {
    return { error: "Add at least one licence, Discord or Steam identifier." };
  }
  return { identity: id };
}

export const DURATION_UNITS = [
  { key: "m", label: "minutes", minutes: 1 },
  { key: "h", label: "hours", minutes: 60 },
  { key: "d", label: "days", minutes: 1440 },
  { key: "w", label: "weeks", minutes: 10080 },
] as const;

/** 10 years — anything longer is a permanent ban. */
export const MAX_BAN_MINUTES = 10 * 365 * 1440;
