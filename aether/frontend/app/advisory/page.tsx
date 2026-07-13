"use client";
/**
 * AETHER — Citizen Health Advisory v2.0
 * Split-screen: Mini situation map + WhatsApp multilingual chat
 * + Personal Risk Calculator panel with activity recommendations.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, LiveAQIPoint, HeatmapPoint, WardDetail } from "@/lib/api";
import { AQIBadge } from "@/components/AQIBadge";
import { getAQILevel } from "@/lib/aqi-colors";
import { AppShell } from "@/components/AppShell";

// Dynamic import for map to avoid Next.js SSR leaflet errors
const AetherMap = dynamic(() => import("@/components/AetherMap").then((m) => m.AetherMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-950">
      <div className="text-center animate-pulse">
        <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
        <p className="text-gray-400 text-xs font-semibold">Loading Advisory Map...</p>
      </div>
    </div>
  ),
});

const LANGUAGES = [
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "bn", label: "বাংলা", flag: "🇮🇳" },
  { code: "hi", label: "हिन्दी", flag: "🇮🇳" },
];

const QUICK_QUESTIONS: Record<string, string[]> = {
  en: [
    "Is it safe to go jogging today?",
    "Should kids go to school?",
    "Which areas should I avoid?",
    "What mask should I wear?",
    "Is it safe for outdoor exercise?",
    "What's the health risk for elderly?",
  ],
  bn: [
    "আজ জগিং করা কি নিরাপদ?",
    "বাচ্চারা কি স্কুলে যেতে পারবে?",
    "কোন এলাকা এড়িয়ে চলব?",
    "কোন মাস্ক পরব?",
    "বাইরে ব্যায়াম করা কি ঠিক?",
    "বয়স্কদের জন্য কতটা বিপজ্জনক?",
  ],
  hi: [
    "क्या आज जॉगिंग सुरक्षित है?",
    "क्या बच्चे स्कूल जा सकते हैं?",
    "कौन से क्षेत्र से बचें?",
    "कौन सा मास्क पहनें?",
    "बाहर व्यायाम सुरक्षित है?",
    "बुजुर्गों के लिए कितना खतरनाक?",
  ],
};

// ─── Personal Risk Calculator Data ─────────────────────────────────────────

interface HealthProfile {
  id: string;
  label: string;
  icon: string;
  desc: string;
  sensitivity: number; // multiplier 1.0 = normal, 2.0 = double risk
}

const HEALTH_PROFILES: HealthProfile[] = [
  { id: "healthy_adult", label: "Healthy Adult", icon: "🏃", desc: "18–60 yrs, no conditions", sensitivity: 1.0 },
  { id: "child", label: "Child", icon: "👧", desc: "Under 15 years", sensitivity: 1.6 },
  { id: "elderly", label: "Elderly", icon: "👴", desc: "Over 60 years", sensitivity: 1.8 },
  { id: "asthmatic", label: "Asthmatic", icon: "💨", desc: "Respiratory condition", sensitivity: 2.2 },
  { id: "cardiac", label: "Cardiac Patient", icon: "❤️", desc: "Heart / CVD condition", sensitivity: 2.5 },
  { id: "pregnant", label: "Pregnant", icon: "🤰", desc: "Expecting mother", sensitivity: 1.9 },
];

interface ActivityRec {
  activity: string;
  icon: string;
  status: "safe" | "caution" | "avoid";
}

function getRiskProfile(aqi: number | null, sensitivity: number): {
  level: "minimal" | "low" | "moderate" | "high" | "very_high" | "dangerous";
  label: string;
  color: string;
  bgColor: string;
  pct: number;
  advice: string;
  mask: string;
  activities: ActivityRec[];
} {
  const effectiveAQI = aqi !== null ? aqi * (sensitivity * 0.6 + 0.4) : 0;

  let level: any = "minimal";
  let label = "Minimal Risk";
  let color = "#00e400";
  let bgColor = "bg-emerald-900/20 border-emerald-700/40";
  let pct = 5;
  let advice = "Air quality is safe. Enjoy outdoor activities freely.";
  let mask = "No mask needed";
  let activities: ActivityRec[] = [
    { activity: "Outdoor Running", icon: "🏃", status: "safe" },
    { activity: "School / Work", icon: "🏫", status: "safe" },
    { activity: "Outdoor Play", icon: "⚽", status: "safe" },
    { activity: "Morning Walk", icon: "🌅", status: "safe" },
    { activity: "Cycling", icon: "🚴", status: "safe" },
    { activity: "Windows Open", icon: "🪟", status: "safe" },
  ];

  if (effectiveAQI > 350) {
    level = "dangerous"; label = "Dangerous"; color = "#7e0023"; bgColor = "bg-red-950/40 border-red-700/60"; pct = 95;
    advice = "EMERGENCY: Stay indoors completely. Seal windows, run air purifiers. Visit a doctor if breathing feels difficult.";
    mask = "N100 / P100 respirator required";
    activities = [
      { activity: "Outdoor Running", icon: "🏃", status: "avoid" },
      { activity: "School / Work", icon: "🏫", status: "avoid" },
      { activity: "Outdoor Play", icon: "⚽", status: "avoid" },
      { activity: "Morning Walk", icon: "🌅", status: "avoid" },
      { activity: "Cycling", icon: "🚴", status: "avoid" },
      { activity: "Windows Open", icon: "🪟", status: "avoid" },
    ];
  } else if (effectiveAQI > 250) {
    level = "very_high"; label = "Very High Risk"; color = "#ff0000"; bgColor = "bg-red-900/30 border-red-700/50"; pct = 80;
    advice = "Stay indoors. Avoid any outdoor exertion. Wear N95 if you must go outside. Keep elderly and children inside.";
    mask = "N95 mandatory outdoors";
    activities = [
      { activity: "Outdoor Running", icon: "🏃", status: "avoid" },
      { activity: "School / Work", icon: "🏫", status: "caution" },
      { activity: "Outdoor Play", icon: "⚽", status: "avoid" },
      { activity: "Morning Walk", icon: "🌅", status: "avoid" },
      { activity: "Cycling", icon: "🚴", status: "avoid" },
      { activity: "Windows Open", icon: "🪟", status: "avoid" },
    ];
  } else if (effectiveAQI > 170) {
    level = "high"; label = "High Risk"; color = "#ff7e00"; bgColor = "bg-orange-900/30 border-orange-700/50"; pct = 60;
    advice = "Limit outdoor time to under 30 min. Wear N95 mask for any outdoor activity. Use indoor air purifier.";
    mask = "N95 recommended outdoors";
    activities = [
      { activity: "Outdoor Running", icon: "🏃", status: "avoid" },
      { activity: "School / Work", icon: "🏫", status: "caution" },
      { activity: "Outdoor Play", icon: "⚽", status: "avoid" },
      { activity: "Morning Walk", icon: "🌅", status: "caution" },
      { activity: "Cycling", icon: "🚴", status: "avoid" },
      { activity: "Windows Open", icon: "🪟", status: "caution" },
    ];
  } else if (effectiveAQI > 100) {
    level = "moderate"; label = "Moderate Risk"; color = "#ffff00"; bgColor = "bg-yellow-900/20 border-yellow-700/40"; pct = 40;
    advice = "Sensitive groups should avoid prolonged outdoor exertion. Wear a surgical mask if outdoors for >1 hour.";
    mask = "Surgical mask recommended";
    activities = [
      { activity: "Outdoor Running", icon: "🏃", status: "caution" },
      { activity: "School / Work", icon: "🏫", status: "safe" },
      { activity: "Outdoor Play", icon: "⚽", status: "caution" },
      { activity: "Morning Walk", icon: "🌅", status: "safe" },
      { activity: "Cycling", icon: "🚴", status: "caution" },
      { activity: "Windows Open", icon: "🪟", status: "safe" },
    ];
  } else if (effectiveAQI > 50) {
    level = "low"; label = "Low Risk"; color = "#92d050"; bgColor = "bg-lime-900/20 border-lime-700/40"; pct = 20;
    advice = "Generally safe. Sensitive individuals may feel minor discomfort during strenuous activity outdoors.";
    mask = "No mask needed (optional for sensitive)";
    activities = [
      { activity: "Outdoor Running", icon: "🏃", status: "safe" },
      { activity: "School / Work", icon: "🏫", status: "safe" },
      { activity: "Outdoor Play", icon: "⚽", status: "safe" },
      { activity: "Morning Walk", icon: "🌅", status: "safe" },
      { activity: "Cycling", icon: "🚴", status: "safe" },
      { activity: "Windows Open", icon: "🪟", status: "safe" },
    ];
  }

  return { level, label, color, bgColor, pct, advice, mask, activities };
}

// ─── Personal Risk Calculator Component ────────────────────────────────────

function PersonalRiskCalculator({ cityAQI }: { cityAQI: number | null }) {
  const [selectedProfile, setSelectedProfile] = useState<HealthProfile>(HEALTH_PROFILES[0]);

  const risk = useMemo(
    () => getRiskProfile(cityAQI, selectedProfile.sensitivity),
    [cityAQI, selectedProfile.sensitivity]
  );

  const STATUS_COLORS = {
    safe: "text-emerald-400 bg-emerald-900/20 border-emerald-700/30",
    caution: "text-yellow-400 bg-yellow-900/20 border-yellow-700/30",
    avoid: "text-red-400 bg-red-900/20 border-red-700/30",
  };
  const STATUS_ICON = { safe: "✓", caution: "⚠", avoid: "✕" };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* AQI Context */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-orange-400 uppercase tracking-wider">Personal Risk Calculator</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Select your health profile to get tailored advice</p>
        </div>
        {cityAQI !== null && <AQIBadge aqi={cityAQI} size="sm" />}
      </div>

      {/* Profile Grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {HEALTH_PROFILES.map((profile) => (
          <button
            key={profile.id}
            onClick={() => setSelectedProfile(profile)}
            className={`p-2 rounded-xl border text-left text-[10px] transition-all cursor-pointer flex flex-col gap-0.5 ${
              selectedProfile.id === profile.id
                ? "bg-orange-500/10 border-orange-500 text-orange-400"
                : "border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-700 bg-gray-900/40"
            }`}
            id={`profile-${profile.id}`}
          >
            <span className="text-base leading-none">{profile.icon}</span>
            <span className="font-bold leading-tight">{profile.label}</span>
            <span className="text-[8px] text-gray-600 leading-tight">{profile.desc}</span>
          </button>
        ))}
      </div>

      {/* Risk Gauge */}
      <div className={`rounded-xl border p-3 space-y-2 ${risk.bgColor}`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold" style={{ color: risk.color }}>{risk.label}</span>
          <span className="text-[10px] text-gray-400 font-mono">{risk.pct}% exposure index</span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${risk.pct}%`, backgroundColor: risk.color }}
          />
        </div>
        <p className="text-[10px] text-gray-300 leading-relaxed">{risk.advice}</p>
        <div className="flex items-center gap-2 text-[10px]">
          <span>😷</span>
          <span className="text-gray-400">{risk.mask}</span>
        </div>
      </div>

      {/* Activity Recommendations */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Activity Recommendations</p>
        <div className="grid grid-cols-2 gap-1.5">
          {risk.activities.map((act) => (
            <div
              key={act.activity}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[10px] ${STATUS_COLORS[act.status]}`}
            >
              <span className="text-xs">{act.icon}</span>
              <span className="flex-1 font-semibold leading-tight">{act.activity}</span>
              <span className="font-black text-xs">{STATUS_ICON[act.status]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Chat Message Interface ─────────────────────────────────────────────────

interface Message {
  id: string;
  role: "user" | "aether";
  text: string;
  aqi?: number | null;
  category?: string | null;
  timestamp: Date;
}

// ─── Main Advisory Page ─────────────────────────────────────────────────────

export default function AdvisoryPage() {
  const [language, setLanguage] = useState("en");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [location, setLocation] = useState<{ lat: number; lon: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Map & City selections
  const [city, setCity] = useState("Kolkata");
  const [liveData, setLiveData] = useState<LiveAQIPoint[]>([]);
  const [heatmapData, setHeatmapData] = useState<HeatmapPoint[]>([]);
  const [loadingMap, setLoadingMap] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [selectedWardDetail, setSelectedWardDetail] = useState<WardDetail | null>(null);

  // Right panel tab: "chat" | "risk"
  const [rightTab, setRightTab] = useState<"chat" | "risk">("chat");

  // City average AQI for risk calculator
  const cityAvgAQI = useMemo(() => {
    const valid = liveData.filter((s) => s.aqi !== null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((s, r) => s + r.aqi!, 0) / valid.length);
  }, [liveData]);

  // Load Map Wards and Live Readings
  const loadMapData = useCallback(async () => {
    setLoadingMap(true);
    setError(null);
    try {
      const [live, heatmap] = await Promise.all([
        api.liveAQI(city),
        api.heatmap(city),
      ]);
      setLiveData(live);
      setHeatmapData(heatmap);
    } catch (e) {
      console.error("Failed to load map data:", e);
      setError("Couldn't reach the AETHER backend. Note: Render free tier takes ~50s to wake up on initial load. Please wait a moment and click Retry.");
    } finally {
      setLoadingMap(false);
    }
  }, [city]);

  useEffect(() => {
    loadMapData();
  }, [loadMapData]);

  // Set default greeting and fetch initial browser geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => setLocation({ lat: 22.5726, lon: 88.3639 })
      );
    } else {
      setLocation({ lat: 22.5726, lon: 88.3639 });
    }

    const greeting: Message = {
      id: "0",
      role: "aether",
      text: language === "bn"
        ? "আমি AETHER, আপনার বায়ু মান সহায়ক। আপনার এলাকার বায়ু মান সম্পর্কে কিছু জানতে চান?"
        : language === "hi"
          ? "मैं AETHER हूं, आपका वायु गुणवत्ता सलाहकार। क्या आप अपने क्षेत्र की वायु गुणवत्ता के बारे में जानना चाहते हैं?"
          : "I'm AETHER, your air quality health advisor. Ask me anything about air quality in your area — I can answer in English, Bengali, or Hindi. You can also select a ward on the map to pin a location.",
      timestamp: new Date(),
    };
    setMessages([greeting]);
  }, [language]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    // Auto-switch to chat tab when a message is sent
    setRightTab("chat");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await api.advisory(
        text.trim(),
        language,
        location?.lat,
        location?.lon,
        sessionId
      );
      setSessionId(response.session_id);

      const aetherMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "aether",
        text: response.answer,
        aqi: response.aqi,
        category: response.category,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aetherMsg]);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: "aether",
          text: "Sorry, I couldn't fetch advisory data right now. Please try again.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleMapWardClick = useCallback(async (wardId: number) => {
    setSelectedWardId(wardId);
    setSelectedWardDetail(null);
    setError(null);
    try {
      const detail = await api.wardDetail(wardId);
      setSelectedWardDetail(detail);
      setLocation({ lat: detail.lat, lon: detail.lon });
    } catch (e) {
      console.error("Failed to load ward detail on click:", e);
      setError("Couldn't reach the AETHER backend. Note: Render free tier takes ~50s to wake up on initial load. Please wait a moment and click Retry.");
    }
  }, []);

  return (
    <AppShell city={city} liveAQI={cityAvgAQI}>
    <div className="min-h-full bg-gray-950 text-gray-100 flex flex-col h-screen overflow-hidden">
      {/* ── Header ── */}
      <header className="border-b border-white/8 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-0 bg-gray-950/95 backdrop-blur-md flex-none z-[1100]">
        <div className="flex items-center gap-4 justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-orange-500 font-black text-lg hover:text-orange-400 transition-colors">⬡ AETHER</Link>
            <span className="text-gray-700">·</span>
            <h1 className="font-bold text-sm text-gray-200">Citizen Advisory</h1>
          </div>
        </div>


        <div className="flex items-center gap-3">
          {/* City selector */}
          <select
            value={city}
            onChange={(e) => {
              setCity(e.target.value);
              setSelectedWardId(null);
              setSelectedWardDetail(null);
              setMessages([
                {
                  id: "city-reset",
                  role: "aether",
                  text: language === "bn"
                    ? `আমি AETHER, আপনার বায়ু মান সহায়ক। ${e.target.value} এলাকার বায়ু মান সম্পর্কে কিছু জানতে চান?`
                    : language === "hi"
                      ? `मैं AETHER हूं, आपका वायु गुणवत्ता सलाहकार। क्या आप ${e.target.value} क्षेत्र की वायु गुणवत्ता के बारे में जानना चाहते हैं?`
                      : `I'm AETHER, your air quality health advisor. Ask me anything about air quality in ${e.target.value}.`,
                  timestamp: new Date(),
                }
              ]);
            }}
            className="text-xs bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500"
          >
            {["Kolkata", "Delhi", "Mumbai"].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Language selector */}
          <div className="flex gap-1">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  language === l.code
                    ? "bg-orange-500/20 border border-orange-500/50 text-orange-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ── Main Split Container ── */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Panel: Mini Interactive Map */}
        <div className="hidden lg:block lg:w-[45%] xl:w-[50%] relative border-r border-white/8 h-full bg-gray-900/20">
          {loadingMap ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center animate-pulse">
                <div className="w-10 h-10 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <p className="text-gray-400 text-xs font-medium">Synthesizing geographical grid...</p>
              </div>
            </div>
          ) : (
            <div className="h-full w-full relative">
              <AetherMap
                liveData={liveData}
                heatmapData={heatmapData}
                onWardClick={handleMapWardClick}
                selectedWardId={selectedWardId}
                city={city}
                showWind={false}
              />
              
              {/* Ward Mini-Forecast Overlay */}
              {selectedWardDetail && (
                <div className="absolute top-4 left-4 z-[800] glass-card p-4 w-72 max-w-[calc(100vw-32px)] space-y-3 bg-gray-950/95 border border-white/10 shadow-2xl animate-slide-up">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-gray-100 text-xs">{selectedWardDetail.name}</h3>
                      <p className="text-[10px] text-gray-500">Ward #{selectedWardDetail.ward_no} · {selectedWardDetail.city}</p>
                    </div>
                    <AQIBadge aqi={selectedWardDetail.aqi} size="sm" />
                  </div>
                  <div className="text-[10px] text-gray-400 leading-normal space-y-1">
                    <p><span className="text-gray-500">Likely Pollution Factor:</span> <span className="text-orange-400 font-semibold">{selectedWardDetail.primary_source || "Heavy Traffic"}</span></p>
                    <p><span className="text-gray-500 font-medium">Receptors:</span> {selectedWardDetail.school_count} schools, {selectedWardDetail.hospital_count} hospitals</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const question = language === "bn"
                          ? `${selectedWardDetail.name} এর স্বাস্থ্য সতর্কতা কি?`
                          : language === "hi"
                            ? `${selectedWardDetail.name} के लिए स्वास्थ्य सलाह क्या है?`
                            : `What is the specific health advisory for residents in ${selectedWardDetail.name}?`;
                        sendMessage(question);
                      }}
                      className="flex-1 py-1.5 text-center bg-orange-600 hover:bg-orange-500 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer"
                    >
                      💬 Ask AI about this Ward
                    </button>
                    <button
                      onClick={() => setRightTab("risk")}
                      className="flex-1 py-1.5 text-center bg-gray-800 hover:bg-gray-700 text-gray-300 text-[10px] font-bold rounded-lg transition-colors cursor-pointer border border-gray-700"
                    >
                      ⚕️ Risk Profile
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel: Tabbed (Chat / Risk Calculator) */}
        <div className="flex-1 lg:w-[55%] xl:w-[50%] flex flex-col h-full bg-gray-950/30">
          
          {/* Tab Bar */}
          <div className="flex-none flex border-b border-white/8 bg-gray-950/40">
            <button
              onClick={() => setRightTab("chat")}
              className={`flex-1 py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                rightTab === "chat"
                  ? "text-orange-400 border-b-2 border-orange-500 bg-orange-500/5"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              id="advisory-chat-tab"
            >
              💬 AI Health Chat
            </button>
            <button
              onClick={() => setRightTab("risk")}
              className={`flex-1 py-2.5 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                rightTab === "risk"
                  ? "text-orange-400 border-b-2 border-orange-500 bg-orange-500/5"
                  : "text-gray-500 hover:text-gray-300"
              }`}
              id="advisory-risk-tab"
            >
              ⚕️ Personal Risk Calculator
              {cityAvgAQI !== null && cityAvgAQI > 200 && (
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              )}
            </button>
          </div>

          {error && (
            <div className="flex-none px-6 py-3 border-b border-red-500/20 bg-red-950/20 text-red-200 flex items-center justify-between gap-4 animate-slide-up">
              <div className="flex items-center gap-2 text-xs">
                <span>⚠️</span>
                <span>{error}</span>
              </div>
              <button
                onClick={() => {
                  setError(null);
                  loadMapData();
                  if (selectedWardId) {
                    handleMapWardClick(selectedWardId);
                  }
                }}
                className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded transition-all cursor-pointer flex-none"
              >
                Retry
              </button>
            </div>
          )}

          {/* ── CHAT TAB ── */}
          {rightTab === "chat" && (
            <>
              {/* Location status bar */}
              <div className="flex-none px-6 py-2.5 flex items-center justify-between text-[10px] text-gray-500 border-b border-white/5 bg-gray-900/20">
                <div className="flex items-center gap-1.5">
                  <span>📍 Position Matrix:</span>
                  <span className="font-mono text-gray-400">
                    {location ? `${location.lat.toFixed(4)}°N, ${location.lon.toFixed(4)}°E` : "Tracking GPS Signal..."}
                  </span>
                </div>
                {selectedWardDetail && (
                  <div className="text-[9px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2 py-0.5 rounded font-semibold font-mono">
                    PINNED: {selectedWardDetail.name}
                  </div>
                )}
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-slide-up`}
                  >
                    {msg.role === "aether" && (
                      <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-sm mr-2.5 flex-none mt-1 shadow-md">
                        ⬡
                      </div>
                    )}
                    <div className="max-w-[80%] space-y-1.5">
                      <div
                        className={`px-4 py-3 rounded-2xl text-xs leading-relaxed shadow-sm ${
                          msg.role === "user"
                            ? "bg-orange-500/20 border border-orange-500/30 text-orange-100 rounded-br-none"
                            : "glass-card text-gray-200 rounded-bl-none border-white/5 bg-gray-900/60"
                        }`}
                      >
                        {msg.text}
                      </div>

                      {/* Context AQI Badge */}
                      {msg.role === "aether" && msg.aqi !== null && msg.aqi !== undefined && (
                        <div className="flex items-center gap-2 px-2">
                          <AQIBadge aqi={msg.aqi} size="sm" />
                          <span className="text-[9px] text-gray-500">
                            {selectedWardDetail ? selectedWardDetail.name : "Active location"} • {new Date(msg.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start">
                    <div className="w-8 h-8 rounded-full bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-sm mr-2.5 flex-none">
                      ⬡
                    </div>
                    <div className="glass-card px-4 py-3 rounded-2xl rounded-bl-none bg-gray-900/60 border-white/5">
                      <div className="flex gap-1.5 py-1">
                        {[0, 150, 300].map((delay) => (
                          <div
                            key={delay}
                            className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce"
                            style={{ animationDelay: `${delay}ms` }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick recommendations ticker */}
              <div className="flex-none px-6 pb-2.5 bg-transparent">
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {QUICK_QUESTIONS[language]?.map((q) => (
                    <button
                      key={q}
                      onClick={() => sendMessage(q)}
                      disabled={loading}
                      className="flex-none px-3.5 py-1.5 rounded-full text-[10px] border border-gray-800 hover:border-orange-500/40 text-gray-400 hover:text-orange-300 bg-gray-900/40 transition-all whitespace-nowrap disabled:opacity-50 cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Chat input box */}
              <div className="flex-none p-4 border-t border-white/8 bg-gray-950">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
                    placeholder={
                      language === "bn" ? "আপনার প্রশ্ন লিখুন..." :
                      language === "hi" ? "अपना सवाल लिखें..." :
                      "Ask about air quality, health risks, or safe activities..."
                    }
                    className="flex-1 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                  <button
                    onClick={() => sendMessage(input)}
                    disabled={loading || !input.trim()}
                    className="px-4 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── RISK CALCULATOR TAB ── */}
          {rightTab === "risk" && (
            <div className="flex-1 overflow-y-auto">
              <PersonalRiskCalculator cityAQI={cityAvgAQI} />
              
              {/* Link to chat */}
              <div className="px-4 pb-4">
                <button
                  onClick={() => setRightTab("chat")}
                  className="w-full py-2.5 text-center bg-orange-600/20 hover:bg-orange-600/30 text-orange-400 text-xs font-bold rounded-xl border border-orange-500/30 transition-colors cursor-pointer"
                >
                  💬 Ask AI for personalized advice →
                </button>
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
    </AppShell>
  );
}
