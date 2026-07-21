"use client";
/**
 * AETHER — CPCB Telemetry Diagnostics Panel
 * Audits ground station sensors for stuck signals, spikes, and connection timeouts,
 * providing one-click troubleshooting options (recalibrations & dispatch logs).
 */

import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

interface SensorDiagnosticsProps {
  city: string;
}

interface DiagnosticAlert {
  station_id: number;
  station_code: string;
  name: string;
  status: string;
  issue: string | null;
  last_seen: string | null;
  diagnostics: Record<string, string>;
  data_quality_score: number;
}

export function SensorDiagnostics({ city }: SensorDiagnosticsProps) {
  const [loading, setLoading] = useState(true);
  const [reliabilityScore, setReliabilityScore] = useState(100);
  const [alerts, setAlerts] = useState<DiagnosticAlert[]>([]);
  
  const [activeTab, setActiveTab] = useState<"all" | "anomalous">("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [recalibratingId, setRecalibratingId] = useState<number | null>(null);
  const [dispatchedId, setDispatchedId] = useState<number | null>(null);

  const loadDiagnostics = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.diagnostics(city);
      setReliabilityScore(res.score);
      setAlerts(res.alerts);
    } catch (e) {
      console.error("Failed to load diagnostics:", e);
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    loadDiagnostics();
  }, [loadDiagnostics]);

  const handleRecalibrate = async (stationId: number) => {
    setRecalibratingId(stationId);
    try {
      await api.recalibrateStation(stationId);
      // Wait briefly for smooth visual feedback
      await new Promise((resolve) => setTimeout(resolve, 800));
      await loadDiagnostics();
    } catch (e) {
      console.error("Recalibration failed:", e);
    } finally {
      setRecalibratingId(null);
    }
  };

  const handleDispatch = async (stationId: number) => {
    setDispatchedId(stationId);
    try {
      await api.dispatchTechCrew(stationId);
      await new Promise((resolve) => setTimeout(resolve, 800));
      await loadDiagnostics();
    } catch (e) {
      console.error("Tech crew dispatch failed:", e);
    } finally {
      setDispatchedId(null);
    }
  };

  if (loading && alerts.length === 0) {
    return (
      <div className="glass-card p-6 flex flex-col items-center justify-center min-h-[220px] text-gray-400 text-xs">
        <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p className="font-semibold tracking-wide">Auditing CPCB Telemetry Quality...</p>
        <p className="text-[10px] text-gray-500 mt-1">Evaluating flatline, spikes, and sensor calibration</p>
      </div>
    );
  }

  const warnings = alerts.filter((a) => a.status === "Warning");
  const criticals = alerts.filter((a) => a.status === "Critical");
  const anomalous = alerts.filter((a) => a.status !== "OK");
  
  const displayedAlerts = activeTab === "anomalous" ? anomalous : alerts;

  // Helper to determine score color
  const getScoreColor = (score: number) => {
    if (score >= 85) return "text-emerald-400 bg-emerald-950/20 border-emerald-800/40";
    if (score >= 60) return "text-amber-400 bg-amber-950/20 border-amber-800/40";
    return "text-rose-400 bg-rose-950/20 border-rose-800/40";
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 85) return "bg-emerald-500";
    if (score >= 60) return "bg-amber-500";
    return "bg-rose-500";
  };

  // Helper to render checkmark or cross for tests
  const renderTestStatus = (testResult: string) => {
    const isPassed = testResult.includes("Passed") || testResult === "OK" || testResult.startsWith("OK");
    if (isPassed) {
      return (
        <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
          {testResult}
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1.5 text-rose-400 font-medium">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
        </svg>
        {testResult}
      </span>
    );
  };

  return (
    <div className="glass-card p-5 border border-white/5 space-y-4.5 shadow-2xl relative overflow-hidden backdrop-blur-md">
      {/* Diagnostics Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="space-y-0.5">
          <h3 className="font-bold text-sm text-gray-100 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            CPCB Telemetry Diagnostic Audit
          </h3>
          <p className="text-[10px] text-gray-400">Verifying live ground telemetry against verification baselines</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-amber-400">
            {reliabilityScore}%
          </p>
          <p className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">Network Health</p>
        </div>
      </div>

      {/* Network Stats Indicators */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-gray-900/60 border border-white/5 rounded-xl p-2.5 text-center">
          <p className="text-lg font-black text-gray-300">{alerts.length}</p>
          <p className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold">Total Nodes</p>
        </div>
        <div className="bg-yellow-950/20 border border-yellow-900/20 rounded-xl p-2.5 text-center">
          <p className="text-lg font-black text-yellow-400">{warnings.length}</p>
          <p className="text-[9px] text-yellow-500/80 uppercase tracking-wider font-semibold">Warnings</p>
        </div>
        <div className="bg-red-950/20 border border-red-900/20 rounded-xl p-2.5 text-center">
          <p className="text-lg font-black text-red-400">{criticals.length}</p>
          <p className="text-[9px] text-red-500/80 uppercase tracking-wider font-semibold">Critical Issues</p>
        </div>
      </div>

      {/* Filter Tabs Toggle */}
      <div className="flex border-b border-white/5 p-0.5 bg-gray-950/50 rounded-lg">
        <button
          onClick={() => setActiveTab("all")}
          className={`flex-1 py-1.5 text-center text-xs font-semibold rounded-md transition-all cursor-pointer ${
            activeTab === "all"
              ? "bg-gray-800 text-orange-400 shadow-sm"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          All Stations ({alerts.length})
        </button>
        <button
          onClick={() => setActiveTab("anomalous")}
          className={`flex-1 py-1.5 text-center text-xs font-semibold rounded-md transition-all cursor-pointer ${
            activeTab === "anomalous"
              ? "bg-gray-800 text-orange-400 shadow-sm"
              : "text-gray-400 hover:text-gray-200"
          }`}
        >
          Anomalous Nodes ({anomalous.length})
        </button>
      </div>

      {/* Flagged Sensors Log */}
      <div className="space-y-2">
        {displayedAlerts.length === 0 ? (
          <div className="text-center py-6 text-xs text-gray-400 bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
            ✓ No anomalous sensor feeds detected under this filter.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {displayedAlerts.map((alert) => {
              const isExpanded = expandedId === alert.station_id;
              const hasDrift = alert.diagnostics.drift_test && !alert.diagnostics.drift_test.includes("Passed");
              const hasFlatline = alert.diagnostics.flatline_test && !alert.diagnostics.flatline_test.includes("Passed");
              const hasOutlier = alert.diagnostics.outlier_test && !alert.diagnostics.outlier_test.includes("Passed");
              const hasDelay = alert.diagnostics.ingestion_delay && !alert.diagnostics.ingestion_delay.startsWith("OK");

              return (
                <div
                  key={alert.station_id}
                  className={`bg-gray-950/40 border rounded-xl overflow-hidden transition-all duration-200 ${
                    isExpanded 
                      ? "border-orange-500/30 ring-1 ring-orange-500/10 bg-gray-950/60" 
                      : "border-white/5 hover:border-white/10"
                  }`}
                >
                  {/* Collapsed Header */}
                  <div
                    onClick={() => setExpandedId(isExpanded ? null : alert.station_id)}
                    className="p-3 flex items-center justify-between cursor-pointer select-none"
                  >
                    <div className="space-y-1 flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-gray-200">{alert.name}</span>
                        <span className="text-[9px] text-gray-500 font-mono tracking-wider">{alert.station_code}</span>
                      </div>
                      
                      {/* Quality Score Bar */}
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${getScoreBarColor(alert.data_quality_score)}`} 
                            style={{ width: `${alert.data_quality_score}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-400 font-semibold">{alert.data_quality_score}% Quality</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[8.5px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${
                          alert.status === "Critical"
                            ? "text-rose-400 bg-rose-950/20 border-rose-900/40"
                            : alert.status === "Warning"
                            ? "text-amber-400 bg-amber-950/20 border-amber-800/40"
                            : "text-emerald-400 bg-emerald-950/20 border-emerald-900/40"
                        }`}
                      >
                        {alert.status}
                      </span>
                      <svg
                        className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>

                  {/* Expanded Report Card */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-white/5 bg-gray-900/20 space-y-3 pt-2 text-[10px] transition-all">
                      {alert.issue && (
                        <div className="p-2 bg-rose-950/10 border border-rose-900/20 text-rose-300 rounded-lg">
                          <p className="font-semibold text-[9px] uppercase tracking-wider text-rose-400/80 mb-0.5">Reported Anomalies</p>
                          {alert.issue}
                        </div>
                      )}

                      {/* Diagnostic Tests Checklist */}
                      <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                        <div className="flex flex-col gap-1.5 p-2 bg-gray-950/30 rounded-lg">
                          <span className="text-gray-400">📡 Telemetry Stream</span>
                          {renderTestStatus(alert.diagnostics.ingestion_delay)}
                        </div>
                        <div className="flex flex-col gap-1.5 p-2 bg-gray-950/30 rounded-lg">
                          <span className="text-gray-400">📊 Signal Flatlines</span>
                          {renderTestStatus(alert.diagnostics.flatline_test)}
                        </div>
                        <div className="flex flex-col gap-1.5 p-2 bg-gray-950/30 rounded-lg">
                          <span className="text-gray-400">📈 Spike Variance</span>
                          {renderTestStatus(alert.diagnostics.outlier_test)}
                        </div>
                        <div className="flex flex-col gap-1.5 p-2 bg-gray-950/30 rounded-lg">
                          <span className="text-gray-400">⚡ Calibration Drift</span>
                          {renderTestStatus(alert.diagnostics.drift_test)}
                        </div>
                      </div>

                      {/* Troubleshoot Buttons */}
                      {(hasDrift || hasFlatline || hasOutlier || hasDelay) && (
                        <div className="flex gap-2 border-t border-white/5 pt-2.5">
                          {(hasDrift || hasFlatline || hasOutlier) && (
                            <button
                              onClick={() => handleRecalibrate(alert.station_id)}
                              disabled={recalibratingId !== null || dispatchedId !== null}
                              className="flex-1 py-1.5 bg-orange-600/15 hover:bg-orange-600/25 border border-orange-500/25 text-orange-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                            >
                              {recalibratingId === alert.station_id ? (
                                <>
                                  <div className="w-2.5 h-2.5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
                                  Calibrating...
                                </>
                              ) : (
                                "⚡ Self-Calibrate Bias"
                              )}
                            </button>
                          )}
                          {hasDelay && (
                            <button
                              onClick={() => handleDispatch(alert.station_id)}
                              disabled={recalibratingId !== null || dispatchedId !== null}
                              className="flex-1 py-1.5 bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/25 text-blue-400 text-[10px] font-bold rounded-lg transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                            >
                              {dispatchedId === alert.station_id ? (
                                <>
                                  <div className="w-2.5 h-2.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                                  Dispatching...
                                </>
                              ) : (
                                "🔧 Dispatch Tech Crew"
                              )}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

