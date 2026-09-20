"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, PageHeader, Badge, StatCard } from "@/components/ui";
import { Icons } from "@/components/icons";
import { isValidEventName } from "@/lib/events-config";

export function EventsManager({
  serverId,
  events,
  known,
  recentHits,
}: {
  serverId: string;
  events: string[];
  known: string[];
  recentHits: number;
}) {
  const router = useRouter();
  const [list, setList] = useState<string[]>(events);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string[]) {
    setSaving(true);
    setError(null);
    const prev = list;
    setList(next);
    try {
      const res = await fetch(`/api/servers/${serverId}/protected-events`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ events: next }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Could not save");
      setList(json.data.events);
      router.refresh();
    } catch (e) {
      setList(prev);
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  function add() {
    const e = value.trim();
    if (!isValidEventName(e)) {
      setError("Enter a valid event name (letters, numbers, . : _ -).");
      return;
    }
    if (list.includes(e)) {
      setError("That event is already protected.");
      return;
    }
    setValue("");
    void save([...list, e]);
  }

  function remove(e: string) {
    void save(list.filter((x) => x !== e));
  }

  return (
    <>
      <PageHeader
        title="Protected Events"
        description="Trap events that cheat menus fire. Any player who triggers one is caught."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard label="Protected events" value={list.length} icon="shieldCheck" accent="brand" />
        <StatCard label="Caught (7d)" value={recentHits} icon="ban" accent={recentHits ? "rose" : "emerald"} />
        <StatCard label="Built-in traps" value={`${known.length}+`} icon="lock" accent="violet" sub="always on" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
            <Icons.activity size={16} className="text-brand-400" /> Your protected events
          </h3>
          <p className="mb-4 text-xs text-slate-500">
            Add an event <b className="text-slate-300">one at a time</b> and test it. When a player fires it, they are flagged
            (kick — never an auto-ban, so a mistake can&apos;t ban anyone).
          </p>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Icons.plus size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                className="input pl-9 font-mono text-sm"
                placeholder="myresource:client:doThing"
                value={value}
                onChange={(e) => { setValue(e.target.value); setError(null); }}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <button className="btn-primary" onClick={add} disabled={saving || !value.trim()}>
              {saving ? "…" : "Protect"}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

          <div className="mt-4">
            {list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center text-sm text-slate-500">
                No protected events yet. Add a cheat-menu event above to start trapping it.
              </div>
            ) : (
              <ul className="space-y-2">
                {list.map((e) => (
                  <li key={e} className="flex items-center gap-3 rounded-xl border border-white/5 bg-base-900/40 px-4 py-2.5">
                    <Icons.shieldCheck size={15} className="shrink-0 text-emerald-300" />
                    <code className="flex-1 truncate font-mono text-sm text-slate-200">{e}</code>
                    <Badge tone="green" dot>Trapped</Badge>
                    <button
                      onClick={() => remove(e)}
                      disabled={saving}
                      title="Remove"
                      className="grid h-7 w-7 place-items-center rounded-lg border border-white/10 text-slate-400 transition hover:border-rose-500/40 hover:text-rose-300"
                    >
                      <Icons.trash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="border-amber-500/20 bg-amber-500/[0.03]">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
              <Icons.warn size={16} /> Add carefully
            </h3>
            <p className="text-xs leading-relaxed text-amber-200/80">
              Only add events that <b>no legitimate resource</b> on your server ever fires. Adding an event your own scripts
              use will flag real players. When unsure, add it and watch the Events feed for a day before trusting it.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-amber-200/70">
              Client-local events only for now — don&apos;t add server→client events like{" "}
              <code className="font-mono">hospital:client:Revive</code>.
            </p>
          </Card>

          <Card>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
              <Icons.lock size={15} className="text-brand-400" /> Built-in traps
            </h3>
            <p className="mb-3 text-xs text-slate-500">Known cheat-menu events we trap out of the box — no setup needed.</p>
            <ul className="space-y-1.5">
              {known.map((e) => (
                <li key={e}>
                  <code className="block truncate rounded-lg bg-base-900/50 px-2.5 py-1.5 font-mono text-xs text-slate-400">{e}</code>
                </li>
              ))}
              <li className="pt-1 text-xs text-slate-500">…and more, updated with the anti-cheat.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
