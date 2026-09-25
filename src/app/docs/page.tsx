import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Card, Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Documentation" };

// Everything on this page describes the shipped resource. If a command, event
// or convar changes in fivem-resource/coreac, change it here too.

const TOC = [
  { id: "install", label: "Quick start" },
  { id: "manual", label: "Manual install" },
  { id: "integrate", label: "Integrating your scripts" },
  { id: "menu", label: "In-game admin menu" },
  { id: "console", label: "Console commands" },
  { id: "convars", label: "Convars" },
  { id: "punish", label: "How punishments work" },
  { id: "api", label: "API reference" },
];

const endpoints = [
  { method: "POST", path: "/api/v1/heartbeat", desc: "Keeps the server online and returns its configuration." },
  { method: "POST", path: "/api/v1/players/sync", desc: "Syncs the list of online players." },
  { method: "POST", path: "/api/v1/detections", desc: "Reports a detection; the answer says whether to kick or ban." },
  { method: "GET", path: "/api/v1/actions/pending", desc: "Punishments issued from the panel, waiting to be applied." },
  { method: "POST", path: "/api/v1/actions/ack", desc: "Confirms punishments that were applied." },
  { method: "GET", path: "/api/v1/bans", desc: "Active bans, checked when a player connects." },
  { method: "GET", path: "/api/v1/commands/pending", desc: "Console commands queued from the web console." },
  { method: "GET", path: "/api/v1/install/resource", desc: "Downloads the protected resource (used by the installer)." },
];

function Code({ children }: { children: string }) {
  return (
    <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-base-950 p-4 font-mono text-[12.5px] leading-relaxed text-slate-300">
      {children}
    </pre>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[13px] text-slate-200">{children}</code>;
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/5 pt-10 first:border-0 first:pt-0">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-slate-400">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <span className="section-title text-brand-400">Documentation</span>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">Set up {BRAND.name}</h1>
        <p className="mt-4 max-w-2xl text-slate-400">
          Install the resource, connect it to your panel, and wire up the few scripts that move or
          heal players so nobody honest is ever flagged.
        </p>

        <div className="mt-12 grid gap-10 lg:grid-cols-[200px_1fr]">
          <nav className="hidden lg:block">
            <div className="sticky top-24 space-y-1 border-l border-white/10">
              {TOC.map((t) => (
                <a key={t.id} href={`#${t.id}`} className="-ml-px block border-l border-transparent py-1.5 pl-4 text-sm text-slate-500 transition hover:border-brand-400 hover:text-slate-200">
                  {t.label}
                </a>
              ))}
            </div>
          </nav>

          <div className="min-w-0 space-y-10">
            <Section id="install" title="Quick start (one-click installer)">
              <ol className="list-decimal space-y-2 pl-5">
                <li>
                  Get a licence key — see <Link href="/purchase" className="text-brand-300 hover:text-brand-200">how to buy</Link> — and
                  add your server under <b className="text-slate-300">My Servers → New server</b>.
                </li>
                <li>Open <b className="text-slate-300">Download</b>, reveal the server token and download the installer.</li>
                <li>
                  Put <C>CoreAC-Installer-….bat</C> next to your <C>server.cfg</C> and double-click it. Paste the token when asked.
                </li>
                <li>Restart the server. It shows <span className="text-emerald-300">Online</span> in the panel within a minute.</li>
              </ol>
              <p>
                The installer checks your licence, installs the resource (under a random folder name unless you turn that off),
                writes the <C>server.cfg</C> lines above your other resources, and keeps a backup as <C>server.cfg.coreac.bak</C>.
                Running it again updates the same folder.
              </p>
            </Section>

            <Section id="manual" title="Manual install">
              <p>
                Download the resource zip from the Download page, extract it into <C>resources/</C> (you may rename the{" "}
                <C>coreac</C> folder) and add these lines <b className="text-slate-300">above</b> your other <C>ensure</C> lines:
              </p>
              <Code>{`set coreac_api "https://YOUR-PANEL/api/v1"
set coreac_token "coreac_srv_…"
add_ace resource.coreac command allow
ensure coreac`}</Code>
              <p>
                <C>add_ace</C> lets the web console run server commands. Screenshots need <C>screencapture</C> (or{" "}
                <C>screenshot-basic</C>) — ensure it exactly once.
              </p>
            </Section>

            <Section id="integrate" title="Integrating your scripts">
              <p>
                Most false flags come from scripts that legitimately teleport, revive or protect players. Tell {BRAND.name} first —
                these events work whatever your resource folder is called:
              </p>
              <Card className="space-y-4 p-5">
                <div>
                  <p className="text-sm font-semibold text-slate-200">Teleports (garages, houses, jobs, spawn selectors)</p>
                  <Code>{`-- server
TriggerEvent('coreac:markTeleport', source)
-- client (before SetEntityCoords)
TriggerEvent('coreac:markTeleport')`}</Code>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Revives and heals</p>
                  <Code>{`TriggerEvent('coreac:markRevive', source)   -- server
TriggerEvent('coreac:markRevive')           -- client`}</Code>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Safe zones, cutscenes, admin god mode (server)</p>
                  <Code>{`TriggerEvent('coreac:markImmune', source, 30000)  -- ms`}</Code>
                </div>
              </Card>
              <p>
                Death/last-stand states from QBCore, QBox and the common medical scripts are recognised automatically. Put your
                staff on the <b className="text-slate-300">Trust Whitelist</b> so tools from other admin menus (noclip, god mode)
                are never punished. The old <C>aeigs:markTeleport</C> / <C>aeigs:markRevive</C> event names still work.
              </p>
              <p>
                Only needed if you enable the matching option: <C>{`exports['<folder>']:giveWeapon(hash)`}</C> (Anti Weapon Spawn),{" "}
                <C>{`exports['<folder>']:canRagdoll(false)`}</C> (Anti No-Ragdoll) and{" "}
                <C>{`exports['<folder>']:newCheatPowerIncrease(x)`}</C> for nitro scripts that use engine power over 3×.
              </p>
            </Section>

            <Section id="menu" title="In-game admin menu">
              <p>
                Open it with <C>/acmenu</C> or <C>F6</C>. Add admins on your server&apos;s <b className="text-slate-300">Admins</b> page
                with the identifier shown by <C>/ac id</C>, and tick what each one may do — the server re-checks every action.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Players: heal, revive, repair vehicle, go to, bring, spectate, freeze, message, warn, screenshot, mute voice, disarm, wipe spawns, kick, ban.</li>
                <li>Tabs for bans (with unban), kicks, warnings, detections and server logs.</li>
                <li>Live detection alerts, player name tags, teleport to waypoint and a copy-my-position tool.</li>
              </ul>
            </Section>

            <Section id="console" title="Console commands">
              <p>Type these in the server console, or in the panel&apos;s Console page (the output shows up there too):</p>
              <Code>{`ac players                          list online players and their IDs
ac kick <id> <reason>               kick an online player
ac ban <id> [hours] <reason>        ban (no hours = permanent)
ac unban <Ban ID>                   lift a ban, e.g. ac unban AC-7K3QP9
ac baninfo <Ban ID>                 who, why and until when
ac announce <message>               banner on every player's screen
ac clear <peds|vehicles|objects|all> delete world entities (never players or occupied cars)
ac reload                           pull the configuration from the panel now`}</Code>
            </Section>

            <Section id="convars" title="Convars">
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[520px] text-sm">
                  <tbody>
                    {[
                      ["coreac_api", "Panel API URL (…/api/v1). Must be public for screenshots."],
                      ["coreac_token", "The server token from the Download page."],
                      ["coreac_detections", "\"false\" pauses every detection (test mode)."],
                      ["coreac_menu_key", "Admin menu key, default F6. Empty = no key."],
                      ["coreac_logo", "Public logo URL for the connect/ban card."],
                      ["coreac_ss_upload", "Custom screenshot upload URL (optional)."],
                    ].map(([k, v]) => (
                      <tr key={k} className="border-b border-white/5 last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] text-slate-200">{k}</td>
                        <td className="px-4 py-2.5 text-slate-400">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>Servers installed under the old name keep working: every <C>aeigs_*</C> convar is still read as a fallback.</p>
            </Section>

            <Section id="punish" title="How punishments work">
              <p>
                Every detection type has a confidence level. Only checks the server confirms itself can ban; signals that come
                from the player&apos;s own game can kick at most; noisy signals are only logged. You choose Log / Kick / Ban per type
                in <b className="text-slate-300">Configuration → Actions</b>, but the choice is capped by that confidence.
              </p>
              <p>
                Rolling out a new protection? Turn on <b className="text-slate-300">Log-Only Mode</b> under Configuration → Settings:
                everything is recorded, nobody is kicked or banned.
              </p>
            </Section>

            <Section id="api" title="API reference">
              <p>
                Every request needs an <C>Authorization: Bearer &lt;server-token&gt;</C> header. The resource handles all of this for
                you — the list is here for reference.
              </p>
              <div className="space-y-2">
                {endpoints.map((e) => (
                  <Card key={e.path} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3 sm:w-72 sm:shrink-0">
                      <Badge tone={e.method === "GET" ? "blue" : "violet"}>{e.method}</Badge>
                      <code className="font-mono text-sm text-slate-200">{e.path}</code>
                    </div>
                    <p className="text-sm text-slate-400">{e.desc}</p>
                  </Card>
                ))}
              </div>
            </Section>

            <div className="flex flex-col items-start gap-3 rounded-2xl border border-white/10 bg-base-900/50 p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-400">Stuck on something? Ask the team on Discord.</p>
              <a href={BRAND.discordUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary">
                <Icons.discord size={16} /> {BRAND.discordLabel}
              </a>
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
