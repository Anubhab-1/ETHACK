"use client";
/**
 * AETHER — Forecast Chart Component
 * Recharts area chart with 72h AQI forecast + confidence band.
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
    const bandPayload = payload.find((p: any) => p.dataKey === "band");

    const aqi = aqiPayload ? aqiPayload.value : null;
    const band = bandPayload ? bandPayload.value : null;

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
        {band && Array.isArray(band) && (
          <p className="text-xs text-gray-500 mt-1">
            Range: {Math.round(band[0])} – {Math.round(band[1])}
          </p>
        )}
      </div>
    );
  }
  return null;
};

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
    lower: f.confidence_lower ?? f.predicted_aqi * 0.85,
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

  return (
    <div style={{ width: "100%", height: 220, minWidth: 0 }}>
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="aqiGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0.0} />
          </linearGradient>
          <linearGradient id="bandGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#f97316" stopOpacity={0.05} />
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

        {/* Confidence band */}
        <Area
          type="monotone"
          dataKey="band"
          stroke="none"
          fill="url(#bandGradient)"
          fillOpacity={1}
        />

        {/* AQI line */}
        <Area
          type="monotone"
          dataKey="aqi"
          stroke="#f97316"
          strokeWidth={2.5}
          fill="url(#aqiGradient)"
          dot={false}
          activeDot={{ r: 5, fill: "#f97316", strokeWidth: 2, stroke: "#fff" }}
        />
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
}
