// Donut / categorical chart palette.
//
// This lives in a plain (non-"use client") module on purpose. It used to be
// exported from components/charts.tsx, which is a client component. A server
// component (the server overview page) imported the array and read
// `DONUT_PALETTE.length`, which Next.js forbids across the client boundary
// ("Cannot access length.valueOf on the server. You cannot dot into a client
// module from a server component."). Keeping the constant here lets both the
// server page and the client chart import it freely.
// Monochrome first (the panel is black/off-white); status colours only after
// the greys run out, so a busy donut still stays readable.
export const DONUT_PALETTE = [
  "#ececef",
  "#a8a8b0",
  "#6e6e76",
  "#46464c",
  "#f0605d",
  "#f2b33d",
  "#34d399",
  "#c4b5fd",
] as const;
