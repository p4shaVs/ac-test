import Link from "next/link";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { LinkButton } from "@/components/ui";
import { Icons } from "@/components/icons";
import { Reveal } from "@/components/reveal";
import { HeroParallax } from "@/components/hero-parallax";
import { Faq } from "@/components/faq";
import { PlanGrid } from "@/components/plan-grid";
import { BRAND } from "@/lib/brand";

// The pricing section reads the live product catalogue. Rendering per request
// keeps `next build` from needing a database (see src/lib/env.ts).
export const dynamic = "force-dynamic";

// NOTE ON COPY: everything on this page has to be true of the shipped build.
// The old version carried invented social proof (a "6000+ customers" counter
// with placeholder avatars and a wall of fabricated five-star reviews) and
// superlatives like "the most advanced anti-cheat". That was removed — a
// security product that overstates itself is the first thing a buyer checks.
// Describe the mechanism instead; it is more convincing anyway.

export default function HomePage() {
  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <FaqSection />
        <PricingSection />
        <NeedHelp />
      </main>
      <SiteFooter />
    </div>
  );
}

/* ------------------------------- HERO ---------------------------------- */

function Hero() {
  return (
    <section className="relative">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid-faint [background-size:46px_46px] [mask-image:radial-gradient(ellipse_at_top_right,black,transparent_70%)]" />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-24 pt-16 sm:px-6 lg:grid-cols-2 lg:pt-24">
        <div>
          <h1 className="animate-slide-up text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl">
            {BRAND.name}{" "}
            <span className="bg-gradient-to-r from-brand-400 via-brand-300 to-accent-violet bg-clip-text text-transparent">
              Anti-Cheat
            </span>
          </h1>
          <p className="mt-6 max-w-lg animate-slide-up text-lg text-slate-400 [animation-delay:80ms]">
            Cheat detection for FiveM that runs where the player can&apos;t reach it.
            Bans come from what your <span className="font-semibold text-slate-200">server</span>{" "}
            observed — not from a script on the cheater&apos;s machine.
          </p>
          <div className="mt-8 flex animate-slide-up flex-col gap-3 [animation-delay:160ms] sm:flex-row">
            <LinkButton href="/pricing" icon="bolt" className="px-6 py-3 text-base">
              See pricing
            </LinkButton>
            <LinkButton href="/api/demo" variant="secondary" icon="cube" className="px-6 py-3 text-base">
              Open the demo panel
            </LinkButton>
          </div>

          {/* Product facts, not social proof. Every line is verifiable in the build. */}
          <ul className="mt-9 grid animate-fade-in gap-2.5 [animation-delay:240ms] sm:grid-cols-2">
            {[
              "Server-side godmode, silent-aim and blacklist checks",
              "Works on ESX, QBCore, QBox and standalone",
              "Log-only mode to roll out safely",
              "Every ban carries an ID and its evidence",
            ].map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-slate-400">
                <Icons.check size={15} className="mt-0.5 shrink-0 text-emerald-400" />
                {f}
              </li>
            ))}
          </ul>
        </div>

        <div className="animate-scale-in [animation-delay:120ms]">
          <HeroParallax />
        </div>
      </div>
    </section>
  );
}

/* ----------------------------- FEATURES -------------------------------- */

function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
      <Reveal className="text-center">
        <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">What you get</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
          One panel for the whole moderation loop: see what happened, decide, act, and keep the proof.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-5">
        <Reveal className="md:col-span-3">
          <FeatureCard
            icon="globe"
            title="Web panel"
            text="Run the server from the browser — players, bans, admins, console and every protection toggle."
          >
            <WebPanelMock />
          </FeatureCard>
        </Reveal>

        <Reveal delay={100} className="md:col-span-2">
          <FeatureCard
            icon="search"
            title="Player lookup"
            text="Search anyone who has connected: identifiers, linked accounts, warns, kicks and bans."
          >
            <LookupMock />
          </FeatureCard>
        </Reveal>

        <Reveal className="md:col-span-2">
          <FeatureCard
            icon="map"
            title="Live map"
            text="Where everyone is right now, with health and armour, updated from the server."
          >
            <MapMock />
          </FeatureCard>
        </Reveal>

        <Reveal delay={100} className="md:col-span-3">
          <FeatureCard
            icon="eye"
            title="Live screenshots"
            text="Pull a frame from any player's screen on demand, or watch several at once. Needs the screencapture resource."
          >
            <MonitoringMock />
          </FeatureCard>
        </Reveal>

        <Reveal className="md:col-span-3">
          <FeatureCard
            icon="config"
            title="In-game admin menu"
            text="Kick, ban, spectate, revive, repair, disarm, mute, wipe a cheater's spawns and teleport to a waypoint — plus live detection alerts. Per-admin permissions come from the panel."
          >
            <IngameMenuMock />
          </FeatureCard>
        </Reveal>

        <Reveal delay={100} className="md:col-span-2">
          <FeatureCard
            icon="activity"
            title="Ban evidence"
            text="Each auto-ban stores the seconds leading up to it — position, speed, health — plus a burst of screenshots."
          >
            <ReplayMock />
          </FeatureCard>
        </Reveal>
      </div>

      <div className="mt-10 flex items-center justify-center gap-3">
        <LinkButton href="/#pricing" variant="secondary">
          See pricing
        </LinkButton>
        <Link
          href="/docs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-300 hover:text-white"
        >
          Read the documentation <Icons.arrowRight size={15} />
        </Link>
      </div>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  text,
  children,
}: {
  icon: any;
  title: string;
  text: string;
  children: React.ReactNode;
}) {
  const Icon = (Icons as any)[icon];
  return (
    <div className="group flex h-full flex-col overflow-hidden rounded-2xl border border-white/5 bg-base-850/60 p-4 transition hover:border-brand-500/25">
      <div className="relative mb-4 flex-1 overflow-hidden rounded-xl border border-white/5 bg-base-900/60">
        {children}
      </div>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-500/10 text-brand-300">
          <Icon size={18} />
        </span>
        <div>
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">{text}</p>
        </div>
      </div>
    </div>
  );
}

/* --- Feature mockups (illustrations of the real panel, not live data) --- */

function WebPanelMock() {
  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11px] font-semibold text-white">Server analytics</div>
          <div className="text-[9px] text-slate-500">Last 24 hours</div>
        </div>
        <div className="flex gap-4 text-right">
          <div>
            <div className="text-sm font-bold text-white">—</div>
            <div className="text-[8px] text-slate-500">AVG</div>
          </div>
          <div>
            <div className="text-sm font-bold text-white">—</div>
            <div className="text-[8px] text-slate-500">PEAK</div>
          </div>
        </div>
      </div>
      <div className="h-28">
        <svg viewBox="0 0 320 100" className="h-full w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="wp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6366f1" stopOpacity="0.4" />
              <stop offset="1" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0,80 C40,78 55,40 90,42 C120,44 130,20 170,22 C210,24 220,60 260,55 C290,51 305,58 320,54 L320,100 L0,100 Z"
            fill="url(#wp)"
          />
          <path
            d="M0,80 C40,78 55,40 90,42 C120,44 130,20 170,22 C210,24 220,60 260,55 C290,51 305,58 320,54"
            fill="none"
            stroke="#818cf8"
            strokeWidth="1.5"
          />
        </svg>
      </div>
      <div className="mt-2 flex gap-2 text-[8px] text-slate-500">
        {["Delete vehicles", "Delete peds", "Delete objects"].map((b) => (
          <span key={b} className="rounded border border-white/10 px-2 py-1">
            {b}
          </span>
        ))}
      </div>
    </div>
  );
}

function LookupMock() {
  return (
    <div className="space-y-2 p-4">
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-base-850/60 px-2.5 py-2">
        <Icons.ban size={13} className="text-rose-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] text-slate-200">Ban record</div>
          <div className="text-[8px] text-slate-500">Godmode · server-confirmed</div>
        </div>
      </div>
      <div className="rounded-lg border border-white/5 bg-base-850/60 p-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-gradient text-[9px] font-bold text-white">
            P
          </span>
          <div>
            <div className="text-[10px] text-slate-200">Player</div>
            <div className="text-[8px] text-slate-500">license · steam · discord</div>
          </div>
        </div>
        <div className="mt-2 rounded bg-emerald-500/10 px-2 py-1 text-[8px] text-emerald-300">
          3 linked accounts found
        </div>
      </div>
      <div className="flex items-center justify-center pt-1">
        <Icons.search size={18} className="text-slate-600" />
      </div>
    </div>
  );
}

function MapMock() {
  return (
    <div className="relative h-full min-h-[150px] bg-gradient-to-br from-emerald-900/20 via-base-900 to-brand-900/20">
      <div className="absolute inset-0 bg-grid-faint [background-size:20px_20px] opacity-40" />
      {[[20, 30], [50, 45], [70, 25], [35, 65], [80, 60], [60, 75], [25, 50], [45, 20]].map(
        ([x, y], i) => (
          <span
            key={i}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/40"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              background: i % 3 === 0 ? "#f43f5e" : i % 3 === 1 ? "#f59e0b" : "#10b981",
            }}
          />
        )
      )}
    </div>
  );
}

function MonitoringMock() {
  return (
    <div className="grid grid-cols-4 gap-1 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="relative aspect-video overflow-hidden rounded bg-gradient-to-br from-slate-700/40 to-base-900"
        >
          <div className="absolute inset-0 bg-grid-faint [background-size:8px_8px] opacity-30" />
          <span className="absolute bottom-0.5 left-0.5 rounded bg-black/50 px-1 text-[6px] text-slate-300">
            [{1400 + i}]
          </span>
        </div>
      ))}
    </div>
  );
}

function IngameMenuMock() {
  return (
    <div className="grid grid-cols-2 gap-3 p-4">
      <div>
        <div className="text-[10px] font-semibold text-white">Announce</div>
        <div className="mt-1.5 h-6 rounded border border-white/5 bg-base-850/60" />
        <div className="mt-1.5 h-10 rounded border border-white/5 bg-base-850/60" />
        <div className="mt-1.5 rounded bg-brand-500/80 py-1 text-center text-[9px] font-medium text-white">
          Send
        </div>
      </div>
      <div>
        <div className="text-[10px] font-semibold text-white">Admin</div>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          {["Kick", "Ban", "Spectate", "Disarm", "Mute", "Wipe spawns"].map((b) => (
            <span
              key={b}
              className="rounded border border-white/10 bg-white/5 px-1.5 py-1 text-[7px] text-slate-300"
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReplayMock() {
  return (
    <div className="relative h-full min-h-[150px] bg-gradient-to-br from-slate-800/40 to-base-900">
      <div className="absolute inset-0 bg-grid-faint [background-size:16px_16px] opacity-25" />
      <div className="absolute inset-0 grid place-items-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 ring-1 ring-white/20 backdrop-blur">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
        <div className="h-full w-1/3 bg-brand-400" />
      </div>
    </div>
  );
}

/* --------------------------- HOW IT WORKS ------------------------------ */

function HowItWorks() {
  const steps = [
    {
      icon: "shieldCheck" as const,
      title: "The server watches",
      text: "Health that doesn't drop when a shot lands, an aim vector that doesn't point at the victim, a blacklisted model reaching entity creation. None of it can be switched off from the player's game.",
    },
    {
      icon: "activity" as const,
      title: "Confidence decides the punishment",
      text: "Each detection is graded. Only server-confirmed ones can ban; noisy checks are recorded for review and can never punish, no matter how they're configured.",
    },
    {
      icon: "logs" as const,
      title: "You keep the receipts",
      text: "Every action lands in the panel with a ban ID, the detection that caused it, and the state captured in the seconds before.",
    },
  ];

  return (
    <section id="detection" className="border-y border-white/5 bg-base-900/30 py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="mb-12 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Why false bans are hard here
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-400">
            Most false-positive complaints come from trusting a check that runs inside the
            cheater&apos;s own game. {BRAND.name} treats those as hints and keeps the verdict on the server.
          </p>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          {steps.map((s, i) => {
            const Icon = Icons[s.icon];
            return (
              <Reveal key={s.title} delay={i * 100}>
                <div className="h-full rounded-2xl border border-white/5 bg-base-850/60 p-6">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-300">
                    <Icon size={20} />
                  </span>
                  <h3 className="mt-4 text-base font-bold text-white">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.text}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------- FAQ ----------------------------------- */

function FaqSection() {
  return (
    <section id="faq" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:px-6">
      <Reveal className="mb-12 text-center">
        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Frequently asked questions
        </h2>
      </Reveal>
      <Faq />
    </section>
  );
}

/* ----------------------------- PRICING --------------------------------- */

function PricingSection() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
      <Reveal className="mb-12 text-center">
        <h2 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Choose your plan
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
          Orders are handled in a ticket on our Discord — pick a plan to see how it works.
        </p>
      </Reveal>
      <PlanGrid />
    </section>
  );
}

/* ---------------------------- NEED HELP -------------------------------- */

function NeedHelp() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
      <Reveal className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-white/10 bg-base-900/50 p-8 sm:p-10 lg:flex-row lg:items-center">
        <div>
          <h3 className="text-2xl font-bold text-white">Need a hand?</h3>
          <p className="mt-2 max-w-xl text-sm text-slate-400">
            Setup, configuration or a detection you don&apos;t understand — ask us. The
            documentation covers installation and every protection in the panel.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          <LinkButton href="/docs" variant="secondary" icon="book">
            Documentation
          </LinkButton>
          <LinkButton href={BRAND.discordUrl} external icon="discord">
            Ask on Discord
          </LinkButton>
        </div>
      </Reveal>
    </section>
  );
}
