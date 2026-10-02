import { getServerAccess } from "@/lib/guards";
import { can } from "@/lib/team";
import { NoAccess } from "@/components/no-access";
import { readWebhookConfig } from "@/lib/discord";
import { ServerSettings } from "./server-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const { server, access } = await getServerAccess(params.id);
  if (!can(access, "settings")) return <NoAccess serverId={server.id} perm="settings" role={access.role} />;
  const wh = readWebhookConfig(server.config);

  return (
    <ServerSettings
      server={{
        id: server.id,
        name: server.name,
        ip: server.ip,
        maxSlots: server.maxSlots,
        discordWebhook: wh.url,
        webhookEvents: wh.events,
        hasToken: !!server.apiTokenHash,
      }}
      appUrl={process.env.APP_URL ?? ""}
      isOwner={access.isOwner}
    />
  );
}
