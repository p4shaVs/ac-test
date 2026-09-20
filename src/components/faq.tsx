"use client";

import { useState } from "react";
import { Icons } from "./icons";
import { cn } from "@/lib/utils";

// Answers describe the shipped build. Anything we cannot back up (uptime
// promises, benchmark numbers, "detects everything") stays out — a buyer
// evaluating an anti-cheat will test the claims, and an overstated FAQ is the
// fastest way to lose them.
const ITEMS = [
  {
    q: "How does installation work?",
    a: "Activate your licence, drop the resource into your server, and paste the API URL and token from the panel into your server.cfg. Start the server and it appears online in the panel. It takes a few minutes and does not require touching your other resources.",
  },
  {
    q: "Will it hurt my server performance?",
    a: "The server-side checks run on events you already receive (weapon damage, explosions, entity creation) and on a one-second polling loop, so the added work scales with activity rather than player count. Measure it on your own server before committing — every server is different.",
  },
  {
    q: "What can it detect?",
    a: "Godmode, silent aim, damage multipliers, explosive and spoofed bullets, noclip, teleport, speed and super jump, aimbot, infinite ammo, blacklisted vehicles, peds, objects and weapons, forged and invisible explosions, executor overlays, cheat-menu textures and tampering with the anti-cheat itself. Each one is listed in the panel with the punishment it is allowed to apply.",
  },
  {
    q: "How do you avoid false bans?",
    a: "Every detection is graded by confidence. Only checks the server itself can verify may ban; detections reported by the player's own game client are capped at a kick, and noisy heuristics are recorded for review but can never punish — even if you set them to Ban. There is also a log-only mode that records everything and punishes nobody, so you can roll out on a live server first.",
  },
  {
    q: "Which frameworks does it support?",
    a: "ESX, QBCore, QBox and standalone. The server-side checks do not depend on a framework; the ones that need to know when a player spawned or was revived listen for the common framework events and fall back to a timer when none are present.",
  },
  {
    q: "Can I ban and kick from the web panel?",
    a: "Yes — ban, kick and warn from the panel, review ban history and linked accounts, and browse the server console. Commands reach the server on its next poll, a few seconds later.",
  },
  {
    q: "What does a banned player see?",
    a: "A branded screen with their ban ID and nothing else. The reason stays in your logs, so a cheater cannot learn which check caught them, and you can still look the ID up in the panel.",
  },
  {
    q: "Is there a demo?",
    a: "Yes. The demo panel opens a read-only account with sample data so you can walk through the whole interface without registering.",
  },
];

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {ITEMS.map((it, i) => {
        const isOpen = open === i;
        return (
          <div
            key={i}
            className={cn(
              "overflow-hidden rounded-2xl border transition",
              isOpen ? "border-brand-500/30 bg-base-850/70" : "border-white/5 bg-base-850/40"
            )}
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
            >
              <span className="text-sm font-semibold text-white">{it.q}</span>
              <Icons.chevronDown
                size={18}
                className={cn("shrink-0 text-slate-400 transition-transform", isOpen && "rotate-180")}
              />
            </button>
            <div
              className={cn(
                "grid transition-all duration-300 ease-out",
                isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
              )}
            >
              <div className="overflow-hidden">
                <p className="px-5 pb-5 text-sm leading-relaxed text-slate-400">{it.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
