"use client";
/**
 * AETHER — Forecast Chart Component
 * Recharts area chart with 72h AQI forecast + ±1σ confidence band + GRAP stage badge.
 */

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { ForecastPoint } from "@/lib/api";
import { getAQIColor, getAQILevel } from "@/lib/aqi-colors";
import { format, parseISO } from "date-fns";

interface ForecastChartProps {
  forecasts: ForecastPoint[];
  currentAQI?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const aqiPayload = payload.find((p: any) => p.dataKey === "aqi");
    const upperPayload = payload.find((p: any) => p.dataKey === "upper");
    const lowerPayload = payload.find((p: any) => p.dataKey === "lower");

    const aqi = aqiPayload ? aqiPayload.value : null;
    const upper = upperPayload ? upperPayload.value : null;
    const lower = lowerPayload ? lowerPayload.value : null;

    const level = getAQILevel(aqi);
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl">
        <p className="text-gray-400 text-xs mb-1">{label}</p>
        <p className="font-bold text-lg" style={{ color: level.color }}>
          AQI {aqi !== null ? Math.round(aqi) : "—"}
        </p>
        <p className="text-xs font-semibold" style={{ color: level.color }}>
          {level.label}
        </p>
        {upper !== null && lower !== null && (
          <p className="text-xs text-gray-500 mt-1">
            ±1σ Range: {Math.round(lower)} – {Math.round(upper)}
          </p>
        )}
      </div>
    );
  }
  return null;
};

// GRAP Stage indicator — Graded Response Action Plan (India MoEFCC)
function GRAPBadge({ aqi }: { aqi: number | undefined }) {
  if (!aqi) return null;
  let stage: string;
  let color: string;
  let bg: string;
  let actions: string;
  if (aqi <= 200) {
    stage = "Stage 0 (Normal)";
    color = "#22c55e";
    bg = "rgba(34,197,94,0.08)";
    actions = "No mandatory restrictions. Public advisory issued.";
  } else if (aqi <= 300) {
    stage = "Stage I — GRAP";
    color = "#facc15";
    bg = "rgba(250,204,21,0.08)";
    actions = "Hot-mix plants & stone crushers off. Mechanised sweeping daily.";
  } else if (aqi <= 400) {
    stage = "Stage II — GRAP";
    color = "#f97316";
    bg = "rgba(249,115,22,0.08)";
    actions = "+ Ban on diesel generators. Strict dust suppression measures.";
  } else if (aqi <= 450) {
    stage = "Stage III — GRAP";
    color = "#ef4444";
    bg = "rgba(239,68,68,0.08)";
    actions = "+ BS-III petrol & BS-IV diesel cars banned. Remote work recommended.";
  } else {
    stage = "Stage IV — GRAP (EMERGENCY)";
    color = "#dc2626";
    bg = "rgba(220,38,38,0.12)";
    actions = "+ Truck entry ban. Schools closed. Construction halted city-wide.";
  }
  return (
    <div
      style={{
        background: bg,
        borderLeft: `3px solid ${color}`,
        padding: "8px 12px",
        borderRadius: "0 8px 8px 0",
        marginTop: 12,
      }}
    >
      <p style={{ color, fontWeight: 700, fontSize: 11, letterSpacing: "0.05em", marginBottom: 2 }}>
        ⚖️ {stage}
      </p>
      <p style={{ color: "#9ca3af", fontSize: 10 }}>{actions}</p>
    </div>
  );
}

export function ForecastChart({ forecasts, currentAQI }: ForecastChartProps) {
  if (!forecasts || forecasts.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500 text-sm">
        No forecast data available
      </div>
    );
  }

  const data = forecasts.map((f) => ({
    time: format(parseISO(f.forecast_for), "dd MMM HH:mm"),
    aqi: f.predicted_aqi,
    lower: f.confidence_lower ?? Math.max(0, f.predicted_aqi * 0.85),
    upper: f.confidence_upper ?? f.predicted_aqi * 1.15,
    category: f.predicted_category,
    band: [f.confidence_lower ?? f.predicted_aqi * 0.85, f.confidence_upper ?? f.predicted_aqi * 1.15],
  }));

  // AQI threshold lines
  const thresholds = [
    { value: 50, label: "Good", color: "#00e400" },
    { value: 100, label: "Satisfactory", color: "#92d050" },
    { value: 200, label: "Moderate", color: "#ffff00" },
    { value: 300, label: "Poor", color: "#ff7e00" },
    { value: 400, label: "Very Poor", color: "#ff0000" },
  ];

  const maxAQI = Math.max(...data.map((d) => d.upper), currentAQI || 0, 200);

  // Peak forecast AQI for GRAP badge
  const peakForecastAQI = data.length > 0 ? Math.max(...data.map((d) => d.aqi)) : currentAQI;

  return (
    <div>
      <div style={{ width: "100%", height: 220, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="aqiGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="upperBandGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#f97316" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="time"
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={{ stroke: "#374151" }}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, maxAQI + 50]}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* AQI threshold reference lines */}
            {thresholds.map((t) => (
              <ReferenceLine
                key={t.value}
                y={t.value}
                stroke={t.color}
                strokeDasharray="4 4"
                strokeOpacity={0.4}
                strokeWidth={1}
              />
            ))}

            {/* ±1σ Confidence band — upper envelope (orange tint) */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="url(#upperBandGradient)"
              fillOpacity={1}
              legendType="none"
              name="Upper σ"
            />

            {/* ±1σ Confidence band — lower mask fills back to chart bg */}
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="#030712"
              fillOpacity={1}
              legendType="none"
              name="Lower σ"
            />

            {/* Main AQI forecast line */}
            <Area
              type="monotone"
              dataKey="aqi"
              stroke="#f97316"
              strokeWidth={2.5}
              fill="url(#aqiGradient)"
              dot={false}
              activeDot={{ r: 5, fill: "#f97316", strokeWidth: 2, stroke: "#fff" }}
              name="AQI"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* GRAP compliance badge */}
      <GRAPBadge aqi={peakForecastAQI} />
    </div>
  );
}
