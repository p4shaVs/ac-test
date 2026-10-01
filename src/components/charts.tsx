"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Cell,
} from "recharts";
// Palette lives in a plain module (src/lib/palette.ts) so the server overview
// page can import it too — see the note there.
import { DONUT_PALETTE as DONUT_COLORS } from "@/lib/palette";

const BRAND = "#ececef";
const TICK = "#6b6b73";
const TOOLTIP = { background: "#141416", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#ececef" };

export interface SeriesPoint {
  label: string;
  detections: number;
  bans?: number;
}

/** Saatlik tespit + ban alan grafiği (son 24 saat). */
export function AreaTrend({ data }: { data: SeriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="gPlayers" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.22} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gBans" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fill: TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: TICK, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={TOOLTIP}
          labelStyle={{ color: "#a8a8b0" }}
        />
        <Area
          type="monotone"
          dataKey="detections"
          name="Detections"
          stroke={BRAND}
          strokeWidth={2}
          fill="url(#gPlayers)"
        />
        <Area
          type="monotone"
          dataKey="bans"
          name="Bans"
          stroke="#f43f5e"
          strokeWidth={2}
          fill="url(#gBans)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export interface DonutSlice {
  name: string;
  value: number;
}

/** Referanslardaki "Detections" / "Drop Reasons" donut grafiği. */
export function DonutChart({
  data,
  centerLabel,
  centerValue,
}: {
  data: DonutSlice[];
  centerLabel?: string;
  centerValue?: number;
}) {
  const total = centerValue ?? data.reduce((s, d) => s + d.value, 0);
  return (
    <div className="relative">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={TOOLTIP}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white">{total}</span>
        {centerLabel && (
          <span className="text-[11px] uppercase tracking-wider text-slate-500">
            {centerLabel}
          </span>
        )}
      </div>
    </div>
  );
}

export interface MoneyPoint {
  label: string;
  /** Whole currency units (e.g. euros), not cents. */
  amount: number;
}

/** Daily revenue bars (admin dashboard). */
export function MoneyBars({ data, currency = "EUR" }: { data: MoneyPoint[]; currency?: string }) {
  const fmt = (v: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -6, bottom: 0 }}>
        <XAxis dataKey="label" tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
        <YAxis tick={{ fill: TICK, fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickFormatter={fmt} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={TOOLTIP}
          labelStyle={{ color: "#a8a8b0" }}
          formatter={(v: number) => [fmt(v), "Revenue"]}
        />
        <Bar dataKey="amount" fill="#ececef" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
