"use client";
/**
 * AETHER — Live Situation Room Dashboard
 * Full-screen dark map + collapsible intelligence side panel.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Cpu, Satellite, Activity, Sliders, Users, RefreshCw, Route, Brain } from "lucide-react";
import { api, LiveAQIPoint, HeatmapPoint, WardDetail, ForecastPoint, AttributionResponse } from "@/lib/api";
import { AQIBadge } from "@/components/AQIBadge";
import { SourceBreakdown } from "@/components/SourceBreakdown";
import { ForecastChart } from "@/components/ForecastChart";
import { getAQILevel } from "@/lib/aqi-colors";
import { AgentCommitteeModal } from "@/components/AgentCommitteeModal";
import { SensorDiagnostics } from "@/components/SensorDiagnostics";
import { SatelliteCalibration } from "@/components/SatelliteCalibration";
import { HealthImpactCounter } from "@/components/HealthImpactCounter";
import { AlertNotificationSystem } from "@/components/AlertNotificationSystem";
import { AppShell } from "@/components/AppShell";
import { VoiceController } from "@/components/VoiceController";


// Dynamic import for map (client-side only — Leaflet has no SSR)
const AetherMap = dynamic(() => import("@/components/AetherMap").then((m) => m.AetherMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-950">
      <div className="text-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Loading AETHER Map...</p>
      </div>
    </div>
  ),
});

const CITIES = ["Kolkata", "Delhi", "Mumbai"];

const DEMO_SCENARIOS = [
  {
    id: "school-protection",
    title: "School Protection",
    description: "Light traffic curbs plus construction stop near vulnerable receptors.",
    trafficReduction: 30,
    constructionHalt: true,
    industrialRestriction: 0,
  },
  {
    id: "traffic-crackdown",
    title: "Traffic Crackdown",
    description: "Aggressive transport controls for commuter-driven pollution spikes.",
    trafficReduction: 70,
    constructionHalt: false,
    industrialRestriction: 20,
  },
  {
    id: "full-emergency",
    title: "Full Emergency",
    description: "Citywide suppression package for severe AQI escalation.",
    trafficReduction: 60,
    constructionHalt: true,
    industrialRestriction: 60,
  },
] as const;



export default function DashboardPage() {
  const [city, setCity] = useState("Kolkata");
  const [liveData, setLiveData] = useState<LiveAQIPoint[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [selectedWard, setSelectedWard] = useState<WardDetail | null>(null);
  const [wards, setWards] = useState<{ id: number; name: string }[]>([]);
  const [forecast, setForecast] = useState<ForecastPoint[]>([]);
  const [attribution, setAttribution] = useState<AttributionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [wardLoading, setWardLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cityAvgAQI, setCityAvgAQI] = useState<number | null>(null);
  const [tickerItems, setTickerItems] = useState<string[]>([]);
  const [citizenReports, setCitizenReports] = useState<import("@/lib/api").CitizenReport[]>([]);
  const [showCitizenReports, setShowCitizenReports] = useState(true);

  // Weather and wind overlays
  const [showWind, setShowWind] = useState(true);
  const [windSpeed, setWindSpeed] = useState(6.5);
  const [windDir, setWindDir] = useState(180);
  const [isWindOverridden, setIsWindOverridden] = useState(false);
  const [weatherData, setWeatherData] = useState<{ temp_c: number; humidity_pct: number; wind_speed: number; wind_dir: number } | null>(null);
  const [showSatellite, setShowSatellite] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [showDownlinkHUD, setShowDownlinkHUD] = useState(false);
  const [committeeOpen, setCommitteeOpen] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [satelliteGrid, setSatelliteGrid] = useState<{ lat: number; lon: number; value: number }[]>([]);


  // AI Strategic Executive Briefing
  const [briefingText, setBriefingText] = useState("");
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Digital Twin policy simulation settings
  const [trafficReduction, setTrafficReduction] = useState(0);
  const [constructionHalt, setConstructionHalt] = useState(false);
  const [industrialRestriction, setIndustrialRestriction] = useState(0);
  const [simulatedWards, setSimulatedWards] = useState<Record<number, number> | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [showRoute, setShowRoute] = useState(false);
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [twinSimMinimized, setTwinSimMinimized] = useState(false);
  const [controlsMinimized, setControlsMinimized] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [live, heatmap, weather, reports] = await Promise.all([
        api.liveAQI(city),
        api.heatmap(city),
        api.currentWeather(city),
        api.citizenReports(city),
      ]);
      setLiveData(live);
      setHeatmapData(heatmap);
      setCitizenReports(reports);
      setLastUpdated(new Date());
      // Populate wards for VoiceController ward navigation
      setWards(heatmap.map((w) => ({ id: w.ward_id, name: w.ward_name })));

      if (weather) {
        setWeatherData(weather);
        if (!isWindOverridden) {
          setWindSpeed(weather.wind_speed || 6.5);
          setWindDir(weather.wind_dir || 180);
        }
      }

      // Compute city average AQI
      const aqis = live.filter((s) => s.aqi !== null).map((s) => s.aqi as number);
      if (aqis.length > 0) {
        setCityAvgAQI(Math.round(aqis.reduce((a, b) => a + b, 0) / aqis.length));
      }

      // Update ticker
      const tickerData = live
        .filter((s) => s.aqi !== null)
        .slice(0, 8)
        .map((s) => `${s.name}: AQI ${Math.round(s.aqi!)} (${s.category})`);
      setTickerItems(tickerData);
    } catch (e) {
      console.error("Failed to load AQI data:", e);
      setError("Couldn't reach the AETHER backend. Note: Render free tier takes ~50s to wake up on initial load. Please wait a moment and click Retry.");
    } finally {
      setLoading(false);
    }
  }, [city, isWindOverridden]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setTwinSimMinimized(true);
      setControlsMinimized(true);
    }
  }, []);

  // Reset wind override logic
  const handleResetWind = useCallback(() => {
    setIsWindOverridden(false);
    // Fetch live weather parameters
    api.currentWeather(city).then((w) => {
      if (w) {
        setWindSpeed(w.wind_speed || 6.5);
        setWindDir(w.wind_dir || 180);
      }
    }).catch((err) => console.error(err));
  }, [city]);

  const handleUpvoteReport = useCallback(async (id: number) => {
    try {
      const updated = await api.upvoteCitizenReport(id);
      setCitizenReports((prev) =>
        prev.map((r) => (r.id === id ? { ...r, upvote_count: updated.upvote_count, status: updated.status } : r))
      );
    } catch (e) {
      console.error("Failed to upvote report:", e);
    }
  }, []);

  const applyDemoScenario = useCallback(
    (scenario: (typeof DEMO_SCENARIOS)[number]) => {
      setTrafficReduction(scenario.trafficReduction);
      setConstructionHalt(scenario.constructionHalt);
      setIndustrialRestriction(scenario.industrialRestriction);
    },
    []
  );

  // Satellite Swath Sweep Scan trigger
  useEffect(() => {
    if (showSatellite) {
      setScanning(true);
      setShowDownlinkHUD(false);
      const timer = setTimeout(() => {
        setScanning(false);
        setShowDownlinkHUD(true);
      }, 2500);
      return () => clearTimeout(timer);
    } else {
      setScanning(false);
      setShowDownlinkHUD(false);
    }
  }, [showSatellite]);

  // Load Sentinel-5P satellite grid from backend
  useEffect(() => {
    if (showSatellite && city) {
      api.satelliteGrid(city)
        .then((res) => {
          if (res && res.grid) {
            setSatelliteGrid(res.grid);
          }
        })
        .catch((err) => console.error("Failed to load satellite grid:", err));
    }
  }, [showSatellite, city]);

  // Text to Speech logic
  const handleSpeak = (text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const cleanText = text.replace(/[#*`_-]/g, ""); // strip markdown formatting
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find((v) => v.lang.startsWith("en"));
    if (englishVoice) utterance.voice = englishVoice;

    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const loadBriefing = async () => {
    setBriefingLoading(true);
    setBriefingOpen(true);
    setDiagnosticsOpen(false);
    setCalibrationOpen(false);
    try {
      const res = await api.briefing(city);
      setBriefingText(res.briefing);
    } catch (e) {
      console.error("Failed to load briefing:", e);
      setBriefingText("Unable to compile briefing data. Please verify backend state.");
    } finally {
      setBriefingLoading(false);
    }
  };

  // Digital Twin simulated mapping logic
  useEffect(() => {
    if (!selectedWard) {
      setSimulatedWards(null);
      return;
    }

    // Run simulation if overrides are active or if wind parameters are manually changed
    if (trafficReduction === 0 && !constructionHalt && industrialRestriction === 0 && !isWindOverridden) {
      setSimulatedWards(null);
      return;
    }

    const runSimulation = async () => {
      setSimulating(true);
      try {
        const res = await api.simulationEvaluate(
          selectedWard.id,
          trafficReduction,
          constructionHalt,
          industrialRestriction,
          windSpeed,
          windDir
        );
        const mapping: Record<number, number> = {};
        res.results.forEach((r) => {
          mapping[r.ward_id] = r.simulated_aqi;
        });
        setSimulatedWards(mapping);
      } catch (e) {
        console.error("Failed to evaluate digital twin:", e);
      } finally {
        setSimulating(false);
      }
    };

    // Debounce simulation calls slightly to avoid spamming slider changes
    const delay = setTimeout(runSimulation, 250);
    return () => clearTimeout(delay);
  }, [selectedWard, trafficReduction, constructionHalt, industrialRestriction, windSpeed, windDir, isWindOverridden]);

  const simulatedHeatmapData = useMemo<HeatmapPoint[]>(() => {
    if (!simulatedWards) {
      return heatmapData;
    }
    return heatmapData.map((w) => {
      const simAqi = simulatedWards[w.ward_id];
      if (simAqi !== undefined) {
        return {
          ...w,
          aqi: simAqi,
          category: getAQILevel(simAqi).label,
        };
      }
      return w;
    });
  }, [heatmapData, simulatedWards]);

  const handleWardClick = useCallback(async (wardId: number) => {
    setSidebarOpen(true);
    setSelectedWard(null);
    setForecast([]);
    setAttribution(null);
    setWardLoading(true);

    try {
      const [wardDetail, attr] = await Promise.all([
        api.wardDetail(wardId),
        api.attribution(wardId),
      ]);
      setSelectedWard(wardDetail);
      setAttribution(attr);

      // Fetch forecast
      const fcResponse = await api.forecast(wardDetail.lat, wardDetail.lon, city);
      setForecast(fcResponse.forecasts);
    } catch (e) {
      console.error("Failed to load ward details:", e);
    } finally {
      setWardLoading(false);
    }
  }, [city]);



  // Heuristic Cost-Benefit calculations for the sandbox
  const costBenefits = useMemo(() => {
    if (!selectedWard) return null;
    const pop = selectedWard.population || 120000;
    
    // Economic costs (INR in Lakhs per day)
    const trafficCost = parseFloat((trafficReduction * 0.12).toFixed(2)); 
    const constructionCost = constructionHalt ? 6.5 : 0.0;
    const industrialCost = parseFloat((industrialRestriction * 0.28).toFixed(2));
    const totalCost = parseFloat((trafficCost + constructionCost + industrialCost).toFixed(2));
    
    // Health benefits based on simulated AQI drop
    const originalAqi = selectedWard.aqi || 150;
    const simulatedAqi = simulatedWards ? (simulatedWards[selectedWard.id] || originalAqi) : originalAqi;
    const aqiDrop = Math.max(0, originalAqi - simulatedAqi);
    
    // Estimate hospitalizations avoided: 1 hospitalization per day per 100K people per 20 AQI points drop
    const hospitalAvoided = parseFloat(((aqiDrop / 20) * (pop / 100000) * 1.25).toFixed(2));
    // Economic health savings: ₹1.8 Lakhs per hospitalization avoided (in hospital beds, loss of wages, drugs)
    const healthSavings = parseFloat((hospitalAvoided * 1.8).toFixed(2));
    
    // Net efficiency index (ROI)
    let roi = "0.0x";
    let roiColor = "text-gray-400";
    if (totalCost > 0) {
      const ratio = healthSavings / totalCost;
      roi = `${ratio.toFixed(1)}x`;
      if (ratio > 1.2) {
        roiColor = "text-emerald-400";
      } else if (ratio > 0.7) {
        roiColor = "text-yellow-400";
      } else {
        roiColor = "text-red-400";
      }
    }
    
    return {
      trafficCost,
      constructionCost,
      industrialCost,
      totalCost,
      hospitalAvoided,
      healthSavings,
      roi,
      roiColor,
      aqiDrop
    };
  }, [selectedWard, trafficReduction, constructionHalt, industrialRestriction, simulatedWards]);

  const hasActiveSimulation = trafficReduction > 0 || constructionHalt || industrialRestriction > 0 || isWindOverridden;

  const interventionSummary = useMemo(() => {
    if (!selectedWard || !costBenefits) return null;

    const actions: string[] = [];
    if (trafficReduction > 0) actions.push(`${trafficReduction}% traffic controls`);
    if (constructionHalt) actions.push("construction halt");
    if (industrialRestriction > 0) actions.push(`${industrialRestriction}% industrial restriction`);
    if (isWindOverridden) actions.push("wind-adjusted scenario");

    const recommendedAction =
      costBenefits.roi === "0.0x"
        ? "No action modeled"
        : costBenefits.aqiDrop >= 25
          ? "Activate emergency intervention package"
          : costBenefits.aqiDrop >= 10
            ? "Deploy targeted mitigation package"
            : "Use light-touch monitoring and enforcement";

    const outcomeTone =
      costBenefits.aqiDrop >= 25
        ? "text-emerald-400"
        : costBenefits.aqiDrop >= 10
          ? "text-yellow-400"
          : "text-gray-400";

    return {
      actions,
      recommendedAction,
      outcomeTone,
      projectedAQI: simulatedWards?.[selectedWard.id] ?? selectedWard.aqi ?? null,
    };
  }, [
    selectedWard,
    costBenefits,
    trafficReduction,
    constructionHalt,
    industrialRestriction,
    isWindOverridden,
    simulatedWards,
  ]);

  const activeScenarioId = useMemo(() => {
    const match = DEMO_SCENARIOS.find(
      (scenario) =>
        scenario.trafficReduction === trafficReduction &&
        scenario.constructionHalt === constructionHalt &&
        scenario.industrialRestriction === industrialRestriction
    );
    return match?.id ?? null;
  }, [trafficReduction, constructionHalt, industrialRestriction]);

  const cityLevel = getAQILevel(cityAvgAQI);

  return (
    <AppShell city={city} liveAQI={cityAvgAQI}>
    <div className="flex flex-col h-full bg-gray-950 overflow-hidden">
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <header className="flex-none z-[1100] flex flex-col lg:flex-row items-center justify-between px-4 py-3 gap-3 lg:gap-0 bg-gray-950/95 backdrop-blur-md border-b border-white/8 shadow-md">
        {/* Logo and Mobile controls */}
        <div className="flex items-center justify-between w-full lg:w-auto">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-sm text-gray-200 animate-fade-in">Situation Room</h1>
          </div>
          {/* Live indicator (mobile) */}
          <div className="flex lg:hidden items-center gap-1.5 text-xs text-gray-500 bg-gray-900/50 px-2.5 py-1 rounded-full border border-white/5">
            <div className="status-live animate-pulse" />
            <span>Live</span>
          </div>
        </div>

        {/* Weather context strip */}
        {weatherData && (
          <div className="flex items-center gap-3 text-[11px] bg-slate-900/60 border border-white/5 px-3 py-1 rounded-full text-slate-400 font-mono text-data">
            <span className="flex items-center gap-1 text-slate-300">🌡️ {weatherData.temp_c}°C</span>
            <span className="h-2.5 w-px bg-slate-800" />
            <span className="flex items-center gap-1 text-slate-300">💧 {weatherData.humidity_pct}% RH</span>
            <span className="h-2.5 w-px bg-slate-800" />
            <span className="flex items-center gap-1 text-slate-300">💨 {weatherData.wind_speed} km/h ({weatherData.wind_dir}°)</span>
          </div>
        )}

        {/* Selector + API keys / actions */}
        <div className="flex items-center justify-between lg:justify-end gap-2.5 w-full lg:w-auto flex-wrap sm:flex-nowrap">
          {/* Live indicator (desktop) */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-gray-500">
            <div className="status-live animate-pulse" />
            <span>Live</span>
          </div>

          {/* City AQI badge */}
          {cityAvgAQI !== null && (
            <div className="flex items-center gap-2 bg-gray-900/40 px-2 py-1 rounded-lg border border-white/5">
              <span className="text-[10px] text-gray-500 hidden sm:block uppercase tracking-wider">City avg</span>
              <AQIBadge aqi={cityAvgAQI} size="sm" />
            </div>
          )}

          {/* City selector */}
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setSelectedWard(null);
              setSidebarOpen(false);
              setTrafficReduction(0);
              setConstructionHalt(false);
              setIndustrialRestriction(0);
              if (typeof window !== "undefined" && window.speechSynthesis) {
                window.speechSynthesis.cancel();
                setSpeaking(false);
              }
              setBriefingOpen(false);
            }}
            className="text-xs sm:text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-500 cursor-pointer font-medium"
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* AI Executive Briefing button */}
          <button
            onClick={loadBriefing}
            className="text-xs bg-orange-500 hover:bg-orange-400 text-white font-semibold py-1.5 px-2.5 rounded-lg flex items-center gap-1 shadow-lg shadow-orange-500/20 transition-all border border-orange-400/40 cursor-pointer"
          >
            ✨ <span>AI Briefing</span>
          </button>

          {/* Sensor Diagnostics Button */}
          <button
            onClick={() => {
              setDiagnosticsOpen(!diagnosticsOpen);
              setBriefingOpen(false);
              setCalibrationOpen(false);
            }}
            className="text-xs bg-gray-800 border border-gray-700 hover:border-orange-500 text-orange-400 hover:text-orange-300 font-semibold py-1.5 px-2.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
          >
            🔧 <span>Sensor Health</span>
          </button>

          <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
            {/* Alert Notification Bell */}
            <AlertNotificationSystem liveAQI={liveData} city={city} />

            {/* Voice Controller — Jarvis mode */}
            <VoiceController
              city={city}
              setCity={setCity}
              setSelectedWard={(w) => {
                if (w) handleWardClick(w.id);
                else setSelectedWard(null);
              }}
              wards={wards}
              showWind={showWind}
              setShowWind={setShowWind}
              showSatellite={showSatellite}
              setShowSatellite={setShowSatellite}
              showCitizenReports={showCitizenReports}
              setShowCitizenReports={setShowCitizenReports}
              onConveneCommittee={() => setCommitteeOpen(true)}
              onTriggerVoiceBriefing={loadBriefing}
              setTrafficReduction={setTrafficReduction}
              setConstructionHalt={setConstructionHalt}
              setIndustrialRestriction={setIndustrialRestriction}
            />

            {/* Refresh button */}
            <button
              onClick={loadData}
              className="p-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-orange-400 hover:border-orange-500 transition-colors cursor-pointer"
              title="Refresh data"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </header>



      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Map (full width behind sidebar) ───────────────────────── */}
        <div className="flex-1 relative">
          {/* Scanning sweep animation overlay */}
          {scanning && (
            <div className="absolute inset-0 z-[500] pointer-events-none overflow-hidden rounded-none">
              <div className="w-full h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent shadow-[0_0_15px_#f97316] animate-scan" />
              <div className="absolute inset-0 bg-orange-500/5 animate-pulse" />
            </div>
          )}
          {error ? (
            <div className="flex items-center justify-center h-full w-full bg-gray-950/80 absolute inset-0 z-50">
              <div className="text-center glass-card p-6 border border-red-500/30 bg-red-950/20 max-w-md rounded-2xl">
                <span className="text-4xl mb-4 block">⚠️</span>
                <p className="text-gray-200 font-semibold mb-4">{error}</p>
                <button
                  onClick={() => {
                    setError(null);
                    loadData();
                  }}
                  className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all cursor-pointer"
                >
                  Retry
                </button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center animate-slide-up">
                <div className="w-16 h-16 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-300 font-medium">Loading {city} air quality data...</p>
                <p className="text-gray-600 text-sm mt-1">Fetching live CPCB station readings</p>
              </div>
            </div>
          ) : (
            <AetherMap
              liveData={liveData}
              heatmapData={simulatedHeatmapData}
              onWardClick={handleWardClick}
              selectedWardId={selectedWard?.id}
              city={city}
              showWind={showWind}
              windSpeed={windSpeed}
              windDir={windDir}
              showSatellite={showSatellite}
              satelliteGrid={satelliteGrid}
              showRoute={showRoute}
              wardDetail={selectedWard}
              citizenReports={citizenReports}
              showCitizenReports={showCitizenReports}
              onUpvoteReport={handleUpvoteReport}
            />
          )}



          {/* Station count badge */}
          {!loading && (
            <div className="absolute top-3 left-3 z-[800] glass-card px-3 py-1.5 text-xs text-gray-400">
              {liveData.length} stations · {heatmapData.length} wards monitored
            </div>
          )}

          {/* Last updated */}
          {lastUpdated && (
            <div className="absolute top-3 right-3 z-[800] glass-card px-3 py-1.5 text-xs text-gray-500">
              Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}

          {/* Floating Digital Twin Policy Panel */}
          <div className="absolute top-14 right-3 z-[800] glass-card p-3 md:p-4 w-72 max-w-[calc(100vw-24px)] space-y-3 border border-white/5 shadow-2xl bg-gray-950/90">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => setTwinSimMinimized(!twinSimMinimized)}>
                <span className="text-[10px] text-gray-400">{twinSimMinimized ? "➕" : "➖"}</span>
                <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider font-semibold">Digital Twin Sim</h3>
              </div>
              <div className="flex items-center gap-1.5">
                {simulating ? (
                  <span className="text-[9px] bg-orange-500/10 border border-orange-500/30 text-orange-400 px-1.5 py-0.5 rounded font-black animate-pulse">EVALUATING...</span>
                ) : (
                  <span className="text-[9px] bg-orange-500/10 border border-orange-500/30 text-orange-400 px-1.5 py-0.5 rounded font-black">ACTIVE</span>
                )}
              </div>
            </div>
            
            {!twinSimMinimized && (
              !selectedWard ? (
                <div className="text-center py-2 text-[10px] text-gray-500">
                  ⚠️ Select a ward on the map to run localized policy simulations.
                </div>
              ) : (
                <>
                <div className="space-y-2.5 text-xs">
                  <div className="space-y-2 border-b border-white/5 pb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Demo Playbook</span>
                      {activeScenarioId && (
                        <span className="text-[9px] text-emerald-400 font-semibold">Preset active</span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {DEMO_SCENARIOS.map((scenario) => {
                        const isActive = activeScenarioId === scenario.id;
                        return (
                          <button
                            key={scenario.id}
                            onClick={() => applyDemoScenario(scenario)}
                            className={`w-full rounded-lg border p-2 text-left transition-colors cursor-pointer ${
                              isActive
                                ? "border-orange-500/40 bg-orange-500/10"
                                : "border-white/5 bg-gray-900/40 hover:border-orange-500/20 hover:bg-gray-900/70"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-[11px] font-semibold ${isActive ? "text-orange-300" : "text-gray-200"}`}>
                                {scenario.title}
                              </span>
                              {isActive && (
                                <span className="text-[9px] font-black text-orange-400">LIVE</span>
                              )}
                            </div>
                            <p className="mt-1 text-[9px] leading-relaxed text-gray-500">
                              {scenario.description}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Traffic slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-300">
                      <span>🚗 Traffic Ban</span>
                      <span className="font-bold text-orange-400">{trafficReduction}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="10"
                      value={trafficReduction}
                      onChange={(e) => setTrafficReduction(Number(e.target.value))}
                      className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                  </div>

                  {/* Construction checkbox */}
                  <div className="flex items-center justify-between p-1.5 rounded bg-gray-900/40 border border-white/5">
                    <span className="text-gray-300 text-[11px]">🏗️ Construction Halt</span>
                    <input
                      type="checkbox"
                      checked={constructionHalt}
                      onChange={(e) => setConstructionHalt(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500 focus:ring-0 accent-orange-500 cursor-pointer"
                    />
                  </div>

                  {/* Industrial emission slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-gray-300">
                      <span>🏭 Industrial Restrictions</span>
                      <span className="font-bold text-orange-400">{industrialRestriction}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="10"
                      value={industrialRestriction}
                      onChange={(e) => setIndustrialRestriction(Number(e.target.value))}
                      className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                    />
                  </div>
                </div>

                {/* Dynamic Cost-Benefit sub-panel */}
                {(trafficReduction > 0 || constructionHalt || industrialRestriction > 0) && costBenefits && (
                  <div className="pt-3 border-t border-white/5 space-y-2 text-[10px] animate-slide-up">
                    <p className="font-bold text-orange-400 uppercase tracking-wider text-[9px]">Municipal Trade-Offs</p>
                    <div className="grid grid-cols-2 gap-2 text-gray-400">
                      <div className="bg-gray-900/50 p-2 rounded border border-white/5">
                        <span className="block text-gray-500 text-[8px] uppercase font-semibold">Economic Cost</span>
                        <span className="text-red-400 font-bold text-[11px]">₹ {costBenefits.totalCost} L</span>
                      </div>
                      <div className="bg-gray-900/50 p-2 rounded border border-white/5">
                        <span className="block text-gray-500 text-[8px] uppercase font-semibold">Health Savings</span>
                        <span className="text-emerald-400 font-bold text-[11px]">₹ {costBenefits.healthSavings} L</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center bg-gray-900/80 p-2 rounded border border-white/5 text-[9px]">
                      <span className="text-gray-400">Avoided Hospital:</span>
                      <span className="text-gray-200 font-bold font-mono">{costBenefits.hospitalAvoided} patients/day</span>
                    </div>
                    <div className="flex justify-between items-center bg-gray-900/80 p-2 rounded border border-white/5 text-[9px]">
                      <span className="text-gray-400">Strategic ROI Index:</span>
                      <span className={`font-black font-mono text-[11px] ${costBenefits.roiColor}`}>{costBenefits.roi}</span>
                    </div>
                  </div>
                )}

                {(trafficReduction > 0 || constructionHalt || industrialRestriction > 0) && (
                  <button
                    onClick={() => {
                      setTrafficReduction(0);
                      setConstructionHalt(false);
                      setIndustrialRestriction(0);
                    }}
                    className="w-full py-1 text-[10px] bg-red-950/20 border border-red-900/40 text-red-300 hover:bg-red-900/30 rounded transition-colors"
                  >
                    Reset Sim Overrides
                  </button>
                )}
              </>
            )
            )}
          </div>

          {/* AI Strategic Executive Briefing Overlay */}
          {briefingOpen && (
            <div className="absolute top-14 left-3 z-[950] glass-card p-4 w-80 max-w-[calc(100vw-24px)] max-h-[80%] overflow-y-auto border border-white/10 shadow-2xl flex flex-col gap-3 animate-slide-up">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h3 className="font-bold text-xs text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                  ✨ AI Strategic Briefing
                </h3>
                <button
                  onClick={() => {
                    setBriefingOpen(false);
                    if (typeof window !== "undefined" && window.speechSynthesis) {
                      window.speechSynthesis.cancel();
                      setSpeaking(false);
                    }
                  }}
                  className="text-gray-500 hover:text-gray-300 text-xs"
                >
                  ✕
                </button>
              </div>

              {briefingLoading ? (
                <div className="py-8 text-center text-xs text-gray-500 space-y-2">
                  <div className="w-5 h-5 border border-orange-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Synthesizing strategic parameters...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-xs text-gray-300 leading-relaxed prose prose-invert prose-xs max-w-none
                    [&_h1]:text-orange-400 [&_h1]:text-xs [&_h1]:font-bold [&_h1]:uppercase [&_h1]:tracking-wider [&_h1]:mb-1
                    [&_h2]:text-orange-300 [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:mb-1
                    [&_h3]:text-slate-300 [&_h3]:text-xs [&_h3]:font-semibold
                    [&_strong]:text-white [&_strong]:font-bold
                    [&_ul]:space-y-0.5 [&_li]:text-gray-400 [&_li]:text-xs
                    [&_p]:text-gray-300 [&_p]:text-xs [&_p]:leading-relaxed
                    [&_code]:bg-slate-800 [&_code]:px-1 [&_code]:rounded [&_code]:text-orange-300 [&_code]:font-mono [&_code]:text-[10px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefingText}</ReactMarkdown>
                  </div>
                  <div className="flex gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => handleSpeak(briefingText)}
                      className={`flex-1 py-1.5 rounded text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                        speaking
                          ? "bg-red-600 hover:bg-red-500 text-white"
                          : "bg-gray-800 hover:bg-gray-700 text-orange-400 border border-gray-700"
                      }`}
                    >
                      {speaking ? "⏹️ Stop Voice" : "🔊 Listen Briefing"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sensor Diagnostics Overlay */}
          {diagnosticsOpen && (
            <div className="absolute top-14 left-3 z-[950] w-85 max-w-[calc(100vw-24px)] max-h-[80%] overflow-y-auto animate-slide-up">
              <div className="relative bg-gray-950 border border-white/10 rounded-2xl shadow-2xl p-1.5">
                <button
                  onClick={() => setDiagnosticsOpen(false)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 text-xs z-50 cursor-pointer"
                >
                  ✕ Close
                </button>
                <SensorDiagnostics city={city} />
              </div>
            </div>
          )}

          {/* Multi-Agent Consensus Room Modal */}
          {selectedWard && (
            <AgentCommitteeModal
              isOpen={committeeOpen}
              onClose={() => setCommitteeOpen(false)}
              wardId={selectedWard.id}
              wardName={selectedWard.name}
              city={city}
            />
          )}

          {/* Satellite Calibration Overlay */}
          {calibrationOpen && (
            <div className="absolute top-14 left-3 z-[950] w-85 max-w-[calc(100vw-24px)] max-h-[80%] overflow-y-auto animate-slide-up">
              <div className="relative bg-gray-950 border border-white/10 rounded-2xl shadow-2xl p-1.5">
                <button
                  onClick={() => setCalibrationOpen(false)}
                  className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 text-xs z-50 cursor-pointer"
                >
                  ✕ Close
                </button>
                <SatelliteCalibration city={city} />
              </div>
            </div>
          )}


          {/* Floating Weather Layer Control Panel */}
          <div className="absolute bottom-16 right-3 z-[800] glass-card p-3 md:p-4 w-56 max-w-[calc(100vw-24px)] text-xs space-y-3 border border-white/5 shadow-lg bg-gray-950/90">
            <div className="flex items-center justify-between cursor-pointer select-none" onClick={() => setControlsMinimized(!controlsMinimized)}>
              <p className="text-gray-400 font-bold text-[9px] uppercase tracking-wider text-orange-500">Map Layers & Controls</p>
              <span className="text-[10px] text-gray-400">{controlsMinimized ? "➕" : "➖"}</span>
            </div>
            
            {!controlsMinimized && (
              <>
                <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 text-[11px] font-medium">Wind Flow Layer</span>
                <input
                  type="checkbox"
                  checked={showWind}
                  onChange={(e) => setShowWind(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-500 accent-orange-500 cursor-pointer"
                />
              </div>

              {showWind && (
                <div className="space-y-2 pl-2 border-l border-white/5 pt-1">
                  {/* Wind Direction Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>Wind Dir</span>
                      <span className="text-orange-400 font-bold">{Math.round(windDir)}°</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="360"
                      step="5"
                      value={windDir}
                      onChange={(e) => {
                        setWindDir(Number(e.target.value));
                        setIsWindOverridden(true);
                      }}
                      className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer accent-orange-500"
                    />
                  </div>

                  {/* Wind Speed Slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-gray-400 font-mono">
                      <span>Wind Speed</span>
                      <span className="text-orange-400 font-bold">{windSpeed.toFixed(1)} km/h</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="40"
                      step="0.5"
                      value={windSpeed}
                      onChange={(e) => {
                        setWindSpeed(Number(e.target.value));
                        setIsWindOverridden(true);
                      }}
                      className="w-full h-1 bg-gray-800 rounded appearance-none cursor-pointer accent-orange-500"
                    />
                  </div>

                  {isWindOverridden && (
                    <button
                      onClick={handleResetWind}
                      className="text-[9px] text-red-400 hover:text-red-300 hover:underline block text-right w-full font-semibold"
                    >
                      Reset to Live Weather
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 text-[11px] font-medium">Citizen Reports</span>
                <input
                  type="checkbox"
                  checked={showCitizenReports}
                  onChange={(e) => setShowCitizenReports(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-500 accent-orange-500 cursor-pointer"
                />
              </div>
            </div>

            <div className="border-t border-white/5 pt-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 text-[11px] font-medium">Sentinel-5P NO₂</span>
                <input
                  type="checkbox"
                  checked={showSatellite}
                  onChange={(e) => setShowSatellite(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-500 accent-orange-500 cursor-pointer"
                />
              </div>

              {showSatellite && (
                <button
                  onClick={() => {
                    setScanning(true);
                    setShowDownlinkHUD(false);
                    setTimeout(() => {
                      setScanning(false);
                      setShowDownlinkHUD(true);
                    }, 2500);
                  }}
                  disabled={scanning}
                  className="w-full py-1 text-[9px] bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 border border-orange-500/30 rounded font-semibold transition-all cursor-pointer text-center disabled:opacity-50"
                >
                  {scanning ? "📡 DOWNLINK SWEEP ACTIVE..." : "📡 RUN TELEMETRY SCAN"}
                </button>
              )}
            </div>

            <div className="border-t border-white/5 pt-2 flex items-center justify-between">
              <span className="text-gray-300 text-[11px] font-medium">Mitigation Route</span>
              <input
                type="checkbox"
                checked={showRoute}
                onChange={(e) => setShowRoute(e.target.checked)}
                className="w-4 h-4 rounded text-orange-500 accent-orange-500 cursor-pointer"
                disabled={!selectedWard}
                title={!selectedWard ? "Select a ward to enable routing" : ""}
              />
            </div>

            <div className="pt-2 border-t border-white/5 flex gap-2">
              <button
                onClick={() => {
                  setCalibrationOpen(!calibrationOpen);
                  setBriefingOpen(false);
                  setDiagnosticsOpen(false);
                }}
                className="flex-1 py-1 text-[9px] bg-gray-900 border border-gray-800 text-orange-400 hover:text-orange-300 rounded font-bold transition-colors cursor-pointer text-center"
              >
                📊 Calibration Curve
              </button>
            </div>
              </>
            )}
          </div>

          {/* Left Side Info Column (Legend, Health Impact, Satellite HUD) */}
          <div className="absolute bottom-6 left-3 z-[800] max-w-[calc(100vw-24px)] flex flex-col sm:flex-row items-end gap-3 pointer-events-auto">
            {/* Sentinel-5P Downlink Telemetry HUD */}
            {showDownlinkHUD && (
              <div className="glass-card p-3 border border-orange-500/25 shadow-2xl text-[10px] space-y-1.5 animate-slide-up bg-gray-950/95 w-56 flex-none">
                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                  <span className="font-bold text-orange-400 uppercase tracking-wider text-[9px] flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping" />
                    Satellite Downlink Connected
                  </span>
                  <button
                    onClick={() => setShowDownlinkHUD(false)}
                    className="text-gray-500 hover:text-gray-300 text-xs font-bold"
                  >
                    ✕
                  </button>
                </div>
                <div className="font-mono text-gray-400 space-y-0.5 text-[9px] leading-tight">
                  <p><span className="text-gray-500">ORBIT ID :</span> Sentinel-5P / S5P_TROPOMI_L3</p>
                  <p><span className="text-gray-500">SPECTRA  :</span> Tropospheric Column NO2 Density</p>
                  <p><span className="text-gray-500">ALTITUDE :</span> 824 km (Sun-Synchronous Polar)</p>
                  <p><span className="text-gray-500">GRID RES :</span> 5.5km x 3.5km spatial grid</p>
                  <p><span className="text-gray-500">FIDELITY :</span> Ground Monitor R² = 0.84</p>
                  <p className="text-emerald-400 font-semibold mt-1">✓ Virtual sensor grids generated for unsurveyed zones.</p>
                </div>
              </div>
            )}

            {/* Health Impact Estimate Panel */}
            <div className="w-56 flex-none">
              <HealthImpactCounter
                cityAvgAQI={cityAvgAQI}
                cityName={city}
                stationCount={liveData.length}
              />
            </div>


          </div>
        </div>

        {/* ── Intelligence Side Panel ────────────────────────────────── */}
        <div
          className={`absolute md:relative right-0 top-0 bottom-0 transition-all duration-300 ease-in-out glass-panel overflow-y-auto h-full ${
            sidebarOpen ? "w-full md:w-80 xl:w-96 opacity-100 z-[990]" : "w-0 opacity-0 pointer-events-none z-[-1]"
          }`}
          style={{ borderLeft: sidebarOpen ? "1px solid rgba(255,255,255,0.08)" : "none" }}
        >
          {sidebarOpen && (
            <div className="p-4 animate-slide-up space-y-4">
              {/* Panel Header */}
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-sm text-gray-200">Ward Intelligence</h2>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="text-gray-500 hover:text-gray-300 p-1 rounded"
                >
                  ✕
                </button>
              </div>

              {wardLoading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-8 skeleton rounded-lg w-3/4" />
                  <div className="h-4 skeleton rounded w-1/2" />
                  <div className="flex gap-2">
                    <div className="h-6 skeleton rounded-full w-20" />
                    <div className="h-6 skeleton rounded-full w-16" />
                  </div>
                  <div className="h-24 skeleton rounded-xl" />
                  <div className="h-32 skeleton rounded-xl" />
                  <div className="h-20 skeleton rounded-xl" />
                </div>
              ) : selectedWard ? (
                <>
                  {/* Ward Header */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-bold text-gray-100">{selectedWard.name}</h3>
                        <p className="text-xs text-gray-500">Ward #{selectedWard.ward_no} · {selectedWard.city}</p>
                      </div>
                      <AQIBadge aqi={selectedWard.aqi} size="lg" />
                    </div>

                    {/* Vulnerability flags */}
                    <div className="flex flex-wrap gap-1.5">
                      {selectedWard.hospital_count > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-red-900/40 border border-red-800/60 text-red-300 text-[10px]">
                          🏥 {selectedWard.hospital_count} hospital{selectedWard.hospital_count > 1 ? "s" : ""}
                        </span>
                      )}
                      {selectedWard.school_count > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-900/40 border border-blue-800/60 text-blue-300 text-[10px]">
                          🏫 {selectedWard.school_count} school{selectedWard.school_count > 1 ? "s" : ""}
                        </span>
                      )}
                      {selectedWard.population && (
                        <span className="px-2 py-0.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400 text-[10px]">
                          👥 {(selectedWard.population / 1000).toFixed(0)}K residents
                        </span>
                      )}
                    </div>

                    {/* SVI Details */}
                    {selectedWard.svi_index !== undefined && (
                      <div className="bg-orange-950/20 border border-orange-900/40 rounded-xl p-3 space-y-2 mt-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-orange-400">Social Vulnerability Index (SVI):</span>
                          <span className="font-mono font-black text-orange-300">
                            {(selectedWard.svi_index * 100).toFixed(1)}%
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-[9px] text-gray-400">
                          <div className="bg-gray-900/50 p-1.5 rounded text-center border border-white/5">
                            <span className="block text-[11px] font-bold text-gray-300">{selectedWard.elderly_percentage}%</span>
                            Elderly (&gt;65)
                          </div>
                          <div className="bg-gray-900/50 p-1.5 rounded text-center border border-white/5">
                            <span className="block text-[11px] font-bold text-gray-300">{selectedWard.child_percentage}%</span>
                            Children (&lt;5)
                          </div>
                          <div className="bg-gray-900/50 p-1.5 rounded text-center border border-white/5">
                            <span className="block text-[11px] font-bold text-gray-300">{selectedWard.low_income_percentage}%</span>
                            Low Income
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/8" />

                  {/* Source Attribution */}
                  {attribution ? (
                    <SourceBreakdown
                      breakdown={attribution.breakdown}
                      primarySource={attribution.primary_source}
                      confidence={attribution.confidence}
                      explanation={attribution.explanation}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-gray-500 text-sm">
                      <div className="w-4 h-4 border border-orange-500 border-t-transparent rounded-full animate-spin" />
                      Computing attribution...
                    </div>
                  )}

                  <div className="border-t border-white/8" />

                  {/* 72h Forecast */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      72-Hour Forecast
                    </h4>
                    {forecast.length > 0 ? (
                      <>
                        <ForecastChart forecasts={forecast} currentAQI={selectedWard.aqi ?? undefined} />
                        <div className="grid grid-cols-3 gap-2 mt-3">
                          {forecast.map((f) => (
                            <div key={f.horizon_hours} className="text-center p-2 rounded-lg bg-gray-800/60 border border-gray-700">
                              <p className="text-[10px] text-gray-500">+{f.horizon_hours}h</p>
                              <p className="font-bold text-sm" style={{ color: getAQILevel(f.predicted_aqi).color }}>
                                {Math.round(f.predicted_aqi)}
                              </p>
                              <p className="text-[9px] text-gray-500">{f.predicted_category}</p>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <div className="w-4 h-4 border border-orange-500 border-t-transparent rounded-full animate-spin" />
                        Generating forecast...
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/8" />

                  {/* Intervention ROI */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Intervention ROI
                    </h4>
                    {!hasActiveSimulation ? (
                      <div className="rounded-xl border border-dashed border-white/10 bg-gray-900/30 p-3 text-[11px] text-gray-500">
                        Adjust the Digital Twin controls to generate a commissioner-ready impact estimate for this ward.
                      </div>
                    ) : costBenefits && interventionSummary ? (
                      <div className="space-y-3">
                        <div className="rounded-xl border border-orange-500/20 bg-orange-950/15 p-3">
                          <p className="text-[10px] uppercase tracking-wider text-orange-400 font-bold mb-1">
                            Recommended Action
                          </p>
                          <p className={`text-sm font-semibold ${interventionSummary.outcomeTone}`}>
                            {interventionSummary.recommendedAction}
                          </p>
                          <p className="mt-2 text-[10px] text-gray-400">
                            Scenario: {interventionSummary.actions.join(" + ")}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div className="rounded-lg border border-white/5 bg-gray-900/60 p-2">
                            <p className="text-[9px] uppercase tracking-wider text-gray-500">Projected AQI</p>
                            <p className="text-lg font-black" style={{ color: getAQILevel(interventionSummary.projectedAQI).color }}>
                              {interventionSummary.projectedAQI !== null ? Math.round(interventionSummary.projectedAQI) : "\u2014"}
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/5 bg-gray-900/60 p-2">
                            <p className="text-[9px] uppercase tracking-wider text-gray-500">AQI Reduction</p>
                            <p className={`text-lg font-black ${costBenefits.aqiDrop > 0 ? "text-emerald-400" : "text-gray-400"}`}>
                              -{costBenefits.aqiDrop.toFixed(1)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-white/5 bg-gray-900/60 p-2">
                            <p className="text-[9px] uppercase tracking-wider text-gray-500">Health Savings</p>
                            <p className="text-lg font-black text-emerald-400">{"\u20B9"} {costBenefits.healthSavings}L</p>
                          </div>
                          <div className="rounded-lg border border-white/5 bg-gray-900/60 p-2">
                            <p className="text-[9px] uppercase tracking-wider text-gray-500">ROI Index</p>
                            <p className={`text-lg font-black ${costBenefits.roiColor}`}>{costBenefits.roi}</p>
                          </div>
                        </div>

                        <div className="rounded-lg border border-white/5 bg-gray-900/50 p-3 text-[11px] text-gray-400">
                          Estimated avoided hospital burden:{" "}
                          <span className="font-bold text-gray-200">{costBenefits.hospitalAvoided} patients/day</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-gray-500 text-sm">
                        <div className="w-4 h-4 border border-orange-500 border-t-transparent rounded-full animate-spin" />
                        Evaluating intervention impact...
                      </div>
                    )}
                  </div>

                  <div className="border-t border-white/8" />

                  {/* Actions */}
                  <div className="space-y-2">
                    <button
                      onClick={() => setCommitteeOpen(true)}
                      className="w-full py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold rounded-lg shadow-md hover:shadow-orange-500/20 transition-all border border-orange-400/20 cursor-pointer text-center"
                    >
                      ✨ Convene AI Committee
                    </button>
                    <div className="flex gap-2">
                      <Link
                        href={`/forecast?lat=${selectedWard.lat}&lon=${selectedWard.lon}&city=${city}`}
                        className="flex-1 text-center py-2 rounded-lg border border-orange-500/50 text-orange-400 text-xs font-medium hover:bg-orange-500/10 transition-colors"
                      >
                        Full Forecast →
                      </Link>
                      <Link
                        href="/enforcement"
                        className="flex-1 text-center py-2 rounded-lg border border-gray-700 text-gray-300 text-xs font-medium hover:bg-gray-800 transition-colors"
                      >
                        Enforcement →
                      </Link>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-gray-500 text-sm py-4">
                  <div className="w-4 h-4 border border-orange-500 border-t-transparent rounded-full animate-spin" />
                  Loading ward intelligence...
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Ticker ─────────────────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div className="flex-none h-8 bg-gray-900/90 border-t border-white/8 flex items-center overflow-hidden z-50">
          <div className="flex-none px-3 text-[10px] font-bold text-orange-500 uppercase tracking-wider border-r border-white/8 mr-3 whitespace-nowrap">
            LIVE
          </div>
          <div className="ticker-container flex-1">
            <div className="ticker-content text-xs text-gray-500">
              {tickerItems.join("  ·  ")}  ·  
              {tickerItems.join("  ·  ")}
            </div>
          </div>
        </div>
      )}

      {/* ── Emergency AQI Alert Banner ────────────────────────────────── */}
      {cityAvgAQI !== null && cityAvgAQI > 300 && (
        <div className="flex-none bg-red-900/90 border-t border-red-700/60 px-4 py-2 flex items-center gap-3 z-50 animate-slide-up">
          <span className="w-2.5 h-2.5 bg-red-400 rounded-full animate-ping flex-none" />
          <span className="text-red-200 text-xs font-bold uppercase tracking-wide flex-none">🚨 EMERGENCY ALERT</span>
          <span className="text-red-300 text-xs">
            {city} AQI has reached <span className="font-black text-red-100">{cityAvgAQI}</span> — {cityLevel.label}. 
            Vulnerable populations at severe health risk. Activate emergency protocols immediately.
          </span>
          <Link href="/enforcement" className="ml-auto flex-none px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg transition-colors">
            Deploy Response →
          </Link>
        </div>
      )}
    </div>
    </AppShell>
  );
}
