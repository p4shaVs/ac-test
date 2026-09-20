"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Sunucu bileşenlerini belirli aralıkla sessizce yeniler (router.refresh).
 * Böylece oyuncu bağlanınca/veri değişince sayfayı elle yenilemeye gerek kalmaz.
 * Sekme arka plandayken yenilemez (gereksiz yük olmasın).
 */
export function AutoRefresh({ seconds = 5 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        router.refresh();
      }
    }, Math.max(2, seconds) * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
