import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ---------------------------------------------------------------------
        // Monochrome design system (2026-10): near-black surfaces, off-white text,
        // colour only where it means something (online / kick / ban / danger).
        // ---------------------------------------------------------------------
        // Surfaces, darkest first.
        base: {
          950: "#070708",
          900: "#0b0b0c",
          850: "#0f0f11",
          800: "#131315",
          750: "#18181a",
          700: "#1f1f22",
          600: "#2a2a2e",
          500: "#38383d",
        },
        // "Brand" is the neutral highlight: tints (bg-brand-500/10, border-brand-500/40),
        // light accent text (text-brand-300) and graphite gradients (brand-800/900).
        brand: {
          50: "#ffffff",
          100: "#fafafa",
          200: "#f0f0f2",
          300: "#dcdce0",
          400: "#a8a8b0",
          500: "#ececef",
          600: "#c4c4ca",
          700: "#8a8a92",
          800: "#46464c",
          900: "#28282c",
        },
        // Neutral text scale instead of the blue-tinted slate (all text-slate-* in the app).
        slate: {
          50: "#fafafa",
          100: "#f2f2f3",
          200: "#e4e4e7",
          300: "#cfcfd4",
          400: "#a3a3aa",
          500: "#7c7c84",
          600: "#55555c",
          700: "#3c3c42",
          800: "#26262a",
          900: "#17171a",
          950: "#0c0c0e",
        },
        accent: {
          cyan: "#7dd3fc",
          violet: "#c4b5fd",
          emerald: "#34d399",
          amber: "#fbbf24",
          rose: "#fb7185",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.10), 0 12px 32px -14px rgba(0,0,0,0.9)",
        card: "0 1px 0 0 rgba(255,255,255,0.035) inset, 0 16px 40px -24px rgba(0,0,0,0.95)",
        pop: "0 0 0 1px rgba(255,255,255,0.08), 0 24px 60px -20px rgba(0,0,0,0.95)",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(180deg, #2c2c31 0%, #1a1a1d 100%)",
        "grid-faint":
          "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(24px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in": {
          from: { opacity: "0", transform: "translateX(-18px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "page-enter": {
          from: { opacity: "0", transform: "translateY(14px) scale(0.995)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(255,255,255,0.25)" },
          "70%": { boxShadow: "0 0 0 10px rgba(255,255,255,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(255,255,255,0)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "marquee-rev": {
          from: { transform: "translateX(-50%)" },
          to: { transform: "translateX(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "slide-up": "slide-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "slide-in": "slide-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
        "page-enter": "page-enter 0.5s cubic-bezier(0.22,1,0.36,1) backwards",
        float: "float 5s ease-in-out infinite",
        shimmer: "shimmer 1.6s infinite",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
        marquee: "marquee 40s linear infinite",
        "marquee-rev": "marquee-rev 46s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
