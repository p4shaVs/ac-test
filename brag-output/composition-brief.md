# Hyperframes Composition Brief: Core Shield Anti-Cheat (CoreAC)

## Objective
Create a short, polished launch-style brag video for Core Shield Anti-Cheat — a calm, premium security-product film whose single idea is *server-authoritative detection*.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: ~20s (18–21s)

## Source Material
- Project root: `C:\Users\hamza\Desktop\fivemAc-new-main`
- Primary files read: `src/app/page.tsx` (marketing hero + features), `tailwind.config.ts` + `src/app/globals.css` (theme), `src/app/layout.tsx` (font), plus the panel UI (`src/components/panel-shell.tsx`, bans / live-monitor / event-log pages) and the one-click installer (`src/lib/installer-script.ts`, Download page).
- Product name: **Core Shield Anti-Cheat** (brand: CoreAC)
- Tagline / strongest claim: *"Detection for FiveM that runs where the player can't reach it. Bans come from what your server observed — not from a script on the cheater's machine."*
- Key UI or visual moment to recreate: the dark moderation panel doing its loop — a flagged player row → a **server-confirmed** detection badge → a **Ban ID** card (ID shown, evidence kept, **no reason text**).
- Copy that must appear verbatim (all real product lines):
  - "Most anti-cheats ask the cheater to report themselves." (hook framing — not a product claim, keep as the thesis line)
  - "Core Shield Anti-Cheat"
  - "Detection that runs where the player can't reach it."
  - "Server-side godmode, silent-aim & blacklist checks"
  - "ESX · QBCore · QBox · standalone"  (from "Works on ESX, QBCore, QBox and standalone")
  - "Log-only mode to roll out safely"
  - "Every ban carries an ID and its evidence"
  - "Bans your server can prove." (outro)

## Creative Direction
- Tone preset: **polished**
- Creative direction: *premium security-product film — server-authoritative, calm confidence, zero hype*
- Interpretation: 4 scenes, longer holds, restrained motion; confidence through precision and stillness, not speed. Indigo/violet is the brand; red touches only the ban beat.
- Angle: Flip the category's secret — most FiveM anti-cheats run on the *player's* machine, i.e. they ask the cheater to report themselves. CoreAC is server-authoritative, so a ban reflects what the server actually saw and can't be spoofed client-side. State it plainly, then show the panel doing the loop for real. Every on-screen claim is verifiable in the build — no invented metrics.
- Hook: black screen, one line — **"Most anti-cheats ask the cheater to report themselves."** — "report themselves" in the indigo→violet gradient; fast-in then hold ~2.4s.
- Outro / punchline: logo lockup on black + **"Bans your server can prove."**
- Avoid:
  - Generic SaaS language ("streamline your workflow")
  - Abstract filler visuals / particle fields / equalizer bars
  - Any unrelated visual redesign — use the product's real dark indigo identity
  - Invented numbers, fake testimonials, or a "reason" line on the ban card (the product deliberately shows Ban ID without a reason)

## Visual Identity
- Background: **#05060a**; surface cards **#0a0c14 / #111420**; hairline borders `rgba(255,255,255,0.10)`
- Text: **#e2e8f0** (primary), **#94a3b8** (muted)
- Accent: indigo **#6366f1** → violet **#a855f7** (`linear-gradient(135deg,#6366f1,#a855f7)`); secondary cyan **#22d3ee**; online emerald **#10b981**; danger rose **#f43f5e** (ban only)
- Display font: **Plus Jakarta Sans** 700–800 (bundle the woff2 from `src/fonts/` or a close fallback)
- Body font: **Plus Jakarta Sans** 400–500
- Visual references from the project: faint 46px grid backdrop (`bg-grid-faint` masked to a corner), gradient-clipped "Anti-Cheat" wordmark, panel cards with `shadow-glow`, emerald ONLINE status dot, mono Ban ID card, self-writing `server.cfg` lines (`set aeigs_api`, `ensure aeigs-anticheat`).

## Storyboard
Use the storyboard in `brag-output/brag-plan.md` as the creative contract.

Scene summary:
1. Hook — 3.0s — one thesis line on black, "report themselves" gradient-accented, held to read.
2. Reveal — 3.5s — "Core Shield **Anti-Cheat**" wordmark + subline "Detection that runs where the player can't reach it."
3. The panel doing the loop — 7.0s — flagged row → `Godmode · server-confirmed` badge → **Ban ID** card (evidence kept, no reason) → four real product facts arrive one by one.
4. One-click install + outro — 4.0s — installer drops next to `server.cfg`; cfg lines type in; server flips **ONLINE**; logo + "Bans your server can prove."

## Audio
- Audio role: confident low corporate bed with sparse, motion-matched SFX.
- Audio arc: quiet fade-in on the hook → open slightly on the reveal → precise dry accents through the panel loop (duck under the ban) → soft confirm on ONLINE → resolve and fade under the final line.
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (bundled), 120.19 BPM. (If a darker/cooler cinematic bed is available, prefer it for the security mood.)
- Music treatment: low volume (~0.35), soft fade-in, gentle duck under the Ban ID beat, fade out under the outro line.
- Music cue guidance: preset at `assets/music/cues/happy-beats-business-moves-vol-1-…music-cues.md` (tempo 120.19, beat grid ~0.50s). Strong cues to target for the fact-card reveals: **17.02s / 18.52s / 20.02s**. Lock only the outro/logo landing + one fact-cluster to strong cues; hold each text card ≥0.8s (every *other* beat, not every beat).
- Audio-reactive treatment: subtle — drive the panel's indigo glow / Ban-card presence / ONLINE dot from bass/RMS. No waveform or EQ visuals.
- Audio-coupled moments:
  - Scene 3 fact cards — beat-grid sequence, one SFX tick per card at the visual timestamp.
  - Scene 3 Ban ID card — dry snap/impact on arrival.
  - Scene 4 cfg lines — subtle key ticks as each line types.
  - Scene 4 ONLINE flip — one clean confirm tone.
  - Scene 2 subline — settle on a beat.
- SFX selection guidance: use `<skill-dir>/assets/sfx/sfx-analysis.md`; prefer low high-frequency-risk files (interface clicks/switches for cfg ticks, a soft impact for the Ban card, a clean confirm for ONLINE). Keep it sparse — polished restraint.
- SFX analysis guidance: `<skill-dir>/assets/sfx/sfx-analysis.md` / `.json`.
- Exact SFX choice: Hyperframes selects filenames, timestamps, density, and volume after the animation exists.
- Audio files: copy the chosen music (staged at `brag-output/composition/assets/music/`) and any selected SFX into `brag-output/composition/assets/`.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`, `hyperframes-cli` — and build `brag-output/composition/` from this brief + `brag-plan.md`. Do not enter the generic hyperframes intent interview. Prefer native Hyperframes conventions.

Requirements:
- Show the real panel loop (flagged row → server-confirmed detection → Ban ID card) — at least one real UI/copy element from the project. Ban card shows an ID and "evidence kept", never a reason.
- Keep all text readable in the final render; honor the ≥0.8s text holds.
- Keep total duration 15–25s.
- Include the music/SFX layer; honor the duck-under-ban and fade-out-on-outro treatment.
- Beat-lock only 1–3 major moments (fact cluster ~17–20s, outro landing); snap sequential fact cards to the beat grid but not faster than reading allows.
- Subtle audio-reactive on glow/presence only; if ffmpeg/extraction is unavailable, document it and skip — do not block.
- Use local assets. Run `npx hyperframes check` before render — brag's single gate.

## ⚠ Environment status (read before building)
This handoff was prepared but **not built or rendered in this session** because the render toolchain isn't ready here:
- The Hyperframes domain skills (`hyperframes-core`, …) are **not installed** — only the `brag` skill is. `npx hyperframes` covers the CLI, but the composition-building guidance lives in those skills.
- **FFmpeg is not on PATH** (required to render `brag.mp4`).
- Executing `npx hyperframes …` was blocked by this session's sandbox (external code).
See `brag-output/HOW-TO-FINISH.md` for the exact steps to complete the build + render.
