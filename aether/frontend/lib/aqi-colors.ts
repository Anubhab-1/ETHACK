/**
 * AETHER — AQI Color Utilities
 * CPCB standard AQI color scale.
 */

export interface AQILevel {
  label: string;
  color: string;       // hex
  bgColor: string;     // tailwind bg class
  textColor: string;   // tailwind text class
  borderColor: string; // tailwind border class
  range: [number, number];
  emoji: string;
}

export const AQI_LEVELS: AQILevel[] = [
  {
    label: "Good",
    color: "#22c55e",
    bgColor: "bg-emerald-500",
    textColor: "text-emerald-400",
    borderColor: "border-emerald-500",
    range: [0, 50],
    emoji: "🟢",
  },
  {
    label: "Satisfactory",
    color: "#84cc16",
    bgColor: "bg-lime-500",
    textColor: "text-lime-400",
    borderColor: "border-lime-500",
    range: [51, 100],
    emoji: "🟡",
  },
  {
    label: "Moderate",
    color: "#eab308",
    bgColor: "bg-yellow-500",
    textColor: "text-yellow-400",
    borderColor: "border-yellow-500",
    range: [101, 200],
    emoji: "🟠",
  },
  {
    label: "Poor",
    color: "#f97316",
    bgColor: "bg-orange-500",
    textColor: "text-orange-400",
    borderColor: "border-orange-500",
    range: [201, 300],
    emoji: "🔴",
  },
  {
    label: "Very Poor",
    color: "#ef4444",
    bgColor: "bg-red-500",
    textColor: "text-red-400",
    borderColor: "border-red-500",
    range: [301, 400],
    emoji: "🔴",
  },
  {
    label: "Severe",
    color: "#991b1b",
    bgColor: "bg-red-900",
    textColor: "text-red-300",
    borderColor: "border-red-900",
    range: [401, 500],
    emoji: "🟣",
  },
];

export function getAQILevel(aqi: number | null | undefined): AQILevel {
  if (aqi === null || aqi === undefined) {
    return {
      label: "Unknown",
      color: "#6b7280",
      bgColor: "bg-gray-600",
      textColor: "text-gray-400",
      borderColor: "border-gray-600",
      range: [0, 0],
      emoji: "⚫",
    };
  }
  for (const level of AQI_LEVELS) {
    if (aqi >= level.range[0] && aqi <= level.range[1]) return level;
  }
  return AQI_LEVELS[AQI_LEVELS.length - 1];
}

export function getAQIColor(aqi: number | null): string {
  return getAQILevel(aqi).color;
}

/** Interpolate color from green to maroon based on AQI 0-500 */
export function aqiToLeafletColor(aqi: number | null): string {
  return getAQILevel(aqi).color;
}

/** Returns rgba for map choropleth */
export function aqiToFillColor(aqi: number): string {
  const level = getAQILevel(aqi);
  return level.color;
}

export const SOURCE_COLORS: Record<string, string> = {
  traffic: "#f97316",      // orange
  industrial: "#6366f1",   // indigo
  construction: "#eab308", // yellow
  biomass: "#22c55e",      // green
  residential: "#ec4899",  // pink
};

export const SOURCE_ICONS: Record<string, string> = {
  traffic: "🚗",
  industrial: "🏭",
  construction: "🏗️",
  biomass: "🔥",
  residential: "🏠",
};

export const SOURCE_LABELS: Record<string, string> = {
  traffic: "Vehicular Traffic",
  industrial: "Industrial Emissions",
  construction: "Construction Dust",
  biomass: "Biomass Burning",
  residential: "Residential",
};
