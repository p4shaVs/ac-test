import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/site-header";
import { Card, Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Documentation" };

const endpoints = [
  { method: "POST", path: "/api/v1/heartbeat", desc: "Sends server status and slot count, keeping it online." },
  { method: "POST", path: "/api/v1/players/sync", desc: "Syncs the list of online players." },
  { method: "POST", path: "/api/v1/detections", desc: "Reports a detection (aimbot, etc.)." },
  { method: "GET", path: "/api/v1/actions/pending", desc: "Fetches punishments issued from the panel." },
  { method: "POST", path: "/api/v1/actions/ack", desc: "Acknowledges punishments that were applied." },
  { method: "GET", path: "/api/v1/bans", desc: "Fetches the active ban list for the connection check." },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <span className="section-title text-brand-400">Documentation</span>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white">Start</h1>
        <p className="mt-4 text-slate-400">
          Core Shield Anti-Cheat&apos; on your server and using the API&apos;.
        </p>

        <section className="mt-12">
          <h2 className="text-xl font-semibold text-white">Installation</h2>
          <ol className="mt-4 space-y-3 text-slate-300">
            <li>1. Activate a licence in the panel and create a server.</li>
            <li>2. Take the API URL and token from Server Settings&apos;.</li>
            <li>3. Extract the resource into your <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-sm">resources</code> folder.</li>
            <li>4. <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-sm">ensure aeigs-anticheat</code> and start the server.</li>
          </ol>
        </section>

        <section id="api" className="mt-14 scroll-mt-20">
          <h2 className="text-xl font-semibold text-white">API reference</h2>
          <p className="mt-2 text-sm text-slate-400">
            Every request needs an <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-xs">Authorization: Bearer &lt;server-token&gt;</code> header.
          </p>
          <div className="mt-6 space-y-2">
            {endpoints.map((e) => (
              <Card key={e.path} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3 sm:w-64 sm:shrink-0">
                  <Badge tone={e.method === "GET" ? "blue" : "violet"}>{e.method}</Badge>
                  <code className="font-mono text-sm text-slate-200">{e.path}</code>
                </div>
                <p className="text-sm text-slate-400">{e.desc}</p>
              </Card>
            ))}
          </div>
          <p className="mt-6 rounded-xl border border-white/5 bg-base-900/40 px-4 py-3 text-sm text-slate-500">
            Full request examples are included with the resource download.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
