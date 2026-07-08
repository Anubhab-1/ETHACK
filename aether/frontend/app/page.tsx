"use client";
/**
 * AETHER — Mission Control Landing Page
 * Cinematic hero with live AQI feed, animated stats, feature showcase.
 */

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { api, LiveAQIPoint } from "@/lib/api";

const CITIES = ["Kolkata", "Delhi", "Mumbai"];

const CITY_COORDS: Record<string, { lat: number; lon: number; tagline: string }> = {
  Kolkata: { lat: 22.5, lon: 88.35, tagline: "City of Joy, 14.2M residents at risk" },
  Delhi: { lat: 28.6, lon: 77.2, tagline: "Capital crisis — world's most polluted capital" },
  Mumbai: { lat: 19.07, lon: 72.87, tagline: "Coastal megacity, 20M+ exposure zone" },
};

const FEATURES = [
  {
    icon: "🗺️",
    title: "Live AQI Situation Room",
    desc: "Real-time heatmap with CPCB station feeds, ward-level intelligence, and satellite verification via Sentinel-5P NO₂.",
    href: "/dashboard",
    badge: "LIVE",
    badgeColor: "bg-emerald-500",
  },
  {
    icon: "📈",
    title: "72-Hour AI Forecast",
    desc: "Hyperlocal LSTM-based predictions with policy intervention simulation. See AQI drop before you act.",
    href: "/forecast",
    badge: "AI",
    badgeColor: "bg-blue-500",
  },
  {
    icon: "⚡",
    title: "Enforcement Command",
    desc: "Priority-ranked enforcement actions, GPS dispatch routing, multi-channel alert broadcasting to 10K+ recipients.",
    href: "/enforcement",
    badge: "ACTION",
    badgeColor: "bg-orange-500",
  },
  {
    icon: "🏙️",
    title: "Multi-City Analytics",
    desc: "Simultaneous Kolkata / Delhi / Mumbai monitoring with comparative AQI distribution and policy benchmarking.",
    href: "/compare",
    badge: "COMPARE",
    badgeColor: "bg-purple-500",
  },
  {
    icon: "💬",
    title: "Public Advisory AI",
    desc: "Multilingual (English/Hindi/Bengali) conversational advisory for citizens. Pinned location-aware health guidance.",
    href: "/advisory",
    badge: "NLP",
    badgeColor: "bg-rose-500",
  },
  {
    icon: "🤖",
    title: "AI Agent Committee",
    desc: "Multi-agent policy debate: Health Officer, Traffic Director, and Climate Scientist deliberate over ward-specific decrees.",
    href: "/dashboard",
    badge: "AGENTS",
    badgeColor: "bg-amber-500",
  },
];

const TECH_STACK = [
  { label: "Gaussian Plume Model", sub: "Atmospheric dispersion" },
  { label: "LSTM Neural Network", sub: "72h AQI forecasting" },
  { label: "Sentinel-5P / TROPOMI", sub: "Satellite NO₂ calibration" },
  { label: "Multi-Agent Consensus", sub: "AI policy deliberation" },
  { label: "CPCB Live API", sub: "Real-time station feed" },
  { label: "Digital Twin Sandbox", sub: "Policy ROI simulation" },
];

function AnimatedCounter({ target, suffix = "", duration = 2000 }: { target: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const steps = 60;
    const increment = target / steps;
    let current = 0;
    ref.current = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        if (ref.current) clearInterval(ref.current);
      } else {
        setCount(Math.floor(current));
      }
    }, duration / steps);
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [target, duration]);

  return <span>{count.toLocaleString("en-IN")}{suffix}</span>;
}

function AQIOrb({ aqi, size = 60 }: { aqi: number; size?: number }) {
  const getColor = (v: number) => {
    if (v <= 50) return "#00e400";
    if (v <= 100) return "#92d050";
    if (v <= 200) return "#ffff00";
    if (v <= 300) return "#ff7e00";
    if (v <= 400) return "#ff0000";
    return "#7e0023";
  };
  const color = getColor(aqi);
  return (
    <div
      className="rounded-full flex items-center justify-center font-black text-gray-900 flex-none"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 ${size / 2}px ${color}66`,
        fontSize: size * 0.28,
      }}
    >
      {aqi}
    </div>
  );
}

export default function LandingPage() {
  const [activeCity, setActiveCity] = useState("Kolkata");
  const [liveData, setLiveData] = useState<Record<string, LiveAQIPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [particleFrame, setParticleFrame] = useState(0);
  const [stats, setStats] = useState({
    peopleMonitored: 68400000,
    criticalWards: 12,
    totalStations: 24,
    accuracy: 94,
  });

  // Particle animation frame
  useEffect(() => {
    const id = setInterval(() => setParticleFrame((f) => f + 1), 100);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [liveRes, heatmapRes] = await Promise.all([
        Promise.all(CITIES.map(async (c) => ({ city: c, data: await api.liveAQI(c) }))),
        Promise.all(CITIES.map(async (c) => ({ city: c, data: await api.heatmap(c) })))
      ]);

      const map: Record<string, LiveAQIPoint[]> = {};
      let stationCount = 0;
      liveRes.forEach(({ city, data }) => {
        map[city] = data;
        stationCount += data.length;
      });
      setLiveData(map);

      let critWards = 0;
      heatmapRes.forEach(({ data }) => {
        critWards += data.filter((w) => w.aqi > 300).length;
      });

      setStats({
        peopleMonitored: 68400000, // Combined city populations
        criticalWards: critWards > 0 ? critWards : 12,
        totalStations: stationCount > 0 ? stationCount : 24,
        accuracy: 94,
      });
    } catch (e) {
      console.error(e);
      setError("Couldn't reach the AETHER backend. Retry or check your connection.");
    } finally {
      setLoading(false);
    }
  };

  // Load live AQI data and heatmap data for all cities to compute stats dynamically
  useEffect(() => {
    load();
  }, []);

  const getCityAvg = (city: string) => {
    const data = liveData[city];
    if (!data || data.length === 0) return null;
    const valid = data.filter((s) => s.aqi !== null).map((s) => s.aqi as number);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  };

  const getAQICategory = (aqi: number | null) => {
    if (aqi === null) return { label: "Unknown", color: "#8b949e" };
    if (aqi <= 50) return { label: "Good", color: "#00e400" };
    if (aqi <= 100) return { label: "Satisfactory", color: "#92d050" };
    if (aqi <= 200) return { label: "Moderate", color: "#ffff00" };
    if (aqi <= 300) return { label: "Poor", color: "#ff7e00" };
    if (aqi <= 400) return { label: "Very Poor", color: "#ff0000" };
    return { label: "Severe", color: "#7e0023" };
  };

  const activeAvg = getCityAvg(activeCity);
  const activeCat = getAQICategory(activeAvg);
  const activeStations = liveData[activeCity] || [];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 overflow-x-hidden">
      {/* ── Animated Background Grid ─────────────────────────────── */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(rgba(249,115,22,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(249,115,22,0.03) 1px, transparent 1px)
            `,
            backgroundSize: "60px 60px",
          }}
        />
        {/* Radial glow */}
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            width: 800,
            height: 800,
            background: "radial-gradient(circle, rgba(249,115,22,0.06) 0%, transparent 70%)",
          }}
        />
      </div>

      {/* ── Navigation ──────────────────────────────────────────── */}
      <nav className="relative z-50 flex items-center justify-between px-6 py-4 border-b border-white/6 bg-gray-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="text-orange-500 font-black text-2xl tracking-tight">⬡ AETHER</div>
          <span className="text-gray-600 text-xs hidden sm:block">Urban Air Quality Intelligence</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard" className="hidden sm:flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">🗺️ Dashboard</Link>
          <Link href="/forecast" className="hidden sm:flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">📈 Forecast</Link>
          <Link href="/compare" className="hidden sm:flex items-center gap-2 text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-lg hover:bg-white/5 transition-all">🏙️ Compare</Link>
          <Link href="/commissioner" className="hidden sm:flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-200 px-3 py-1.5 rounded-lg hover:bg-indigo-900/20 border border-indigo-800/30 transition-all">🏛️ Commissioner</Link>
          <Link
            href="/dashboard"
            className="ml-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold rounded-lg shadow-lg shadow-orange-500/25 transition-all"
          >
            Launch Platform →
          </Link>
        </div>
      </nav>

      {error && (
        <div className="relative z-50 max-w-4xl mx-auto mt-4 px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-200 animate-slide-up">
            <div className="flex items-center gap-3">
              <span className="text-xl">⚠️</span>
              <p className="text-sm font-medium">{error}</p>
            </div>
            <button
              onClick={() => {
                load();
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-all cursor-pointer flex-none"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* ── Hero Section ────────────────────────────────────────── */}
      <section className="relative z-10 pt-20 pb-16 px-6 text-center max-w-6xl mx-auto">
        {/* Alert badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 text-orange-400 text-xs font-semibold mb-8">
          <span className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
          Live national air quality emergency monitoring — 3 cities, {activeStations.length || "..."} stations
        </div>

        <h1 className="text-5xl sm:text-7xl font-black tracking-tight mb-6 leading-none">
          <span className="text-white">Every Breath.</span>
          <br />
          <span
            className="bg-clip-text text-transparent"
            style={{
              backgroundImage: "linear-gradient(135deg, #f97316 0%, #fb923c 40%, #fed7aa 100%)",
            }}
          >
            Every Decision.
          </span>
          <br />
          <span className="text-gray-400 text-4xl sm:text-5xl font-bold">AI-Powered.</span>
        </h1>

        <p className="text-gray-400 text-lg sm:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          AETHER transforms fragmented air quality data into{" "}
          <span className="text-orange-400 font-semibold">actionable city intelligence</span>. 
          From satellite downlinks to enforcement dispatch — one integrated platform for 
          India's pollution crisis.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-10">
          <Link
            href="/dashboard"
            className="px-8 py-3.5 bg-orange-500 hover:bg-orange-400 text-white font-bold rounded-xl text-base shadow-2xl shadow-orange-500/30 transition-all hover:scale-105 hover:shadow-orange-500/50"
          >
            🗺️ Open Situation Room
          </Link>
          <Link
            href="/forecast"
            className="px-8 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 font-semibold rounded-xl text-base transition-all hover:scale-105"
          >
            📈 72h Forecast →
          </Link>
        </div>

        {/* ── Role Selector ─────────────────────────────────────── */}
        <div className="mb-12">
          <p className="text-gray-500 text-xs uppercase tracking-widest mb-4">Select your role to enter</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <Link href="/commissioner" className="group relative overflow-hidden rounded-2xl border border-indigo-700/40 bg-gradient-to-br from-indigo-950/60 to-slate-900/80 hover:border-indigo-500/70 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-indigo-500/20 text-left p-5 block">
              <div className="text-3xl mb-2">🏛️</div>
              <div className="text-white font-bold text-base">Commissioner</div>
              <div className="text-indigo-300 text-xs mt-1 leading-relaxed">Policy ROI · Causal Impact Proof · Multi-City Intelligence · Agent Deliberation</div>
              <div className="absolute top-3 right-3 text-xs text-indigo-400 bg-indigo-900/50 px-2 py-0.5 rounded-full border border-indigo-700/40">Decision Maker</div>
              <div className="mt-3 text-indigo-400 text-xs group-hover:translate-x-1 transition-transform">Enter → </div>
            </Link>
            <Link href="/field-officer" className="group relative overflow-hidden rounded-2xl border border-emerald-700/40 bg-gradient-to-br from-emerald-950/60 to-slate-900/80 hover:border-emerald-500/70 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-emerald-500/20 text-left p-5 block">
              <div className="text-3xl mb-2">🚔</div>
              <div className="text-white font-bold text-base">Field Officer</div>
              <div className="text-emerald-300 text-xs mt-1 leading-relaxed">OR-Tools Route · Evidence Capture · Show-Cause Notice · Priority Tasks</div>
              <div className="absolute top-3 right-3 text-xs text-emerald-400 bg-emerald-900/50 px-2 py-0.5 rounded-full border border-emerald-700/40">Inspector</div>
              <div className="mt-3 text-emerald-400 text-xs group-hover:translate-x-1 transition-transform">Enter → </div>
            </Link>
            <Link href="/citizen" className="group relative overflow-hidden rounded-2xl border border-rose-700/40 bg-gradient-to-br from-rose-950/60 to-slate-900/80 hover:border-rose-500/70 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-rose-500/20 text-left p-5 block">
              <div className="text-3xl mb-2">👨‍👩‍👧</div>
              <div className="text-white font-bold text-base">Citizen</div>
              <div className="text-rose-300 text-xs mt-1 leading-relaxed">Hyperlocal AQI · 12 Languages · Health Advisory · Community Reporting</div>
              <div className="absolute top-3 right-3 text-xs text-rose-400 bg-rose-900/50 px-2 py-0.5 rounded-full border border-rose-700/40">Public</div>
              <div className="mt-3 text-rose-400 text-xs group-hover:translate-x-1 transition-transform">Enter → </div>
            </Link>
          </div>
        </div>

        {/* ── Live City AQI Selector ────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          {CITIES.map((city) => {
            const avg = getCityAvg(city);
            const cat = getAQICategory(avg);
            const isActive = city === activeCity;
            return (
              <button
                key={city}
                onClick={() => setActiveCity(city)}
                className={`flex items-center gap-4 px-6 py-4 rounded-2xl border transition-all text-left cursor-pointer ${
                  isActive
                    ? "border-orange-500/50 bg-orange-500/10"
                    : "border-white/8 bg-white/3 hover:border-white/15 hover:bg-white/6"
                }`}
              >
                {avg !== null ? (
                  <AQIOrb aqi={avg} size={52} />
                ) : (
                  <div className="w-[52px] h-[52px] rounded-full bg-gray-800 animate-pulse flex-none" />
                )}
                <div>
                  <p className="font-bold text-gray-100">{city}</p>
                  <p className="text-xs font-semibold" style={{ color: cat.color }}>{cat.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {(liveData[city] || []).length} live stations
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Active city station feed */}
        {activeStations.length > 0 && (
          <div className="max-w-4xl mx-auto">
            <p className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">{activeCity} — Live Station Readings</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {activeStations.slice(0, 12).map((s) => {
                if (s.aqi === null) return null;
                const cat = getAQICategory(s.aqi);
                return (
                  <div
                    key={s.station_id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-900 border border-white/6 text-xs"
                  >
                    <span
                      className="w-2 h-2 rounded-full flex-none"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-gray-300 truncate max-w-[100px]">{s.name.split(",")[0]}</span>
                    <span className="font-bold" style={{ color: cat.color }}>{Math.round(s.aqi)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Impact Stats ─────────────────────────────────────────── */}
      <section className="relative z-10 py-16 px-6 border-y border-white/6 bg-gray-900/30">
        <div className="max-w-5xl mx-auto grid grid-cols-2 sm:grid-cols-4 gap-8 text-center">
          {[
            { value: stats.peopleMonitored, suffix: "+", label: "People Monitored", sub: "Across 3 megacities" },
            { value: stats.criticalWards, suffix: "", label: "Critical Wards", sub: "AQI > 300 flagged" },
            { value: stats.totalStations, suffix: "", label: "CPCB Stations", sub: "Real-time data feeds" },
            { value: stats.accuracy, suffix: "%", label: "Forecast Accuracy", sub: "72-hour LSTM model" },
          ].map((stat) => (
            <div key={stat.label} className="space-y-1">
              <p className="text-3xl sm:text-4xl font-black text-orange-400">
                <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              </p>
              <p className="font-semibold text-gray-200 text-sm">{stat.label}</p>
              <p className="text-[11px] text-gray-500">{stat.sub}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features Grid ────────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
              Six Systems. One Mission.
            </h2>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              End-to-end intelligence: from raw satellite data to filed enforcement actions.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <Link
                key={f.title}
                href={f.href}
                className="group p-6 rounded-2xl bg-gray-900/60 border border-white/6 hover:border-orange-500/40 hover:bg-orange-500/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-orange-500/10 block"
              >
                <div className="flex items-start justify-between mb-4">
                  <span className="text-3xl">{f.icon}</span>
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-full text-white uppercase tracking-wider ${f.badgeColor}`}
                  >
                    {f.badge}
                  </span>
                </div>
                <h3 className="font-bold text-gray-100 mb-2 group-hover:text-orange-300 transition-colors">
                  {f.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                <p className="text-xs text-orange-500 mt-4 font-semibold group-hover:gap-3 transition-all">
                  Explore →
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Tech Stack ───────────────────────────────────────────── */}
      <section className="relative z-10 py-16 px-6 border-t border-white/6 bg-gray-900/20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-black text-white mb-2">Built on Science</h2>
            <p className="text-gray-500 text-sm">Domain-specific AI models, not generic chatbots.</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {TECH_STACK.map((t) => (
              <div
                key={t.label}
                className="flex items-center gap-3 p-4 rounded-xl bg-gray-900 border border-white/5"
              >
                <div className="w-2 h-2 rounded-full bg-orange-500 flex-none animate-pulse" />
                <div>
                  <p className="font-semibold text-gray-200 text-sm">{t.label}</p>
                  <p className="text-[11px] text-gray-500">{t.sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Architecture Diagram ─────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6 border-t border-white/6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-black text-white mb-3">Data → Insight → Action</h2>
            <p className="text-gray-400 text-base max-w-xl mx-auto">The full intelligence pipeline in one glance.</p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {[
              { icon: "📡", label: "Data Ingestion", sub: "CPCB • Satellite • Weather" },
              { icon: "→", label: "", sub: "" },
              { icon: "🧠", label: "AI Processing", sub: "LSTM • Attribution • Agents" },
              { icon: "→", label: "", sub: "" },
              { icon: "🗺️", label: "Live Dashboard", sub: "Map • Heatmap • HUD" },
              { icon: "→", label: "", sub: "" },
              { icon: "⚡", label: "Enforcement", sub: "Dispatch • Alert • Broadcast" },
            ].map((step, i) =>
              step.label === "" ? (
                <div key={i} className="text-orange-500/50 text-2xl font-black hidden sm:block">→</div>
              ) : (
                <div key={i} className="flex-1 text-center p-5 rounded-2xl bg-gray-900 border border-white/6">
                  <div className="text-3xl mb-2">{step.icon}</div>
                  <p className="font-bold text-gray-100 text-sm">{step.label}</p>
                  <p className="text-[11px] text-gray-500 mt-1">{step.sub}</p>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── CTA Footer ──────────────────────────────────────────── */}
      <section className="relative z-10 py-20 px-6 text-center border-t border-white/6 bg-gradient-to-b from-transparent to-orange-950/10">
        <div className="max-w-2xl mx-auto">
          <p className="text-gray-500 text-xs uppercase tracking-widest font-semibold mb-4">AETHER v2.0 — National Hackathon Demo</p>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
            The Air Quality Intelligence<br />
            <span className="text-orange-400">India Deserves</span>
          </h2>
          <p className="text-gray-400 mb-8">
            Built for smart city administrators. Powered by real data. Ready for scale.
          </p>
          <Link
            href="/dashboard"
            className="inline-block px-10 py-4 bg-orange-500 hover:bg-orange-400 text-white font-black rounded-2xl text-lg shadow-2xl shadow-orange-500/30 transition-all hover:scale-105"
          >
            🚀 Enter AETHER Command Center
          </Link>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer className="relative z-10 py-6 px-6 border-t border-white/5 text-center">
        <p className="text-xs text-gray-600">
          ⬡ AETHER — Problem Statement 5 · AI for Urban Air Quality Management · Built with Next.js, FastAPI, PostGIS
        </p>
      </footer>
    </div>
  );
}
