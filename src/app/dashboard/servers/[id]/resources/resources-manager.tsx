"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge } from "@/components/ui";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

export interface ResourceRow {
  id: string;
  name: string;
  state: string;
}

export function ResourcesManager({
  serverId,
  resources,
}: {
  serverId: string;
  resources: ResourceRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return resources.filter((r) => r.name.toLowerCase().includes(q));
  }, [resources, query]);

  const started = resources.filter((r) => r.state === "started").length;

  async function act(name: string, action: "start" | "stop" | "restart") {
    setBusy(name + action);
    try {
      const res = await fetch(`/api/servers/${serverId}/resource-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, action }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Icons.search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className="input pl-9" placeholder="Search resources…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="text-sm text-slate-500">
          {started}/{resources.length} running
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((r) => {
          const on = r.state === "started";
          return (
            <Card key={r.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", on ? "bg-emerald-500/10 text-emerald-300" : "bg-white/5 text-slate-500")}>
                    <Icons.cube size={16} />
                  </span>
                  <span className="truncate font-mono text-sm text-slate-200">{r.name}</span>
                </div>
                <Badge tone={on ? "green" : "gray"} dot>{on ? "Running" : "Durdu"}</Badge>
              </div>
              <div className="mt-3 flex gap-1.5 border-t border-white/5 pt-3">
                {on ? (
                  <button onClick={() => act(r.name, "stop")} disabled={!!busy} className="btn-ghost flex-1 text-xs hover:text-rose-300">
                    Stop
                  </button>
                ) : (
                  <button onClick={() => act(r.name, "start")} disabled={!!busy} className="btn-ghost flex-1 text-xs hover:text-emerald-300">
                    Start
                  </button>
                )}
                <button onClick={() => act(r.name, "restart")} disabled={!!busy} className="btn-secondary flex-1 text-xs">
                  {busy === r.name + "restart" ? "…" : "Restart"}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
