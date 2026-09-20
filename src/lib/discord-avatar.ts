// Discord avatar resolution — turns a FiveM `discord:<id>` identifier into a
// profile-picture URL.
//
// Discord's CDN needs the avatar *hash*, which only the API returns, so this
// requires a bot token (DISCORD_BOT_TOKEN). Without one it degrades gracefully:
// the UI falls back to the letter avatar. Results are cached IN MEMORY (no DB
// column, so no migration and nothing to break the user's running server) and
// warmed by /api/v1/players/sync, so by the time an admin opens a page the
// avatars are already resolved.

interface Entry {
  url: string | null;
  at: number;
}

const cache = new Map<string, Entry>();
const inflight = new Set<string>();
const TTL = 12 * 60 * 60 * 1000; // 12h
const MAX = 5000;

function idOf(discord?: string | null): string | null {
  if (!discord) return null;
  const raw = String(discord).replace(/^discord:/i, "").trim();
  return /^\d{5,25}$/.test(raw) ? raw : null;
}

/** Cached avatar URL for a discord identifier, or null (letter fallback). Sync. */
export function getCachedAvatar(discord?: string | null): string | null {
  const id = idOf(discord);
  if (!id) return null;
  const e = cache.get(id);
  return e ? e.url : null;
}

/** Resolve + cache an avatar in the background. Safe to call often (deduped). */
export async function warmAvatar(discord?: string | null): Promise<void> {
  const id = idOf(discord);
  if (!id) return;
  const e = cache.get(id);
  if (e && Date.now() - e.at < TTL) return; // still fresh
  if (inflight.has(id)) return;

  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    cache.set(id, { url: null, at: Date.now() }); // remember "no token" briefly
    return;
  }

  inflight.add(id);
  try {
    const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
      headers: { Authorization: `Bot ${token}` },
    });
    let url: string | null = null;
    if (res.ok) {
      const u = (await res.json()) as { avatar?: string | null };
      if (u.avatar) {
        const ext = String(u.avatar).startsWith("a_") ? "gif" : "png";
        url = `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.${ext}?size=64`;
      } else {
        // Default embed avatar derived from the id (no custom picture set).
        const idx = Number((BigInt(id) >> 22n) % 6n);
        url = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
      }
    }
    if (cache.size > MAX) cache.clear();
    cache.set(id, { url, at: Date.now() });
  } catch {
    cache.set(id, { url: null, at: Date.now() });
  } finally {
    inflight.delete(id);
  }
}

/** Warm many at once (fire-and-forget). */
export function warmAvatars(discords: (string | null | undefined)[]): void {
  for (const d of discords) void warmAvatar(d);
}
