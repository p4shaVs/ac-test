// Donut / categorical chart palette.
//
// This lives in a plain (non-"use client") module on purpose. It used to be
// exported from components/charts.tsx, which is a client component. A server
// component (the server overview page) imported the array and read
// `DONUT_PALETTE.length`, which Next.js forbids across the client boundary
// ("Cannot access length.valueOf on the server. You cannot dot into a client
// module from a server component."). Keeping the constant here lets both the
// server page and the client chart import it freely.
export const DONUT_PALETTE = [
  "#6366f1",
  "#a855f7",
  "#22d3ee",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#818cf8",
  "#e879f9",
] as const;
