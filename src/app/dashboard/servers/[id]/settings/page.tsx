import { getOwnedServer } from "@/lib/guards";
import { readWebhookConfig } from "@/lib/discord";
import { readNetworkPolicy } from "@/lib/network-bans";
import { ServerSettings } from "./server-settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const { server } = await getOwnedServer(params.id);
  const wh = readWebhookConfig(server.config);
  const network = readNetworkPolicy(server.config);

  return (
    <ServerSettings
      server={{
        id: server.id,
        name: server.name,
        ip: server.ip,
        maxSlots: server.maxSlots,
        discordWebhook: wh.url,
        webhookEvents: wh.events,
        network,
        hasToken: !!server.apiTokenHash,
      }}
      appUrl={process.env.APP_URL ?? ""}
    />
  );
}
