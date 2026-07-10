"use client";
/**
 * AETHER — 72-Hour Forecast & Policy Simulation Portal
 * Allows interactive location selection, hour-by-hour detail logs,
 * policy intervention simulation (Digital Twin mode), and CSV export.
 */

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { api, WardDetail, ForecastPoint } from "@/lib/api";
import { AQIBadge } from "@/components/AQIBadge";
import { ForecastChart } from "@/components/ForecastChart";
import { getAQILevel } from "@/lib/aqi-colors";
import { format, parseISO } from "date-fns";
import { AppShell } from "@/components/AppShell";

const CITIES = ["Kolkata", "Delhi", "Mumbai"];

interface SimulatedForecastPoint extends ForecastPoint {
  simulated_aqi?: number;
}

export default function ForecastPage() {
  const [city, setCity] = useState("Kolkata");
  const [wards, setWards] = useState<WardDetail[]>([]);
  const [selectedWardId, setSelectedWardId] = useState<number | "">("");
  const [selectedWard, setSelectedWard] = useState<WardDetail | null>(null);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  // Intervention simulation states (Digital Twin)
  const [trafficReduction, setTrafficReduction] = useState(0); // 0% to 100%
  const [constructionHalt, setConstructionHalt] = useState(false); // true/false
  const [industrialRestriction, setIndustrialRestriction] = useState(0); // 0% to 100%

  // Load wards for selected city
  const loadWards = async () => {
    setLoading(true);
    setError(null);
    try {
      const wardList = await api.wards(city);
      // Sort alphabetically by ward name
      const sorted = [...wardList].sort((a, b) => a.name.localeCompare(b.name));
      setWards(sorted);
      if (sorted.length > 0) {
        setSelectedWardId(sorted[0].id);
      } else {
        setSelectedWardId("");
        setSelectedWard(null);
        setForecast([]);
      }
    } catch (e) {
      console.error("Failed to load wards:", e);
      setError("Couldn't reach the AETHER backend. Note: Render free tier takes ~50s to wake up on initial load. Please wait a moment and click Retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWards();
  }, [city]);

  // Load forecast for selected ward
  const loadForecast = async () => {
    if (!selectedWardId) return;
    setForecastLoading(true);
    setError(null);
    try {
      const [wardDetail, attr] = await Promise.all([
        api.wardDetail(Number(selectedWardId)),
        api.attribution(Number(selectedWardId)),
      ]);
      
      // Merge attribution data so Digital Twin policy simulation runs
      wardDetail.attribution = attr.breakdown;
      setSelectedWard(wardDetail);

      const fcRes = await api.forecast(wardDetail.lat, wardDetail.lon, city);
      setForecast(fcRes.forecasts);
    } catch (e) {
      console.error("Failed to load forecast:", e);
      setError("Couldn't reach the AETHER backend. Note: Render free tier takes ~50s to wake up on initial load. Please wait a moment and click Retry.");
    } finally {
      setForecastLoading(false);
    }
  };

  useEffect(() => {
    loadForecast();
  }, [selectedWardId, city]);

  // Reset simulation sliders when ward changes
  useEffect(() => {
    setTrafficReduction(0);
    setConstructionHalt(false);
    setIndustrialRestriction(0);
  }, [selectedWardId]);

  // Calculate simulated forecasts based on sliders and current ward attributions
  const simulatedForecasts = useMemo<SimulatedForecastPoint[]>(() => {
    if (!forecast || forecast.length === 0 || !selectedWard || !selectedWard.attribution) {
      return forecast;
    }

    const attr = selectedWard.attribution;
    // Calculate total reduction potential (weighted by the source's contribution)
    const trafficWeight = (attr["traffic"] || attr["Traffic"] || 0) / 100;
    const constructionWeight = (attr["construction"] || attr["Construction"] || 0) / 100;
    const industrialWeight = (attr["industrial"] || attr["Industrial"] || 0) / 100;

    // e.g. reducing traffic by 50% reduces traffic-related AQI by 50%
    const trafficFactor = 1 - (trafficReduction / 100) * 0.7; // assume 70% policy efficiency
    const constructionFactor = constructionHalt ? 0.2 : 1.0; // assume halting construction removes 80% of construction pollution
    const industrialFactor = 1 - (industrialRestriction / 100) * 0.6; // assume 60% policy efficiency

    // Combined reduction percentage
    // e.g. reduction = (traffic_weight * (1 - trafficFactor)) + (construction_weight * (1 - constructionFactor)) ...
    const totalReduction =
      trafficWeight * (1 - trafficFactor) +
      constructionWeight * (1 - constructionFactor) +
      industrialWeight * (1 - industrialFactor);

    // Apply reduction to forecast points
    return forecast.map((f) => {
      const simulated = Math.max(10, f.predicted_aqi * (1 - totalReduction));
      return {
        ...f,
        simulated_aqi: Math.round(simulated),
      };
    });
  }, [forecast, selectedWard, trafficReduction, constructionHalt, industrialRestriction]);

  // Export forecast to CSV
  const handleExportCSV = () => {
    if (!selectedWard || simulatedForecasts.length === 0) return;

    const headers = [
      "Horizon (Hours)",
      "Target Date & Time",
      "Predicted AQI",
      "Predicted Category",
      "Confidence Lower Bound",
      "Confidence Upper Bound",
      "Simulated AQI (With Interventions)",
    ];

    const rows = simulatedForecasts.map((f) => [
      f.horizon_hours,
      format(parseISO(f.forecast_for), "yyyy-MM-dd HH:mm:ss"),
      f.predicted_aqi,
      f.predicted_category,
      f.confidence_lower ?? "",
      f.confidence_upper ?? "",
      f.simulated_aqi ?? "",
    ]);

    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `AETHER_Forecast_${selectedWard.name.replace(/\s+/g, "_")}_${city}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AppShell city={city}>
    <div className="min-h-full bg-gray-950 text-gray-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-white/8 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-0 bg-gray-950/95 backdrop-blur-md flex-none z-[1100] sticky top-0 shadow-md">
        <div className="flex items-center gap-4 justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-orange-500 font-black text-lg hover:text-orange-400 transition-colors">⬡ AETHER</Link>
            <span className="text-gray-700">·</span>
            <h1 className="font-bold text-sm text-gray-200">Predictive Intelligence</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-xs text-orange-400 hover:underline hidden sm:block">
            ← Situation Room
          </Link>
        </div>
      </header>

      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 overflow-y-auto">
        {/* Left Control Column (3 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-card p-4 space-y-4">
            <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider">
              Location Selector
            </h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">City</label>
                <select
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
                >
                  {CITIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Ward</label>
                {loading ? (
                  <div className="h-9 bg-gray-800 animate-pulse rounded-lg border border-gray-700" />
                ) : (
                  <select
                    value={selectedWardId}
                    onChange={(e) => setSelectedWardId(Number(e.target.value))}
                    className="w-full text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
                  >
                    {wards.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} (Ward #{w.ward_no})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>

          {/* Policy Simulator (Digital Twin) */}
          {selectedWard && selectedWard.attribution && (
            <div className="glass-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-orange-400 uppercase tracking-wider">
                  Digital Twin Policy Simulator
                </h2>
                <span className="text-[10px] bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded border border-orange-500/30 font-bold uppercase">
                  Interactive
                </span>
              </div>
              <p className="text-xs text-gray-500 leading-relaxed">
                Toggle municipal interventions below. AETHER uses the ward's geospatial source weights to recalculate and project simulated AQI reductions in real-time.
              </p>

              <div className="space-y-4 pt-2">
                {/* Traffic Intervention */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300 font-medium">🚗 Traffic Restrictions</span>
                    <span className="text-orange-400 font-bold">{trafficReduction}% reduction</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={trafficReduction}
                    onChange={(e) => setTrafficReduction(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-600">
                    <span>None</span>
                    <span>Odd-Even (50%)</span>
                    <span>Total Ban</span>
                  </div>
                </div>

                {/* Construction Intervention */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-gray-800/40 border border-gray-700/50">
                  <div>
                    <p className="text-xs font-medium text-gray-300">🏗️ Halt Dust Construction</p>
                    <p className="text-[10px] text-gray-500">Ban concrete mix/excavations</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={constructionHalt}
                    onChange={(e) => setConstructionHalt(e.target.checked)}
                    className="w-5 h-5 rounded border-gray-700 bg-gray-800 text-orange-500 focus:ring-orange-500 focus:ring-opacity-25 accent-orange-500 cursor-pointer"
                  />
                </div>

                {/* Industrial Restrict */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-300 font-medium">🏭 Industrial Emission Caps</span>
                    <span className="text-orange-400 font-bold">{industrialRestriction}% restricted</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="10"
                    value={industrialRestriction}
                    onChange={(e) => setIndustrialRestriction(Number(e.target.value))}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <div className="flex justify-between text-[10px] text-gray-600">
                    <span>None</span>
                    <span>GRAP Phase 2</span>
                    <span>Shutdown</span>
                  </div>
                </div>
              </div>

              {/* Reset simulator */}
              {(trafficReduction > 0 || constructionHalt || industrialRestriction > 0) && (
                <button
                  onClick={() => {
                    setTrafficReduction(0);
                    setConstructionHalt(false);
                    setIndustrialRestriction(0);
                  }}
                  className="w-full py-1.5 text-xs rounded border border-gray-700 hover:bg-gray-800 text-gray-400 transition-colors"
                >
                  Clear Policy Modifiers
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Main Panel Column (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {error ? (
            <div className="glass-card p-12 flex flex-col items-center justify-center min-h-[400px] border border-red-500/30 bg-red-950/20 text-center">
              <span className="text-4xl mb-4 block">⚠️</span>
              <p className="text-gray-200 font-semibold mb-4">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  if (wards.length === 0) {
                    loadWards();
                  } else {
                    loadForecast();
                  }
                }}
                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : forecastLoading ? (
            <div className="glass-card p-12 flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-gray-400 text-sm">Synthesizing predictive models...</p>
            </div>
          ) : selectedWard ? (
            <>
              {/* Ward Overview Banner */}
              <div className="glass-card p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h2 className="text-2xl font-black text-gray-100">{selectedWard.name}</h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Ward #{selectedWard.ward_no} · {selectedWard.city} · Population:{" "}
                    {selectedWard.population ? selectedWard.population.toLocaleString() : "N/A"}
                  </p>
                  <div className="flex gap-2 mt-3 text-[10px] text-gray-400">
                    <span className="bg-gray-800 px-2 py-0.5 rounded">🏫 Schools: {selectedWard.school_count}</span>
                    <span className="bg-gray-800 px-2 py-0.5 rounded">🏥 Hospitals: {selectedWard.hospital_count}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 self-end md:self-auto">
                  <div className="text-right">
                    <span className="text-xs text-gray-500 block">Current Air Quality</span>
                    <span className="text-xs text-gray-400">AQI: {selectedWard.aqi ?? "N/A"}</span>
                  </div>
                  <AQIBadge aqi={selectedWard.aqi} size="lg" />
                </div>
              </div>

              {/* Chart Section */}
              <div className="glass-card p-5 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div>
                    <h3 className="font-bold text-gray-200">72-Hour AQI Forecast Curve</h3>
                    <p className="text-xs text-gray-500">Includes 95% confidence intervals based on weather parameters</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleExportCSV}
                      disabled={simulatedForecasts.length === 0}
                      className="px-3 py-1.5 text-xs rounded bg-gray-800 border border-gray-700 hover:text-orange-400 hover:border-orange-500 transition-colors flex items-center gap-1.5"
                    >
                      📥 Export CSV
                    </button>
                  </div>
                </div>

                <div className="relative">
                  {/* Digital Twin simulated comparison curve */}
                  <ForecastChart forecasts={simulatedForecasts} currentAQI={selectedWard.aqi ?? undefined} />
                </div>

                {/* Simulated Results Indicator */}
                {(trafficReduction > 0 || constructionHalt || industrialRestriction > 0) && (
                  <div className="p-3 rounded-lg bg-orange-950/20 border border-orange-900/40 text-xs text-orange-300 flex items-center justify-between">
                    <div>
                      <span className="font-bold">Digital Twin active:</span> Simulating policy interventions. The chart showcases the projected reduction trend.
                    </div>
                    <div className="font-mono bg-orange-950 px-2.5 py-1 rounded border border-orange-500/30 text-sm font-bold">
                      Proj. Peak Drop: -
                      {Math.round(
                        ((forecast[0]?.predicted_aqi - simulatedForecasts[0]?.simulated_aqi!) /
                          (forecast[0]?.predicted_aqi || 1)) *
                          100
                      )}
                      %
                    </div>
                  </div>
                )}
              </div>

              {/* Hour by Hour table breakdown */}
              <div className="glass-card p-5 space-y-4">
                <h3 className="font-bold text-gray-200">Chronological Hourly Forecast Logs</h3>
                <div className="overflow-x-auto border border-white/5 rounded-xl">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-900 border-b border-white/5 text-xs text-gray-400 font-semibold uppercase tracking-wider">
                        <th className="p-3">Horizon</th>
                        <th className="p-3">Target Time</th>
                        <th className="p-3">Forecast AQI</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Confidence Range</th>
                        {(trafficReduction > 0 || constructionHalt || industrialRestriction > 0) && (
                          <th className="p-3 text-orange-400">Simulated AQI</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-xs text-gray-300">
                      {simulatedForecasts.map((f) => {
                        const lvl = getAQILevel(f.predicted_aqi);
                        const simLvl = f.simulated_aqi ? getAQILevel(f.simulated_aqi) : null;
                        return (
                          <tr key={f.horizon_hours} className="hover:bg-white/2 transition-colors">
                            <td className="p-3 font-semibold text-gray-500">+{f.horizon_hours} Hours</td>
                            <td className="p-3">{format(parseISO(f.forecast_for), "dd MMM (EEE) · HH:mm")}</td>
                            <td className="p-3 font-black text-sm" style={{ color: lvl.color }}>
                              {Math.round(f.predicted_aqi)}
                            </td>
                            <td className="p-3">
                              <span
                                className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border"
                                style={{
                                  color: lvl.color,
                                  backgroundColor: lvl.color + "22",
                                  borderColor: lvl.color + "55",
                                }}
                              >
                                {f.predicted_category}
                              </span>
                            </td>
                            <td className="p-3 text-gray-500 font-mono">
                              {Math.round(f.confidence_lower ?? f.predicted_aqi * 0.85)} –{" "}
                              {Math.round(f.confidence_upper ?? f.predicted_aqi * 1.15)}
                            </td>
                            {f.simulated_aqi !== undefined && simLvl && (
                              <td className="p-3 font-black text-orange-400 font-mono bg-orange-950/10">
                                {f.simulated_aqi}{" "}
                                <span className="text-[10px] font-normal text-orange-600">
                                  ({simLvl.label})
                                </span>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="glass-card p-12 text-center text-gray-500">
              Select a city and ward to generate forecasting charts.
            </div>
          )}
        </div>
      </div>
    </div>
    </AppShell>
  );
}
