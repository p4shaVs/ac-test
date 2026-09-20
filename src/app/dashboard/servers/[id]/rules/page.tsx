import { getOwnedServer } from "@/lib/guards";
import { parseJson } from "@/lib/utils";
import { sanitizeAcConfig } from "@/lib/ac-config";
import { sanitizeRules } from "@/lib/rules";
import { sanitizeActions } from "@/lib/detection-actions";
import { ConfigSections } from "./config-sections";

export const dynamic = "force-dynamic";

export default async function ConfigurationPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const config = parseJson<Record<string, unknown>>(server.config, {});

  return (
    <ConfigSections
      serverId={server.id}
      ac={sanitizeAcConfig(config.ac)}
      rules={sanitizeRules(config.rules)}
      actions={sanitizeActions(config.actions)}
    />
  );
}
