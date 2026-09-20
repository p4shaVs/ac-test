import { getOwnedServer } from "@/lib/guards";
import { defaultRules, RULE_GROUPS } from "@/lib/rules";
import { SetupWizard } from "./setup-wizard";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params }: { params: { id: string } }) {
  const { server } = await getOwnedServer(params.id);
  const labels = Object.fromEntries(RULE_GROUPS.flatMap((g) => g.rules.map((r) => [r.key, r.label])));
  return <SetupWizard serverId={server.id} defaults={defaultRules()} labels={labels} />;
}
