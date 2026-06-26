"use client";
/**
 * AETHER — Real-Time Health Impact Estimator
 * Shows animated live estimate of people at risk based on city AQI.
 */

import { useEffect, useState, useRef } from "react";

interface HealthImpactCounterProps {
  cityAvgAQI: number | null;
  cityName: string;
  stationCount: number;
}

function useAnimatedCount(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);
  const fromRef = useRef(0);

  useEffect(() => {
    fromRef.current = value;
    startRef.current = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const animate = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(fromRef.current + (target - fromRef.current) * eased));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return value;
}

const CITY_POPULATION: Record<string, number> = {
  Kolkata: 14_800_000,
  Delhi: 32_900_000,
  Mumbai: 20_700_000,
};

function getHealthMetrics(aqi: number | null, city: string) {
  const pop = CITY_POPULATION[city] ?? 15_000_000;

  if (aqi === null) return { atRisk: 0, children: 0, elderly: 0, hospitalized: 0, severity: "unknown" };

  // % of population at risk at different AQI bands
  let riskFraction = 0;
  let severity = "low";
  if (aqi <= 50) { riskFraction = 0.01; severity = "minimal"; }
  else if (aqi <= 100) { riskFraction = 0.05; severity = "low"; }
  else if (aqi <= 200) { riskFraction = 0.12; severity = "moderate"; }
  else if (aqi <= 300) { riskFraction = 0.25; severity = "high"; }
  else if (aqi <= 400) { riskFraction = 0.42; severity = "critical"; }
  else { riskFraction = 0.60; severity = "emergency"; }

  const atRisk = Math.round(pop * riskFraction);
  const children = Math.round(atRisk * 0.18);   // 18% of at-risk are children
  const elderly = Math.round(atRisk * 0.12);    // 12% elderly
  const hospitalized = Math.round((aqi / 400) * (pop / 100000) * 0.8);

  return { atRisk, children, elderly, hospitalized, severity };
}

const SEVERITY_STYLES: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  minimal: { bg: "bg-emerald-900/20", border: "border-emerald-500/30", text: "text-emerald-400", dot: "bg-emerald-500" },
  low: { bg: "bg-green-900/20", border: "border-green-500/30", text: "text-green-400", dot: "bg-green-500" },
  moderate: { bg: "bg-yellow-900/20", border: "border-yellow-500/30", text: "text-yellow-400", dot: "bg-yellow-500" },
  high: { bg: "bg-orange-900/20", border: "border-orange-500/30", text: "text-orange-400", dot: "bg-orange-500" },
  critical: { bg: "bg-red-900/20", border: "border-red-500/30", text: "text-red-400", dot: "bg-red-500" },
  emergency: { bg: "bg-red-900/30", border: "border-red-400/50", text: "text-red-300", dot: "bg-red-400" },
  unknown: { bg: "bg-gray-900/20", border: "border-gray-700", text: "text-gray-400", dot: "bg-gray-500" },
};

export function HealthImpactCounter({ cityAvgAQI, cityName, stationCount }: HealthImpactCounterProps) {
  const metrics = getHealthMetrics(cityAvgAQI, cityName);
  const style = SEVERITY_STYLES[metrics.severity] || SEVERITY_STYLES.unknown;

  const atRiskAnimated = useAnimatedCount(metrics.atRisk);
  const childrenAnimated = useAnimatedCount(metrics.children);
  const elderlyAnimated = useAnimatedCount(metrics.elderly);
  const hospAnimated = useAnimatedCount(metrics.hospitalized);

  const formatCount = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1000).toFixed(0)}K`;
    return n.toString();
  };

  return (
    <div className={`glass-card p-3 border ${style.border} ${style.bg} space-y-2.5`}>
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-[10px] uppercase tracking-wider text-gray-400">Health Risk Estimate</h3>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${style.dot} animate-pulse`} />
          <span className={`text-[9px] font-black uppercase ${style.text}`}>{metrics.severity}</span>
        </div>
      </div>

      {/* Primary at-risk number */}
      <div className="text-center py-1">
        <p className={`text-2xl font-black font-mono ${style.text}`}>
          {cityAvgAQI !== null ? formatCount(atRiskAnimated) : "—"}
        </p>
        <p className="text-[10px] text-gray-500">estimated at-risk residents</p>
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-3 gap-1.5 text-center text-[10px]">
        <div className="bg-gray-900/50 rounded p-1.5">
          <p className="font-bold text-blue-400 font-mono">{formatCount(childrenAnimated)}</p>
          <p className="text-gray-600">Children</p>
        </div>
        <div className="bg-gray-900/50 rounded p-1.5">
          <p className="font-bold text-amber-400 font-mono">{formatCount(elderlyAnimated)}</p>
          <p className="text-gray-600">Elderly</p>
        </div>
        <div className="bg-gray-900/50 rounded p-1.5">
          <p className="font-bold text-red-400 font-mono">{formatCount(hospAnimated)}</p>
          <p className="text-gray-600">Hosp/Day</p>
        </div>
      </div>

      <p className="text-[9px] text-gray-600 text-center">
        Modelled from {stationCount} live CPCB stations · Based on WHO & CPCB exposure guidelines
      </p>
    </div>
  );
}
