import { getServerAccess } from "@/lib/guards";
import { PageHeader } from "@/components/ui";
import { PunishmentLog } from "@/components/punishment-log";
import { loadPunishments } from "@/lib/punish-log";

export const dynamic = "force-dynamic";

export default async function WarnsPage({ params }: { params: { id: string } }) {
  const { server } = await getServerAccess(params.id);
  const rows = await loadPunishments(server.id, "WARN");

  return (
    <>
      <PageHeader
        eyebrow="Moderation"
        title="Warnings"
        description="Warnings sent to players by your staff or by CoreAC. Select one to see the reason and the raw record."
      />
      <PunishmentLog rows={rows} kind="WARN" />
    </>
  );
}
