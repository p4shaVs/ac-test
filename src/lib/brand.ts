// Brand + sales links — single source of truth for the site, panel and emails.
//
// Purchases are handled by the team on Discord (ticket → payment → key). The
// site never issues a licence key by itself: every "Buy" button routes to
// /purchase, which explains the flow and links to the server below.
export const BRAND = {
  name: "CoreAC",
  tagline: "Anti-Cheat",
  domain: "coreac.online",
  discordUrl: "https://discord.gg/coreac",
  discordLabel: "discord.gg/coreac",
} as const;
