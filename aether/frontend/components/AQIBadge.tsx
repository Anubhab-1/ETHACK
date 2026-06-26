"use client";
/**
 * AETHER — AQI Badge Component v2.0
 * Color-coded badge with pulsing severity ring for critical levels.
 */

import { getAQILevel } from "@/lib/aqi-colors";

interface AQIBadgeProps {
  aqi: number | null;
  size?: "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
  pulse?: boolean;
}

const SIZE_CLASSES = {
  sm: { container: "px-2 py-0.5 text-xs", number: "text-sm font-bold" },
  md: { container: "px-3 py-1 text-sm", number: "text-base font-bold" },
  lg: { container: "px-4 py-2 text-base", number: "text-2xl font-black" },
  xl: { container: "px-6 py-3 text-lg", number: "text-4xl font-black" },
};

export function AQIBadge({ aqi, size = "md", showLabel = true, pulse }: AQIBadgeProps) {
  const level = getAQILevel(aqi);
  const sizes = SIZE_CLASSES[size];

  // Enable pulse ring for Poor/Very Poor/Severe (aqi > 200)
  const shouldPulse = pulse !== false && aqi !== null && aqi > 200;

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Pulsing ring for critical AQI */}
      {shouldPulse && (
        <div
          className="absolute inset-0 rounded-lg animate-ping opacity-30"
          style={{ backgroundColor: level.color }}
        />
      )}
      <div
        className={`relative inline-flex flex-col items-center rounded-lg border ${sizes.container} transition-all`}
        style={{
          backgroundColor: level.color + "22",
          borderColor: level.color + "88",
          color: level.color,
          boxShadow: shouldPulse ? `0 0 12px ${level.color}44` : undefined,
        }}
      >
        <span className={sizes.number}>{aqi !== null ? Math.round(aqi) : "—"}</span>
        {showLabel && (
          <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">
            {level.label}
          </span>
        )}
      </div>
    </div>
  );
}
