"use client";

// Root layout'ta oluşan hataları yakalar (aksi halde tamamen boş sayfa görünür).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="tr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#05060a",
          color: "#e2e8f0",
          fontFamily: "system-ui, Segoe UI, Roboto, sans-serif",
          padding: "1rem",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            textAlign: "center",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 16,
            padding: 32,
            background: "#0d1019",
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            The application failed to start
          </h2>
          <p style={{ color: "#94a3b8", fontSize: 14, marginTop: 8 }}>
            An unexpected error occurred. Check the terminal output.
          </p>
          {error?.message && (
            <pre
              style={{
                marginTop: 16,
                overflowX: "auto",
                background: "#05060a",
                padding: 12,
                borderRadius: 8,
                textAlign: "left",
                fontSize: 12,
                color: "#fda4af",
              }}
            >
              {error.message}
            </pre>
          )}
          <button
            onClick={reset}
            style={{
              marginTop: 24,
              padding: "10px 20px",
              borderRadius: 12,
              border: "none",
              background: "linear-gradient(135deg,#6366f1,#a855f7)",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
