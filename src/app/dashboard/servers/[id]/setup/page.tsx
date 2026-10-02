import { getServerAccess } from "@/lib/guards";
import { can } from "@/lib/team";
import { NoAccess } from "@/components/no-access";
import { defaultRules, RULE_GROUPS } from "@/lib/rules";
import { SetupWizard } from "./setup-wizard";

export const dynamic = "force-dynamic";

export default async function SetupPage({ params }: { params: { id: string } }) {
  const { server, access } = await getServerAccess(params.id);
  if (!can(access, "config")) return <NoAccess serverId={server.id} perm="config" role={access.role} />;
  const labels = Object.fromEntries(RULE_GROUPS.flatMap((g) => g.rules.map((r) => [r.key, r.label])));
  return <SetupWizard serverId={server.id} defaults={defaultRules()} labels={labels} />;
}
