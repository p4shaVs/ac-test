"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icons } from "@/components/icons";
import { cn } from "@/lib/utils";

export function BuyButton({
  productId,
  productName,
  isLoggedIn,
  featured,
}: {
  productId: string;
  productName: string;
  isLoggedIn: boolean;
  featured: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function buy() {
    if (!isLoggedIn) {
      router.push(`/register?next=${encodeURIComponent("/pricing")}`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "Purchase failed");
      }
      // Lisans oluşturuldu → panele yönlendir.
      router.push("/dashboard/licenses?new=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={buy}
        disabled={loading}
        className={cn(
          "w-full",
          featured ? "btn-primary" : "btn-secondary",
          "py-3"
        )}
      >
        {loading ? (
          "Working…"
        ) : (
          <>
            <Icons.cart size={16} />
            {isLoggedIn ? `${productName} Al` : "Sign in to buy"}
          </>
        )}
      </button>
      {error && <p className="mt-2 text-center text-xs text-rose-400">{error}</p>}
    </div>
  );
}
