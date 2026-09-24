# Brag Plan: Core Shield Anti-Cheat (CoreAC)

## What is this app?
A commercial anti-cheat for FiveM servers: a Lua resource that detects cheating **server-side** (godmode, silent-aim, spawns, blacklisted models) plus a full web panel for the whole moderation loop — see it, decide, act, keep the proof. The angle that sells it: the detection runs where the cheater's machine can't touch it.

## The angle
Flip the category's dirty secret. Most FiveM anti-cheats run *on the player's PC* — i.e. they ask the cheater's own machine to report the cheater. CoreAC is **server-authoritative**: a ban comes from what the server observed, so it can't be spoofed by a script on the client. The video is a calm, premium product film that states this with confidence and then shows the panel doing the loop for real. No jokes, no fake metrics — every line on screen is a real, verifiable product claim (matches the product's own "product facts, not social proof" stance).

## Hook (first 2-3 seconds)
One line, slammed onto black, indigo accent on the twist:
**"Most anti-cheats ask the cheater to report themselves."**
It's provocative, true, and instantly frames why CoreAC is different. Hold it long enough to read (~2.4s), then cut hard to the reveal.

## Key moments (the middle)
- **The counter-truth reveal** — "Core Shield **Anti-Cheat**" wordmark assembles (gradient on "Anti-Cheat"), subline: *"Detection that runs where the player can't reach it."*
- **The panel doing the loop** (centerpiece) — a dark moderation panel: a flagged player row → a server-confirmed detection badge (`Godmode · server-confirmed`) → a **Ban ID** card snaps in (ID shown, no reason — exactly like the product). This is "see → decide → act → keep the proof."
- **Four real facts, one by one** — the hero's actual bullet list arrives beat-synced: *Server-side godmode, silent-aim & blacklist checks* · *ESX · QBCore · QBox · standalone* · *Log-only mode to roll out safely* · *Every ban carries an ID and its evidence*.
- **One-click install** — the newest feature: an installer file drops next to `server.cfg`, the cfg lines write themselves (`set aeigs_api…`, `ensure aeigs-anticheat`), and the panel flips the server to **ONLINE** (emerald).

## Outro / punchline
Logo lockup on black, one confident line: **"Bans your server can prove."** Small tag underneath: *Core Shield Anti-Cheat · FiveM*.

## User flow worth showing
The moderation loop (this is the centerpiece, not the landing page):
1. **Entry** — panel open, a live player list; one row flags amber.
2. **Key action** — a detection resolves server-side (`Godmode · server-confirmed`); the operator issues a ban.
3. **Result** — a **Ban ID** card is written with its evidence; the record is kept.
Secondary flow (outro): drop installer → `server.cfg` self-configures → server shows **ONLINE**.

## Tone
- Preset: **polished**
- Creative direction: *premium security-product film — server-authoritative, calm confidence, zero hype*
- Interpretation: fewer scenes, longer holds, restrained motion. Confidence comes from stillness and precision, not speed or flash. Red appears only on the ban beat (danger = red, everywhere else indigo/violet).

## Format: landscape — 1920x1080
## Duration: ~20s (target 18–21s)

## Visual identity (from the project)
- Background: **#05060a** (base-950); surface cards **#0a0c14 / #111420**, hairline borders `rgba(255,255,255,0.10)`
- Accent: **indigo #6366f1 → violet #a855f7** (`linear-gradient(135deg,#6366f1,#a855f7)`); secondary cyan **#22d3ee**
- Text: **#e2e8f0** (slate-200); muted **#94a3b8** (slate-400)
- Status: online/success **emerald #10b981**; danger/ban **rose #f43f5e** (sparingly)
- Display font: **Plus Jakarta Sans** (700–800). Body font: **Plus Jakarta Sans** (400–500)
- Strongest visual element: the dark panel with indigo-gradient accents, the **Ban ID** card, and the emerald **ONLINE** status dot; faint grid backdrop (`bg-grid-faint`, 46px) like the marketing hero.

## Share copy (draft)
Client-side anti-cheat asks the cheater to report themselves. Core Shield doesn't — every FiveM ban comes from what your **server** actually saw, carries an ID and its evidence, and installs in one click.

## Audio direction
- Role: confident low corporate bed; sparse, motion-matched SFX. Sound supports precision, never distracts.
- Music: **happy-beats-business-moves-vol-1** (bundled), 120.19 BPM. Low volume (~0.35), soft fade-in over scene 1, gentle duck under the ban beat, fade out on the outro. (If a cooler/darker cinematic bed is available, prefer it — the polished security mood leans restrained.)
- Music treatment: start the bed at the hook, let the strong-cue cluster at 16–20s carry the "four facts" reveals, land the outro line on the 20.02s strong beat.
- Music cue guidance: preset read from `assets/music/cues/happy-beats-business-moves-vol-1-…music-cues.md`. Strong cues to target: **17.02s / 18.52s / 20.02s** for the fact-card arrivals; beat grid ~0.50s apart if a sequential reveal needs a window — but hold each **text** card ≥0.8s (snap to every *other* beat, not every beat).
- Audio-reactive treatment: subtle — use bass/RMS to make the panel's indigo glow and the ONLINE dot breathe. No waveform bars.
- SFX posture: sparse, professional. A dry snap on the Ban ID card, a soft key-tick as `server.cfg` lines write, a clean confirm tone on ONLINE.
- Audio-coupled moments: cfg lines typing, fact cards arriving one-by-one, count-in of protection toggles, Ban ID snap.
- Restraint rule: no stingers on the hook, no big "whoosh" transitions, no comedic hits. This is a security product — audio stays quiet and exact.

## Storyboard

### Scene 1 — Hook — 3.0s
Pure black (#05060a) with the faint 46px grid barely visible top-right. One line slams in center: **"Most anti-cheats ask the cheater to report themselves."** — with "**report themselves**" in the indigo→violet gradient. Fast-in (~0.4s), then HOLD ~2.4s so it fully reads.
Sequential/interaction: none.
Audio intent: bed fades in quietly under the line; a single low sub on entrance, nothing more.
Audio-coupled idea: none (let the line sit).
Music: low confident bed, just starting.
Transition mood: hard cut → Scene 2

### Scene 2 — Reveal — 3.5s
Cut to the wordmark assembling on dark: **Core Shield** in white, **Anti-Cheat** in the indigo→violet gradient (mirrors the real hero). A small shield mark settles left of it. Subline fades under: *"Detection that runs where the player can't reach it."* Hold the subline ≥1.4s.
Sequential/interaction: wordmark parts settle, then subline — two clean beats.
Audio intent: bed opens up slightly; one soft, dry logo presence (not a stinger).
Audio-coupled idea: subline fade lands on a beat.
Transition mood: soft crossfade → Scene 3

### Scene 3 — The panel doing the loop — 7.0s (centerpiece)
Recreate the dark panel (base-950 bg, #111420 cards, white/10 borders, indigo accents). A compact live player list; row **"Ryder_M"** flags amber. A detection badge resolves on that row: **`Godmode · server-confirmed`** (indigo, with a small server icon to stress server-side). Operator action implied → a **Ban ID** card snaps in center-right: big mono **`Ban #A1F7‑… `**, an emerald "evidence kept" check, **no reason text** (true to product). Rose only touches the ban action, briefly.
Then, along the bottom, the four real product facts arrive one-by-one (beat-synced, each held ≥0.8s):
1. *Server-side godmode, silent-aim & blacklist checks*
2. *ESX · QBCore · QBox · standalone*
3. *Log-only mode to roll out safely*
4. *Every ban carries an ID and its evidence*
Sequential/interaction: yes — row flag → detection badge → Ban ID snap → four fact cards in sequence. Simulated operator moderation, not a slide.
Audio intent: precision. Dry snap on the Ban ID card; tiny ticks as each fact card lands; music ducks slightly under the ban.
Audio-coupled idea: fact cards land on strong cues 17.02 / 18.52 / 20.02s; Ban ID snap has a dry impact.
Transition mood: clean slide → Scene 4

### Scene 4 — One-click install + outro — 4.0s
Quick, satisfying: an installer file icon drops next to a `server.cfg` glyph; three lines type themselves into the cfg — `set aeigs_api "…"`, `set aeigs_token "•••"` (masked), `ensure aeigs-anticheat` — then the panel's server row flips to **ONLINE** with an emerald dot and a soft confirm tone. Cut to the logo lockup on black: **Core Shield Anti-Cheat**, one line beneath: **"Bans your server can prove."** Small tag: *FiveM · ESX · QBCore · QBox · standalone*.
Sequential/interaction: yes — cfg lines type in; ONLINE flips last.
Audio intent: soft key-ticks on the cfg lines, one clean confirm on ONLINE, bed resolves and fades on the final line.
Audio-coupled idea: typed cfg lines with subtle key ticks; confirm tone on ONLINE.
Transition mood: settle + fade to black.

**Music mood for this video:** polished / confident corporate bed (restrained)
**Audio summary:** A quiet, confident bed carries a calm security-product film — one low sub on the hook, precise dry accents on the ban and the self-writing cfg, an emerald confirm on ONLINE, resolving under a single closing line. Sound reinforces precision; it never performs.
