import { getServerAccess } from "@/lib/guards";
import { PageHeader } from "@/components/ui";
import { PunishmentLog } from "@/components/punishment-log";
import { loadPunishments } from "@/lib/punish-log";

export const dynamic = "force-dynamic";

export default async function KicksPage({ params }: { params: { id: string } }) {
  const { server } = await getServerAccess(params.id);
  const rows = await loadPunishments(server.id, "KICK");

  return (
    <>
      <PageHeader
        eyebrow="Moderation"
        title="Kicks"
        description="Players removed from the server — by CoreAC when a detection is set to Kick, or by your staff. Select one to see why, with the evidence and the raw record."
      />
      <PunishmentLog rows={rows} kind="KICK" />
    </>
  );
}
