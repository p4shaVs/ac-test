import { getOwnedServer } from "@/lib/guards";
import { AutoRefresh } from "@/components/auto-refresh";

// Sunucu menüsü artık sol sidebar'da (PanelShell) gösteriliyor.
// Bu layout sahiplik kontrolü yapar ve tüm sunucu sayfalarını canlı tutar
// (oyuncu bağlanınca/veri değişince elle yenilemeye gerek kalmaz).
export default async function ServerLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  await getOwnedServer(params.id);
  return (
    <>
      <AutoRefresh seconds={5} />
      {children}
    </>
  );
}
