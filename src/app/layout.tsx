import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Font projeye gömülüdür (Google'a build/çalışma anında bağımlılık YOK).
// Modern, hafif kalın, geometrik gövdeli Plus Jakarta Sans.
const jakarta = localFont({
  src: [
    { path: "../fonts/PlusJakartaSans-400.woff2", weight: "400", style: "normal" },
    { path: "../fonts/PlusJakartaSans-500.woff2", weight: "500", style: "normal" },
    { path: "../fonts/PlusJakartaSans-600.woff2", weight: "600", style: "normal" },
    { path: "../fonts/PlusJakartaSans-700.woff2", weight: "700", style: "normal" },
    { path: "../fonts/PlusJakartaSans-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "Core Shield Anti-Cheat — cheat protection for FiveM",
    template: "%s · Core Shield Anti-Cheat",
  },
  description:
    "Anti-cheat, web panel and licence management for your FiveM server. Server-side godmode, silent aim and exploit detection, live map, ban and kick management.",
  applicationName: "Core Shield Anti-Cheat",
  keywords: ["fivem", "anticheat", "anti-cheat", "aeigs", "fivem panel"],
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#05060a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${jakarta.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
