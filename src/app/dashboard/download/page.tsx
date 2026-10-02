import type { Metadata } from "next";
import { existsSync } from "fs";
import path from "path";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { DownloadCenter } from "./download-center";
import { WindowsInstaller } from "./windows-installer";

export const metadata: Metadata = { title: "Download & Install" };
export const dynamic = "force-dynamic";

export default async function DownloadPage() {
  const user = (await getCurrentUser())!;

  const servers = await db.server.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true, apiTokenHash: true, licenseKey: { select: { key: true, status: true } } },
  });

  if (servers.length === 0) {
    return (
      <>
        <PageHeader title="Download & Install" description="Install CoreAC on your FiveM server." />
        <EmptyState
          icon="server"
          title="Add a server first"
          description="Create a server with your licence key, then come back here to download the installer."
          action={
            <LinkButton href="/dashboard/servers/new" icon="plus">
              Add server
            </LinkButton>
          }
        />
      </>
    );
  }

  const licences = servers
    .filter((s) => s.licenseKey)
    .map((s) => ({ serverName: s.name, key: s.licenseKey!.key, status: s.licenseKey!.status }));
  const ready = existsSync(path.join(process.cwd(), "installer-win", "CoreAC-Setup.exe"));

  return (
    <>
      <PageHeader
        eyebrow="Install"
        title="Download & Install"
        description="Run CoreAC Setup on your server PC with your licence key — it finds the server, installs the resource and writes server.cfg."
      />
      <div className="space-y-8">
        <WindowsInstaller licences={licences} ready={ready} />
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Other ways to install</p>
          <DownloadCenter
            appUrl={(env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}
            servers={servers.map((s) => ({
              id: s.id,
              name: s.name,
              status: s.status,
              hasToken: !!s.apiTokenHash,
            }))}
          />
        </div>
      </div>
    </>
  );
}
