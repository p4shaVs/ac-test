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

const BRAND = "#6366f1";
const VIOLET = "#a855f7";

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
            <stop offset="0%" stopColor={BRAND} stopOpacity={0.5} />
            <stop offset="100%" stopColor={BRAND} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="gBans" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.4} />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="label"
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          contentStyle={{ background: "#0d1019", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
          labelStyle={{ color: "#94a3b8" }}
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
            contentStyle={{ background: "#0d1019", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
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
        <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={18} />
        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} width={52} tickFormatter={fmt} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "#0d1019", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12 }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(v: number) => [fmt(v), "Revenue"]}
        />
        <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}
