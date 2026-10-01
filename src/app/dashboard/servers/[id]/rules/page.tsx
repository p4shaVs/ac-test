import { getOwnedServer } from "@/lib/guards";
import { parseJson } from "@/lib/utils";
import { sanitizeAcConfig } from "@/lib/ac-config";
import { sanitizeRules } from "@/lib/rules";
import { sanitizeActions, sanitizeExplicit } from "@/lib/detection-actions";
import { readAcSettings } from "@/lib/ac-settings";
import { ConfigPage } from "./config-page";

export const dynamic = "force-dynamic";

// One page for every protection: switches (config.ac / config.rules), punishments
// (config.actions) and the server-side settings — see src/lib/config-catalog.ts.
export default async function ConfigurationPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const config = parseJson<Record<string, unknown>>(server.config, {});
  const settings = readAcSettings(server.config);
  const features = parseJson<string[]>(server.licenseKey?.features ?? "[]", []);

  return (
    <ConfigPage
      serverId={server.id}
      initialAc={sanitizeAcConfig(config.ac)}
      initialRules={sanitizeRules(config.rules)}
      initialActions={sanitizeActions(config.actions)}
      initialExplicit={sanitizeExplicit(config.actionsExplicit)}
      pause={settings.LogOnly ? "log_only" : settings.EnableBans === false ? "bans_off" : null}
      autoBanLicensed={features.includes("auto_ban")}
    />
  );
}
