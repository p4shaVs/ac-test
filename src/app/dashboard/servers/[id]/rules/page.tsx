import { getOwnedServer } from "@/lib/guards";
import { parseJson } from "@/lib/utils";
import { sanitizeAcConfig } from "@/lib/ac-config";
import { sanitizeRules } from "@/lib/rules";
import { sanitizeActions, sanitizeExplicit } from "@/lib/detection-actions";
import { readAcSettings } from "@/lib/ac-settings";
import { ConfigSections } from "./config-sections";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const config = parseJson<Record<string, unknown>>(server.config, {});
  const settings = readAcSettings(server.config);
  const features = parseJson<string[]>(server.licenseKey?.features ?? "[]", []);

  return (
    <ConfigSections
      serverId={server.id}
      ac={sanitizeAcConfig(config.ac)}
      rules={sanitizeRules(config.rules)}
      actions={sanitizeActions(config.actions)}
      explicit={sanitizeExplicit(config.actionsExplicit)}
      pause={settings.LogOnly ? "log_only" : settings.EnableBans === false ? "bans_off" : null}
      autoBanLicensed={features.includes("auto_ban")}
    />
  );
}
