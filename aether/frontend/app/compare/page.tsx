"use client";
/**
 * AETHER — Multi-City Intelligence Center v2.0
 * Ranked leaderboard, side-by-side source attribution charts,
 * ward pollution distribution, and city health comparison table.
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { api, LiveAQIPoint, HeatmapPoint, AttributionResponse } from "@/lib/api";
import { AQIBadge } from "@/components/AQIBadge";
import { getAQILevel, SOURCE_COLORS, SOURCE_ICONS, SOURCE_LABELS } from "@/lib/aqi-colors";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Cell,
} from "recharts";

const CITIES = ["Kolkata", "Delhi", "Mumbai"];

const CITY_META: Record<string, { emoji: string; tagline: string; color: string }> = {
  Kolkata: { emoji: "🏙️", tagline: "Eastern metropolitan capital", color: "#f97316" },
  Delhi: { emoji: "🏛️", tagline: "National Capital Territory", color: "#ef4444" },
  Mumbai: { emoji: "🌊", tagline: "Financial & coastal hub", color: "#3b82f6" },
};

interface CityMetrics {
  name: string;
  avgAqi: number | null;
  category: string;
  stationCount: number;
  activeStationCount: number;
  highestAqiStation: { name: string; aqi: number } | null;
  lowestAqiStation: { name: string; aqi: number } | null;
  distribution: {
    good: number;
    satisfactory: number;
    moderate: number;
    poor: number;
    veryPoor: number;
    severe: number;
  };
  pm25Avg: number | null;
  pm10Avg: number | null;
  attribution: AttributionResponse | null;
}

// Compact radar chart for source attribution per city
function SourceRadar({ attribution, color }: { attribution: AttributionResponse | null; color: string }) {
  if (!attribution) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-600 text-xs">No data</div>
    );
  }

  const data = Object.entries(attribution.breakdown).map(([key, value]) => ({
    subject: SOURCE_LABELS[key] || key,
    value: Math.round(value),
    fullMark: 100,
  }));

  return (
    <div style={{ width: "100%", height: 140, minWidth: 0 }}>
      <ResponsiveContainer width="100%" height={140}>
        <RadarChart data={data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
          <PolarGrid stroke="#1f2937" />
          <PolarAngleAxis dataKey="subject" tick={{ fill: "#6b7280", fontSize: 8 }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar name="Contribution %" dataKey="value" stroke={color} fill={color} fillOpacity={0.2} strokeWidth={1.5} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// Mini AQI health estimate
function healthImpact(aqi: number | null, city: string): { text: string; color: string; risk: string } {
  if (!aqi) return { text: "Data unavailable", color: "text-gray-500", risk: "Unknown" };
  const populations: Record<string, number> = { Kolkata: 15000000, Delhi: 33000000, Mumbai: 21000000 };
  const pop = populations[city] || 15000000;
  const exposedPct = aqi > 300 ? 95 : aqi > 200 ? 70 : aqi > 100 ? 40 : 10;
  const affectedK = Math.round((pop * exposedPct) / 100 / 1000);
  return {
    text: `~${affectedK.toLocaleString("en-IN")}K residents at risk`,
    color: aqi > 300 ? "text-red-400" : aqi > 200 ? "text-orange-400" : aqi > 100 ? "text-yellow-400" : "text-emerald-400",
    risk: aqi > 300 ? "Critical" : aqi > 200 ? "High" : aqi > 100 ? "Moderate" : "Low",
  };
}

// The Custom Tooltip
const DistTooltip = ({ active, payload, label }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-3 shadow-2xl text-xs">
        <p className="font-bold text-gray-200 mb-1">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex justify-between gap-4">
            <span style={{ color: p.fill }}>{p.dataKey}</span>
            <span className="font-mono font-bold text-gray-200">{p.value} wards</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

export default function ComparePage() {
  const [metrics, setMetrics] = useState<Record<string, CityMetrics>>({});
  const [loading, setLoading] = useState(true);

  const loadCityData = async () => {
    setLoading(true);
    try {
      const results: Record<string, CityMetrics> = {};

      await Promise.all(
        CITIES.map(async (cityName) => {
          const [live, heatmap] = await Promise.all([
            api.liveAQI(cityName),
            api.heatmap(cityName),
          ]);

          // Try to get attribution for the most polluted ward
          let attribution: AttributionResponse | null = null;
          try {
            if (heatmap.length > 0) {
              const worstWard = [...heatmap].sort((a, b) => b.aqi - a.aqi)[0];
              attribution = await api.attribution(worstWard.ward_id);
            }
          } catch { /* attribution is optional */ }

          const validReadings = live.filter((s) => s.aqi !== null);
          const avgAqi = validReadings.length
            ? Math.round(validReadings.reduce((sum, s) => sum + s.aqi!, 0) / validReadings.length)
            : null;

          const level = getAQILevel(avgAqi);

          const sorted = [...validReadings].sort((a, b) => b.aqi! - a.aqi!);
          const highest = sorted.length > 0 ? { name: sorted[0].name, aqi: sorted[0].aqi! } : null;
          const lowest = sorted.length > 0 ? { name: sorted[sorted.length - 1].name, aqi: sorted[sorted.length - 1].aqi! } : null;

          const distribution = { good: 0, satisfactory: 0, moderate: 0, poor: 0, veryPoor: 0, severe: 0 };
          heatmap.forEach((w) => {
            if (w.aqi <= 50) distribution.good++;
            else if (w.aqi <= 100) distribution.satisfactory++;
            else if (w.aqi <= 200) distribution.moderate++;
            else if (w.aqi <= 300) distribution.poor++;
            else if (w.aqi <= 400) distribution.veryPoor++;
            else distribution.severe++;
          });

          // PM averages
          const withPm25 = validReadings.filter((s) => s.pm25 !== null);
          const pm25Avg = withPm25.length > 0 ? Math.round(withPm25.reduce((s, r) => s + r.pm25!, 0) / withPm25.length) : null;
          const withPm10 = validReadings.filter((s) => s.pm10 !== null);
          const pm10Avg = withPm10.length > 0 ? Math.round(withPm10.reduce((s, r) => s + r.pm10!, 0) / withPm10.length) : null;

          results[cityName] = {
            name: cityName,
            avgAqi,
            category: level.label,
            stationCount: live.length,
            activeStationCount: validReadings.length,
            highestAqiStation: highest,
            lowestAqiStation: lowest,
            distribution,
            pm25Avg,
            pm10Avg,
            attribution,
          };
        })
      );

      setMetrics(results);
    } catch (e) {
      console.error("Failed to load multi-city compare data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCityData();
  }, []);

  // Ranked city order by AQI descending (worst first)
  const rankedCities = useMemo(() =>
    CITIES
      .filter((c) => metrics[c])
      .sort((a, b) => (metrics[b]?.avgAqi ?? 0) - (metrics[a]?.avgAqi ?? 0)),
    [metrics]
  );

  // Chart data
  const distributionChartData = CITIES.map((cityName) => ({
    name: cityName,
    Good: metrics[cityName]?.distribution.good ?? 0,
    Satisfactory: metrics[cityName]?.distribution.satisfactory ?? 0,
    Moderate: metrics[cityName]?.distribution.moderate ?? 0,
    Poor: metrics[cityName]?.distribution.poor ?? 0,
    "Very Poor": metrics[cityName]?.distribution.veryPoor ?? 0,
    Severe: metrics[cityName]?.distribution.severe ?? 0,
  }));

  const pm25ChartData = CITIES.map((c) => ({
    name: c,
    "PM2.5": metrics[c]?.pm25Avg ?? 0,
    "PM10": metrics[c]?.pm10Avg ?? 0,
  }));

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/8 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-0 bg-gray-950/95 backdrop-blur-md flex-none z-[1100] sticky top-0 shadow-md">
        <div className="flex items-center gap-4 justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-orange-500 font-black text-lg hover:text-orange-400 transition-colors">⬡ AETHER</Link>
            <span className="text-gray-700">·</span>
            <h1 className="font-bold text-sm text-gray-200">Multi-City Intelligence</h1>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto whitespace-nowrap scrollbar-none py-1 sm:py-0 w-full sm:w-auto">
          <Link href="/dashboard" className="nav-link">🗺️ Dashboard</Link>
          <Link href="/forecast" className="nav-link">📈 Forecast</Link>
          <Link href="/enforcement" className="nav-link">⚡ Enforcement</Link>
          <Link href="/compare" className="nav-link active">🏙️ Compare</Link>
          <Link href="/reports" className="nav-link">📢 Citizen Hub</Link>
          <Link href="/advisory" className="nav-link">💬 Advisory</Link>
        </nav>
        <button
          onClick={loadCityData}
          disabled={loading}
          className="px-3 py-1.5 text-xs rounded bg-gray-800 border border-gray-700 hover:text-orange-400 hover:border-orange-500 transition-colors disabled:opacity-50 font-semibold cursor-pointer w-full sm:w-auto mt-1 sm:mt-0"
        >
          {loading ? "Refreshing..." : "⟳ Refresh All"}
        </button>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-gray-400 text-sm">Aggregating atmospheric census records...</p>
            <p className="text-gray-600 text-xs mt-1">Querying Kolkata · Delhi · Mumbai sensor networks</p>
          </div>
        ) : (
          <>
            {/* ── SECTION 1: Ranked Leaderboard ─────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-gray-200 text-base">City Air Quality Leaderboard</h2>
                  <p className="text-xs text-gray-500">Ranked by average AQI — worst to best</p>
                </div>
                <span className="text-[10px] text-gray-500 bg-gray-900 border border-gray-800 px-2 py-1 rounded font-mono">
                  LIVE · {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {rankedCities.map((cityName, rank) => {
                  const city = metrics[cityName];
                  if (!city) return null;
                  const lvl = getAQILevel(city.avgAqi);
                  const meta = CITY_META[cityName];
                  const impact = healthImpact(city.avgAqi, cityName);
                  const rankLabel = ["🥇", "🥈", "🥉"][rank] || `#${rank + 1}`;
                  return (
                    <div
                      key={cityName}
                      className="glass-card p-5 flex flex-col gap-4 hover:border-white/20 transition-all duration-300 relative overflow-hidden group"
                    >
                      {/* Background glow */}
                      <div
                        className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-10 group-hover:opacity-20 transition-opacity pointer-events-none"
                        style={{ backgroundColor: lvl.color }}
                      />

                      {/* Header row */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xl">{rankLabel}</span>
                            <h2 className="text-xl font-black tracking-tight text-gray-100">{meta.emoji} {cityName}</h2>
                          </div>
                          <p className="text-[10px] text-gray-500">{meta.tagline}</p>
                          <p className="text-[10px] text-gray-500 mt-0.5">
                            {city.activeStationCount}/{city.stationCount} sensors active
                          </p>
                        </div>
                        <AQIBadge aqi={city.avgAqi} size="lg" />
                      </div>

                      {/* AQI bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] text-gray-500">
                          <span>AQI Level</span>
                          <span className="font-bold" style={{ color: lvl.color }}>{city.category}</span>
                        </div>
                        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min(100, ((city.avgAqi ?? 0) / 500) * 100)}%`,
                              backgroundColor: lvl.color,
                            }}
                          />
                        </div>
                      </div>

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {city.pm25Avg !== null && (
                          <div className="bg-gray-900/60 rounded-lg p-2 border border-white/5">
                            <span className="text-gray-500 text-[9px] block uppercase font-semibold">PM2.5</span>
                            <span className="text-gray-200 font-bold font-mono">{city.pm25Avg} µg/m³</span>
                          </div>
                        )}
                        {city.pm10Avg !== null && (
                          <div className="bg-gray-900/60 rounded-lg p-2 border border-white/5">
                            <span className="text-gray-500 text-[9px] block uppercase font-semibold">PM10</span>
                            <span className="text-gray-200 font-bold font-mono">{city.pm10Avg} µg/m³</span>
                          </div>
                        )}
                        <div className="bg-gray-900/60 rounded-lg p-2 border border-white/5">
                          <span className="text-gray-500 text-[9px] block uppercase font-semibold">Worst Station</span>
                          <span className="text-gray-200 font-semibold text-[10px] leading-tight">
                            {city.highestAqiStation ? `${city.highestAqiStation.aqi} · ${city.highestAqiStation.name}` : "—"}
                          </span>
                        </div>
                        <div className="bg-gray-900/60 rounded-lg p-2 border border-white/5">
                          <span className="text-gray-500 text-[9px] block uppercase font-semibold">Cleanest</span>
                          <span className="text-gray-200 font-semibold text-[10px] leading-tight">
                            {city.lowestAqiStation ? `${city.lowestAqiStation.aqi} · ${city.lowestAqiStation.name}` : "—"}
                          </span>
                        </div>
                      </div>

                      {/* Health impact */}
                      <div className={`flex items-center gap-2 text-[10px] rounded-lg px-2.5 py-1.5 border border-white/5 bg-gray-900/40`}>
                        <span>⚕️</span>
                        <span className={impact.color}>{impact.text}</span>
                        <span className={`ml-auto font-bold text-[9px] ${impact.color}`}>{impact.risk}</span>
                      </div>

                      <Link
                        href="/dashboard"
                        className="w-full text-center py-2 rounded-lg bg-gray-900 border border-gray-800 hover:border-orange-500/50 hover:text-orange-400 text-xs font-semibold tracking-wide transition-all"
                      >
                        View {cityName} Map →
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── SECTION 2: Analysis Charts ─────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Distribution stacked bar chart */}
              <div className="lg:col-span-7 glass-card p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-gray-200">Ward Pollution Load Distribution</h3>
                  <p className="text-xs text-gray-500">Number of wards per CPCB AQI hazard bracket per city</p>
                </div>
                <div style={{ width: "100%", height: 260, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={distributionChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip content={<DistTooltip />} />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      <Bar dataKey="Good" stackId="a" fill="#00e400" />
                      <Bar dataKey="Satisfactory" stackId="a" fill="#92d050" />
                      <Bar dataKey="Moderate" stackId="a" fill="#d4b800" />
                      <Bar dataKey="Poor" stackId="a" fill="#ff7e00" />
                      <Bar dataKey="Very Poor" stackId="a" fill="#ff0000" />
                      <Bar dataKey="Severe" stackId="a" fill="#7e0023" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* PM2.5 & PM10 comparison */}
              <div className="lg:col-span-5 glass-card p-5 space-y-4">
                <div>
                  <h3 className="font-bold text-gray-200">Particulate Matter Comparison</h3>
                  <p className="text-xs text-gray-500">Average PM2.5 and PM10 (µg/m³) across active sensors</p>
                </div>
                <div style={{ width: "100%", height: 260, minWidth: 0 }}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={pm25ChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#111827", borderColor: "#374151", borderRadius: "12px" }}
                        itemStyle={{ fontSize: "11px" }}
                      />
                      <Legend wrapperStyle={{ fontSize: "10px" }} />
                      <Bar dataKey="PM2.5" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="PM10" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* ── SECTION 3: Source Attribution Radar ───────────────────── */}
            <div className="glass-card p-5 space-y-5">
              <div>
                <h3 className="font-bold text-gray-200">Pollution Source Attribution (Worst Ward)</h3>
                <p className="text-xs text-gray-500">AI-modelled contribution breakdown from the most polluted ward in each city</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-white/5">
                {CITIES.map((cityName) => {
                  const city = metrics[cityName];
                  if (!city) return null;
                  const meta = CITY_META[cityName];
                  return (
                    <div key={cityName} className="pt-4 md:pt-0 md:pl-6 first:pl-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <span>{meta.emoji}</span>
                        <h4 className="text-xs font-bold text-gray-300">{cityName}</h4>
                        {city.attribution && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 border border-orange-500/20 text-orange-400 font-bold">
                            {city.attribution.primary_source.replace("_", " ").toUpperCase()}
                          </span>
                        )}
                      </div>
                      <SourceRadar attribution={city.attribution} color={meta.color} />
                      {city.attribution && (
                        <p className="text-[9px] text-gray-500 leading-relaxed line-clamp-2">
                          {city.attribution.explanation}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── SECTION 4: Intervention Policy Table ──────────────────── */}
            <div className="glass-card p-5 space-y-4">
              <div>
                <h3 className="font-bold text-gray-200">Intervention Policy Recommendation Matrix</h3>
                <p className="text-xs text-gray-500">Contextual municipal actions based on current AQI levels</p>
              </div>
              <div className="overflow-x-auto border border-white/5 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-900 border-b border-white/5 text-gray-400 font-semibold uppercase tracking-wider text-[10px]">
                      <th className="p-3">City</th>
                      <th className="p-3">Avg AQI</th>
                      <th className="p-3">PM2.5</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Recommended Action</th>
                      <th className="p-3">Priority</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-gray-300">
                    {rankedCities.map((cityName) => {
                      const city = metrics[cityName];
                      if (!city) return null;
                      const avg = city.avgAqi ?? 0;
                      let action = "Maintain standard environmental monitoring.";
                      let severity = "text-emerald-400 bg-emerald-950/20 border-emerald-800/40";
                      let priority = "Normal";

                      if (avg > 300) {
                        action = "Emergency: deploy industrial caps, ban open burning, activate air purifier networks.";
                        severity = "text-red-400 bg-red-950/20 border-red-800/40";
                        priority = "P1 CRITICAL";
                      } else if (avg > 200) {
                        action = "Divert heavy transport, stop construction site dust, inspect factory flues.";
                        severity = "text-orange-400 bg-orange-950/20 border-orange-800/40";
                        priority = "P2 HIGH";
                      } else if (avg > 100) {
                        action = "Issue health advisories, monitor construction zones, enforce vehicle standards.";
                        severity = "text-yellow-400 bg-yellow-950/20 border-yellow-800/40";
                        priority = "P3 MODERATE";
                      }

                      return (
                        <tr key={cityName} className="hover:bg-white/2 transition-colors">
                          <td className="p-3 font-bold text-gray-200">
                            {CITY_META[cityName]?.emoji} {cityName}
                          </td>
                          <td className="p-3 font-mono font-black" style={{ color: getAQILevel(city.avgAqi).color }}>
                            {avg || "N/A"}
                          </td>
                          <td className="p-3 font-mono text-gray-400">
                            {city.pm25Avg !== null ? `${city.pm25Avg} µg/m³` : "—"}
                          </td>
                          <td className="p-3 text-gray-300">{city.category}</td>
                          <td className="p-3 text-gray-400 max-w-xs">{action}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${severity}`}>
                              {priority}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
