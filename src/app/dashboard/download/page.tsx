import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { PageHeader, EmptyState, LinkButton } from "@/components/ui";
import { DownloadCenter } from "./download-center";

export const metadata: Metadata = { title: "Download & Install" };
export const dynamic = "force-dynamic";

export default async function DownloadPage() {
  const user = (await getCurrentUser())!;

  const servers = await db.server.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, status: true, apiTokenHash: true },
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

  return (
    <>
      <PageHeader
        title="Download & Install"
        description="Pick a server, run the installer, and CoreAC configures itself."
      />
      <DownloadCenter
        appUrl={(env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}
        servers={servers.map((s) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          hasToken: !!s.apiTokenHash,
        }))}
      />
    </>
  );
}
