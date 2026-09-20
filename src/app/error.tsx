"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[APP_ERROR]", error);
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="max-w-md rounded-2xl border border-white/10 bg-base-850 p-8 text-center">
        <h2 className="text-xl font-bold text-white">Something went wrong</h2>
        <p className="mt-2 text-sm text-slate-400">
          Something went wrong while loading this page.
        </p>
        {error?.message && (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-base-950 p-3 text-left text-xs text-rose-300">
            {error.message}
          </pre>
        )}
        <button onClick={reset} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    </div>
  );
}
