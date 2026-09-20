// Küçük yardımcılar.

/** Koşullu className birleştirici (clsx'in minimal versiyonu). */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatMoney(cents: number, currency = "EUR"): string {
  const symbols: Record<string, string> = { EUR: "€", USD: "$", TRY: "₺", GBP: "£" };
  const sym = symbols[currency] ?? "";
  return `${sym}${(cents / 100).toFixed(2)}`;
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  // en-GB: unambiguous day-first dates and 24-hour time — the panel ships in
  // English and is sold internationally, so it must not render Turkish formats.
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "3 gün", "2 saat" gibi kalan süre. */
export function relativeDays(d: Date | string | null | undefined): string {
  if (!d) return "No expiry";
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = date.getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} days`;
  const hours = Math.ceil(ms / (60 * 60 * 1000));
  return `${hours} hours`;
}

export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const sec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hours ago`;
  const day = Math.floor(hr / 24);
  return `${day} days ago`;
}

export function parseJson<T>(str: string | null | undefined, fallback: T): T {
  if (!str) return fallback;
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * Returns a URL that is safe to put in an <a href> or <img src>, or undefined.
 *
 * Screenshot URLs are reported back by the *player's* game client, which means
 * a cheater controls them. Without this check a banned player could store
 * `javascript:…` as their evidence URL and run script in the admin's session
 * the moment the evidence is opened — React does not block javascript: hrefs.
 *
 * Allowed: absolute http(s) URLs, and same-origin paths ("/shots/x.jpg").
 * Rejected: javascript:, data:, vbscript:, protocol-relative "//host", etc.
 */
export function safeMediaUrl(raw: string | null | undefined): string | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const value = raw.trim();
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
