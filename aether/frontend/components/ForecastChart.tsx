"use client";
/**
 * AETHER — Forecast Chart Component
 * Recharts area chart with 72h AQI forecast + ±1σ confidence band + GRAP stage badge.
 * Now shows 72 hourly points (not 3 aggregated) with Open-Meteo weather overlay.
 */

import {
  Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Line, ComposedChart,
} from "recharts";
import { ForecastPoint } from "@/lib/api";
import { getAQILevel } from "@/lib/aqi-colors";
import { format, parseISO } from "date-fns";

interface ForecastChartProps {
  forecasts: ForecastPoint[];
  currentAQI?: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const aqiPayload = payload.find((p: any) => p.dataKey === "aqi");
    const simulatedPayload = payload.find((p: any) => p.dataKey === "simulated");
    const upperPayload = payload.find((p: any) => p.dataKey === "upper");
    const lowerPayload = payload.find((p: any) => p.dataKey === "lower");
    const tempPayload  = payload.find((p: any) => p.dataKey === "temp_c");

    const aqi = aqiPayload ? aqiPayload.value : null;
    const simulated = simulatedPayload ? simulatedPayload.value : null;
    const upper = upperPayload ? upperPayload.value : null;
    const lower = lowerPayload ? lowerPayload.value : null;

    const level = getAQILevel(aqi);
    const simLevel = simulated !== null ? getAQILevel(simulated) : null;
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl">
        <p className="text-gray-400 text-xs mb-1.5">{label}</p>
        <div className="flex justify-between items-start gap-4">
          <div>
            <p className="text-[9px] text-gray-500 font-semibold uppercase tracking-wider mb-0.5">Predicted</p>
            <p className="font-bold text-base" style={{ color: level.color }}>
              AQI {aqi !== null ? Math.round(aqi) : "—"}
            </p>
            <p className="text-[10px] font-semibold" style={{ color: level.color }}>
              {level.label}
            </p>
          </div>
          {simulated !== null && simulated !== aqi && simLevel && (
            <div className="border-l border-white/10 pl-4">
              <p className="text-[9px] text-emerald-500 font-semibold uppercase tracking-wider mb-0.5">Simulated</p>
              <p className="font-bold text-base text-emerald-400">
                AQI {Math.round(simulated)}
              </p>
              <p className="text-[10px] font-semibold text-emerald-400">
                {simLevel.label}
              </p>
            </div>
          )}
        </div>
        {upper !== null && lower !== null && (
          <p className="text-xs text-gray-500 mt-2">
            ±1σ Range: {Math.round(lower)} – {Math.round(upper)}
          </p>
        )}
        {tempPayload && (
          <p className="text-xs text-blue-400 mt-1">🌡 {tempPayload.value}°C</p>
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

  // Detect forecast method from first data point (all share same method)
  const method = (forecasts[0] as any)?.method || "Persistence+Weather";
  const lowerMethod = method.toLowerCase();
  const isXGB = lowerMethod.startsWith("xgboost") || lowerMethod.includes("xgboost");
  const isSTGCN = lowerMethod.includes("st-gcn") || lowerMethod.includes("stgcn") || lowerMethod.includes("st_gcn") || lowerMethod.includes("st gcn");

  // Show every 6th tick label for 72-point datasets
  const tickInterval = forecasts.length > 10 ? 5 : 0;

  const data = forecasts.map((f) => ({
    time: format(parseISO(f.forecast_for), forecasts.length > 10 ? "dd HH:mm" : "dd MMM HH:mm"),
    aqi: f.predicted_aqi,
    simulated: (f as any).simulated_aqi !== undefined ? (f as any).simulated_aqi : null,
    lower: f.confidence_lower ?? Math.max(0, f.predicted_aqi * 0.85),
    upper: f.confidence_upper ?? f.predicted_aqi * 1.15,
    category: f.predicted_category,
    temp_c: (f as any).temp_c ?? null,
  }));

  const hasSimulated = data.some((d) => d.simulated !== null && d.simulated !== d.aqi);

  const thresholds = [
    { value: 50,  color: "#00e400" },
    { value: 100, color: "#92d050" },
    { value: 200, color: "#ffff00" },
    { value: 300, color: "#ff7e00" },
    { value: 400, color: "#ff0000" },
  ];

  const maxAQI = Math.max(...data.map((d) => d.upper), currentAQI || 0, 200);
  const peakForecastAQI = data.length > 0 ? Math.max(...data.map((d) => d.aqi)) : currentAQI;
  const hasTemp = data.some((d) => d.temp_c !== null);

  return (
    <div>
      {/* Method + source badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
          isSTGCN
            ? "bg-purple-600/15 text-purple-300 border border-purple-600/30"
            : isXGB
            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
            : "bg-gray-700/50 text-gray-400 border border-gray-600/30"
        }`}>
          {isSTGCN ? "🧠 ST-GCN" : isXGB ? "⚡ XGBoost+Weather" : "📊 Persistence+Weather"}
        </span>
        <span className="text-[9px] text-gray-600">
          {forecasts.length}h · Open-Meteo
        </span>
      </div>

      <div style={{ width: "100%", height: 220, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height={220}>
          <ComposedChart data={data} margin={{ top: 5, right: hasTemp ? 30 : 10, left: -20, bottom: 0 }}>
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
              interval={tickInterval}
            />
            <YAxis
              domain={[0, maxAQI + 50]}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            {hasTemp && (
              <YAxis
                yAxisId="temp"
                orientation="right"
                domain={["auto", "auto"]}
                tick={{ fill: "#3b82f6", fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}°`}
              />
            )}
            <Tooltip content={<CustomTooltip />} />

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

            {/* Upper CI band */}
            <Area
              type="monotone"
              dataKey="upper"
              stroke="none"
              fill="url(#upperBandGradient)"
              fillOpacity={1}
              legendType="none"
              name="Upper σ"
            />

            {/* Lower CI mask */}
            <Area
              type="monotone"
              dataKey="lower"
              stroke="none"
              fill="#030712"
              fillOpacity={1}
              legendType="none"
              name="Lower σ"
            />

            {/* Main AQI line */}
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

            {/* Simulated AQI line */}
            {hasSimulated && (
              <Line
                type="monotone"
                dataKey="simulated"
                stroke="#10b981"
                strokeWidth={2.5}
                strokeDasharray="5 5"
                dot={false}
                activeDot={{ r: 5, fill: "#10b981", strokeWidth: 2, stroke: "#fff" }}
                name="Simulated AQI"
              />
            )}

            {/* Temperature overlay */}
            {hasTemp && (
              <Line
                yAxisId="temp"
                type="monotone"
                dataKey="temp_c"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
                name="Temp °C"
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <GRAPBadge aqi={peakForecastAQI} />
    </div>
  );
}
