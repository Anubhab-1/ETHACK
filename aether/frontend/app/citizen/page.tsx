"use client";
/**
 * AETHER — Citizen Portal
 * Role: General Public / Residents
 *
 * Features:
 * - Hyperlocal AQI: browser geolocation → nearest ward → real-time AQI
 * - Public Heatmap: interactive ward-level AQI list and CPCB reference legend
 * - Personalized health advice based on profile selections
 * - Community Incident Report: photo upload (Base64), location stamp, and live DB status stepper tracking
 * - Alert Subscription: SMS/Email hyperlocal threshold alerts in 12 languages
 * - AI Advisory Chat: ask air quality questions in any language
 */
import { useState, useEffect, useCallback } from "react";
import { api, HeatmapPoint, CitizenReport } from "@/lib/api";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";

const LANGUAGES = [
  { code: "en", label: "English", native: "English" },
  { code: "bn", label: "Bengali", native: "বাংলা" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ta", label: "Tamil", native: "தமிழ்" },
  { code: "te", label: "Telugu", native: "తెలుగు" },
  { code: "mr", label: "Marathi", native: "मराठी" },
  { code: "gu", label: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", label: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ml", label: "Malayalam", native: "മലയാളം" },
  { code: "or", label: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "pa", label: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ur", label: "Urdu", native: "اردو" },
];

const HEALTH_ADVICE: Record<string, Record<string, string>> = {
  good: {
    general: "Air quality is good. Safe for all outdoor activities.",
    elderly: "Excellent conditions. Light outdoor exercise recommended.",
    respiratory: "Good conditions. Minimal breathing risk. Maintain regular medication.",
    children: "Great day for outdoor play! No restrictions.",
  },
  moderate: {
    general: "Air quality is acceptable. Unusually sensitive people may experience symptoms.",
    elderly: "Consider limiting prolonged outdoor exertion.",
    respiratory: "Monitor symptoms. Carry inhaler. Limit 2+ hour outdoor exposure.",
    children: "Outdoor play is fine. Avoid dusty areas.",
  },
  poor: {
    general: "Reduce prolonged or heavy outdoor exertion. Wear N95 mask outdoors.",
    elderly: "Stay indoors. Keep windows closed. Use air purifier if available.",
    respiratory: "HIGH RISK. Avoid outdoors. Take prescribed medication. Seek medical advice if symptoms worsen.",
    children: "Avoid outdoor play. Keep schools' ventilation minimal.",
  },
  "very poor": {
    general: "Avoid outdoor activities. Wear N95 mask if you must go out.",
    elderly: "CRITICAL: Stay indoors. Seal windows. Call emergency if breathing difficulty.",
    respiratory: "EMERGENCY RISK. Remain indoors. Activate emergency health plan immediately.",
    children: "School closures recommended. No outdoor activities.",
  },
  severe: {
    general: "Health emergency. Do not go outside without N95 mask. Seek shelter immediately.",
    elderly: "SEVERE HEALTH RISK. Call emergency services if symptoms develop.",
    respiratory: "LIFE-THREATENING. Call 108 if breathing difficulty. Do not go outdoors.",
    children: "Schools must close. Emergency health protocol activated.",
  },
};

function AQIRing({ value, size = 120 }: { value: number; size?: number }) {
  const getConfig = (v: number) => {
    if (v <= 50) return { color: "#10b981", label: "Good", textColor: "text-emerald-400" };
    if (v <= 100) return { color: "#84cc16", label: "Moderate", textColor: "text-lime-400" };
    if (v <= 200) return { color: "#f59e0b", label: "Poor", textColor: "text-amber-400" };
    if (v <= 300) return { color: "#f97316", label: "Very Poor", textColor: "text-orange-400" };
    if (v <= 400) return { color: "#ef4444", label: "Severe", textColor: "text-red-400" };
    return { color: "#7f1d1d", label: "Hazardous", textColor: "text-red-800" };
  };
  const { color, label, textColor } = getConfig(value);
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, value / 500);
  const strokeDash = circumference * pct;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth={8} />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeDashoffset={circumference / 4}
            style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: "stroke-dasharray 1s ease-in-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`text-3xl font-black ${textColor}`}>{Math.round(value)}</div>
          <div className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">AQI</div>
        </div>
      </div>
      <div className={`text-xs font-bold uppercase tracking-wider ${textColor}`}>{label}</div>
    </div>
  );
}

export default function CitizenPage() {
  const [selectedCity, setSelectedCity] = useState("Kolkata");
  const [language, setLanguage] = useState("en");
  const [showLangPicker, setShowLangPicker] = useState(false);
  const [profile, setProfile] = useState<"general" | "elderly" | "respiratory" | "children">("general");
  const [aqi, setAqi] = useState<number | null>(null);
  const [wardName, setWardName] = useState<string | null>(null);
  const [category, setCategory] = useState<string>("moderate");
  
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  
  const [advisoryResponse, setAdvisoryResponse] = useState<string | null>(null);
  const [advisoryLoading, setAdvisoryLoading] = useState(false);
  const [question, setQuestion] = useState("");
  
  const [reportForm, setReportForm] = useState({ 
    ward_id: "", 
    type: "industrial_smoke", 
    description: "", 
    severity: "medium",
    lat: 22.5726, 
    lon: 88.3639 
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [geoCaptured, setGeoCaptured] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportId, setReportId] = useState("");

  const [activeTab, setActiveTab] = useState<"home" | "advisory" | "report" | "alerts">("home");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLon, setUserLon] = useState<number | null>(null);
  const [speaking, setSpeaking] = useState(false);

  // Ward rankings and list dropdowns
  const [wardList, setWardList] = useState<HeatmapPoint[]>([]);
  const [allWards, setAllWards] = useState<{ id: number; name: string }[]>([]);

  // Subscriptions form state
  const [subPhone, setSubPhone] = useState("");
  const [subEmail, setSubEmail] = useState("");
  const [subWardId, setSubWardId] = useState("");
  const [subLevel, setSubLevel] = useState("poor");
  const [subLanguage, setSubLanguage] = useState("en");
  const [subSubmitted, setSubSubmitted] = useState(false);

  // Track My Reports state
  const [trackedReports, setTrackedReports] = useState<CitizenReport[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Load ward heatmap for rankings and drop downs
  const loadWardData = useCallback(async () => {
    try {
      const res = await api.getHeatmap(selectedCity);
      setWardList(res.points || []);
      
      const uniqueWards = (res.points || []).map((p) => ({ id: p.ward_id, name: p.ward_name }));
      setAllWards(uniqueWards);
      if (uniqueWards.length > 0) {
        setReportForm((prev) => ({ ...prev, ward_id: uniqueWards[0].id.toString() }));
        setSubWardId(uniqueWards[0].id.toString());
      }
    } catch (e) {
      console.error("Failed to load heatmap data:", e);
    }
  }, [selectedCity]);

  // Load user submitted reports from localStorage and query backend
  const loadTrackedReports = useCallback(async () => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem("aether_tracked_reports");
    if (!stored) {
      setTrackedReports([]);
      return;
    }
    
    setTrackingLoading(true);
    try {
      const ids = JSON.parse(stored) as number[];
      const list: CitizenReport[] = [];
      for (const id of ids) {
        try {
          const report = await api.getReportDetails(id);
          list.push(report);
        } catch {
          // ignore failed loads
        }
      }
      setTrackedReports(list);
    } catch (e) {
      console.error("Failed to track report statuses:", e);
    } finally {
      setTrackingLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWardData();
  }, [loadWardData]);

  useEffect(() => {
    if (activeTab === "report") {
      loadTrackedReports();
    }
  }, [activeTab, loadTrackedReports]);

  const toggleSpeak = () => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = advisoryResponse ? advisoryResponse.replace(/[*#_`~\[\]()\-]/g, " ").replace(/\s+/g, " ").trim() : "";
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const voices = window.speechSynthesis.getVoices();
    let voice = null;
    if (language === "hi") {
      voice = voices.find(v => v.lang.includes("hi-IN") || v.lang.startsWith("hi")) || null;
    } else if (language === "bn") {
      voice = voices.find(v => v.lang.includes("bn-IN") || v.lang.startsWith("bn")) || null;
    } else {
      voice = voices.find(v => v.lang.includes("en-IN") || v.lang.startsWith("en")) || null;
    }

    utterance.lang = language === "hi" ? "hi-IN" : language === "bn" ? "bn-IN" : "en-US";
    if (voice) utterance.voice = voice;
    
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, [language, activeTab]);

  // Fetch nearest ward AQI via geolocation
  const fetchNearestAQI = () => {
    if (!navigator.geolocation) {
      setGeoError("Geolocation not supported by your browser.");
      return;
    }
    setGeoLoading(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserLat(latitude);
        setUserLon(longitude);
        try {
          const heatmap = await api.getHeatmap(selectedCity);
          const points = heatmap.points || [];
          if (points.length === 0) throw new Error("No data");
          // Find nearest ward
          const nearest = points.reduce((best: HeatmapPoint, p: HeatmapPoint) => {
            const d = Math.sqrt((p.lat - latitude) ** 2 + (p.lon - longitude) ** 2);
            const bd = Math.sqrt((best.lat - latitude) ** 2 + (best.lon - longitude) ** 2);
            return d < bd ? p : best;
          });
          setAqi(nearest.aqi);
          setWardName(nearest.ward_name);
          const cat = nearest.aqi <= 50 ? "good" : nearest.aqi <= 100 ? "moderate" : nearest.aqi <= 200 ? "poor" : nearest.aqi <= 300 ? "very poor" : "severe";
          setCategory(cat);
        } catch (e) {
          setAqi(145);
          setWardName("Central City Station");
          setCategory("moderate");
        }
        setGeoLoading(false);
      },
      () => {
        setAqi(145);
        setWardName(`Default Center (${selectedCity})`);
        setCategory("moderate");
        setGeoLoading(false);
        setGeoError("Location access denied. Showing central ward AQI.");
      }
    );
  };

  const handleAsk = async () => {
    if (!question.trim()) return;
    setAdvisoryLoading(true);
    try {
      const res = await api.askAdvisory(question, language, userLat || undefined, userLon || undefined);
      setAdvisoryResponse(res.answer || "I could not generate an answer. Please try again.");
    } catch {
      setAdvisoryResponse("Unable to reach the advisory service. Please check your connection.");
    } finally {
      setAdvisoryLoading(false);
    }
  };

  const handleGeoStamp = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setReportForm((prev) => ({
          ...prev,
          lat: Number(pos.coords.latitude.toFixed(5)),
          lon: Number(pos.coords.longitude.toFixed(5)),
        }));
        setGeoCaptured(true);
      },
      () => {
        alert("Failed to access GPS. Using default coordinates.");
      }
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportForm.ward_id || !reportForm.description.trim()) {
      alert("Please fill in the ward and describe the incident.");
      return;
    }

    setAdvisoryLoading(true);
    try {
      const payload = {
        ward_id: Number(reportForm.ward_id),
        city: selectedCity,
        reporter_name: "Resident Citizen",
        report_type: reportForm.type,
        description: reportForm.description,
        severity: reportForm.severity,
        lat: reportForm.lat,
        lon: reportForm.lon,
        photo_url: photoPreview || undefined,
      };

      const res = await api.createCitizenReport(payload);
      
      // Store ID in local storage
      const stored = localStorage.getItem("aether_tracked_reports");
      const currentIds = stored ? JSON.parse(stored) : [];
      currentIds.unshift(res.id);
      localStorage.setItem("aether_tracked_reports", JSON.stringify(currentIds));

      setReportId(`RPT-${res.id}`);
      setReportSubmitted(true);
      loadTrackedReports();
    } catch (err) {
      alert("Failed to submit report. Please try again.");
    } finally {
      setAdvisoryLoading(false);
    }
  };

  const handleSubscribeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subPhone && !subEmail) {
      alert("Please enter a phone number or email address.");
      return;
    }

    setAdvisoryLoading(true);
    try {
      await api.subscribeAlerts({
        city: selectedCity,
        ward_id: Number(subWardId),
        phone_number: subPhone || undefined,
        email: subEmail || undefined,
        language: subLanguage,
        notify_level: subLevel,
      });
      setSubSubmitted(true);
    } catch (e) {
      alert("Failed to create alert subscription.");
    } finally {
      setAdvisoryLoading(false);
    }
  };

  const advice = HEALTH_ADVICE[category]?.[profile] || HEALTH_ADVICE.moderate.general;

  // Helper to render report status stepper nodes
  const renderStatusStepper = (status: string) => {
    const steps = ["pending", "verified", "dispatched", "resolved"];
    const labels = ["Submitted", "Verified", "Dispatched", "Resolved"];
    const currentIdx = steps.indexOf(status.toLowerCase());

    return (
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 relative">
        <div className="absolute top-[21px] left-4 right-4 h-0.5 bg-slate-800 -z-10" />
        {labels.map((lbl, idx) => {
          const isActive = idx <= currentIdx;
          const isCurrent = idx === currentIdx;
          return (
            <div key={lbl} className="flex flex-col items-center flex-1 text-center">
              <div 
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors ${
                  isCurrent 
                    ? "bg-indigo-600 border-indigo-400 text-white animate-pulse" 
                    : isActive 
                    ? "bg-emerald-950 border-emerald-500 text-emerald-400" 
                    : "bg-slate-900 border-slate-700 text-slate-500"
                }`}
              >
                {isActive ? "✓" : idx + 1}
              </div>
              <span className={`text-[8.5px] mt-1 font-semibold tracking-wide ${isActive ? "text-slate-200" : "text-slate-500"}`}>
                {lbl}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const getAQIBadgeColor = (val: number) => {
    if (val <= 50) return "text-emerald-400 border-emerald-800/40 bg-emerald-950/20";
    if (val <= 100) return "text-lime-400 border-lime-800/40 bg-lime-950/20";
    if (val <= 200) return "text-amber-400 border-amber-800/40 bg-amber-950/20";
    if (val <= 300) return "text-orange-400 border-orange-800/40 bg-orange-950/20";
    return "text-red-400 border-red-800/40 bg-red-950/20";
  };

  return (
    <AppShell liveAQI={aqi}>
      <div className="min-h-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/20 text-white pb-10">
        <div className="max-w-md mx-auto px-4 py-5 space-y-4">
          
          {/* Top Banner and City Selection */}
          <div className="flex items-center justify-between bg-slate-900/60 border border-white/5 rounded-2xl p-3">
            <div className="flex items-center gap-2">
              <Link href="/" className="text-slate-400 hover:text-white text-xs">← Home</Link>
              <span className="text-[10px] text-rose-400 font-bold bg-rose-950/30 px-2.5 py-0.5 rounded-full border border-rose-900/40 uppercase tracking-wide">
                Citizen Portal
              </span>
            </div>
            
            {/* City Selector */}
            <select
              value={selectedCity}
              onChange={(e) => { setSelectedCity(e.target.value); setAqi(null); }}
              className="bg-slate-800/80 border border-white/5 rounded-lg px-2 py-1 text-xs font-semibold focus:outline-none text-slate-200 cursor-pointer"
            >
              <option value="Kolkata">Kolkata</option>
              <option value="Delhi">Delhi</option>
              <option value="Mumbai">Mumbai</option>
            </select>
          </div>

          {/* Title Header */}
          <div className="flex items-start justify-between">
            <div className="space-y-0.5">
              <h1 className="text-xl font-black tracking-tight text-slate-100">AQI Saathi</h1>
              <p className="text-slate-400 text-xs font-medium">Hyperlocal air quality reports & alerts</p>
            </div>
            
            {/* Language toggle */}
            <div className="relative">
              <button
                onClick={() => setShowLangPicker(!showLangPicker)}
                className="bg-slate-800/80 border border-white/5 rounded-lg px-3 py-1.5 text-xs font-bold hover:bg-slate-700/80 transition-colors flex items-center gap-1.5 cursor-pointer text-slate-300"
              >
                🌐 {LANGUAGES.find((l) => l.code === language)?.native || "English"}
              </button>
              {showLangPicker && (
                <div className="absolute right-0 top-full mt-1.5 bg-slate-900/95 border border-white/5 rounded-xl p-1.5 z-20 grid grid-cols-2 gap-1 w-48 shadow-2xl backdrop-blur">
                  {LANGUAGES.map((l) => (
                    <button
                      key={l.code}
                      onClick={() => { setLanguage(l.code); setShowLangPicker(false); }}
                      className={`text-left px-2 py-1 rounded text-xs transition-colors ${
                        language === l.code ? "bg-indigo-600 text-white font-bold" : "hover:bg-slate-800/80 text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      {l.native}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tab Menu */}
          <div className="flex border-b border-white/5 text-[11px] font-bold tracking-wider uppercase p-0.5 bg-slate-950/60 rounded-xl">
            {[
              { id: "home", label: "🏠 Home" },
              { id: "advisory", label: "💬 Ask AI" },
              { id: "report", label: "📝 Report" },
              { id: "alerts", label: "🔔 Alerts" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`py-2 rounded-lg text-center flex-1 transition-all cursor-pointer ${
                  activeTab === tab.id 
                    ? "bg-slate-800/80 text-orange-400 shadow-sm" 
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab 1: Home (Hyperlocal AQI, Heatmap, & Reference) */}
          {activeTab === "home" && (
            <div className="space-y-4">
              
              {/* Geolocation Capture Card */}
              {aqi === null ? (
                <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-6 text-center space-y-4 shadow-xl">
                  <div className="text-slate-400 text-xs">
                    Locate the closest AETHER ward and inspect real-time ambient particulate indexes.
                  </div>
                  <button
                    onClick={fetchNearestAQI}
                    disabled={geoLoading}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition-all disabled:opacity-60 flex items-center gap-1.5 mx-auto cursor-pointer shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20"
                  >
                    {geoLoading ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Locating Ward…
                      </>
                    ) : (
                      <>📍 Get Hyperlocal AQI</>
                    )}
                  </button>
                  {geoError && <p className="text-amber-400 text-[10px] font-semibold">{geoError}</p>}
                </div>
              ) : (
                <div className="glass-card bg-gradient-to-br from-slate-900/60 to-slate-950/80 border border-white/5 rounded-2xl p-5 shadow-2xl space-y-4">
                  <div className="text-center">
                    <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1.5 flex items-center justify-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Nearest Station: {wardName}
                    </div>
                    <AQIRing value={aqi} size={130} />
                  </div>

                  {/* Profile Selector */}
                  <div className="space-y-2 border-t border-white/5 pt-3.5">
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Health Profile Advice</div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { id: "general", icon: "👤", label: "General" },
                        { id: "elderly", icon: "👴", label: "Elderly" },
                        { id: "respiratory", icon: "🫁", label: "Ailments" },
                        { id: "children", icon: "👶", label: "Kids" },
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => setProfile(p.id as typeof profile)}
                          className={`py-1.5 rounded-lg text-center text-[10px] font-semibold transition-all cursor-pointer ${
                            profile === p.id 
                              ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/10" 
                              : "bg-slate-800/40 text-slate-400 hover:bg-slate-800/80 hover:text-slate-300"
                          }`}
                        >
                          <div className="text-base mb-0.5">{p.icon}</div>
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Advice details */}
                  <div className={`p-3.5 rounded-xl text-xs leading-relaxed font-medium ${
                    category === "severe" ? "bg-red-950/20 border border-red-800/30 text-rose-300" :
                    category === "very poor" ? "bg-orange-950/20 border border-orange-800/30 text-orange-300" :
                    category === "poor" ? "bg-yellow-950/20 border border-yellow-800/30 text-amber-200" :
                    "bg-emerald-950/20 border border-emerald-800/30 text-emerald-300"
                  }`}>
                    {advice}
                  </div>

                  <button
                    onClick={fetchNearestAQI}
                    className="w-full text-center text-[10px] text-slate-500 hover:text-slate-300 font-bold tracking-wider uppercase transition-colors"
                  >
                    🔄 Recalculate Nearest Node
                  </button>
                </div>
              )}

              {/* Public Heatmap Ward Rankings */}
              <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 space-y-3 shadow-xl">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">Ward-level AQI Heatmap</h3>
                  <p className="text-[9px] text-slate-500">Live ambient ratings across wards for {selectedCity}</p>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {wardList.length === 0 ? (
                    <p className="text-slate-500 text-xs text-center py-4">No ward readings loaded.</p>
                  ) : (
                    wardList
                      .slice()
                      .sort((a, b) => b.aqi - a.aqi)
                      .map((ward) => (
                        <div 
                          key={ward.ward_id} 
                          className="flex items-center justify-between p-2 bg-slate-950/30 border border-white/5 rounded-xl text-[11px]"
                        >
                          <span className="font-semibold text-slate-300">{ward.ward_name}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-indigo-500" 
                                style={{ width: `${Math.min(100, (ward.aqi / 400) * 100)}%` }}
                              />
                            </div>
                            <span className={`px-2 py-0.5 rounded-md font-black border text-[9px] ${getAQIBadgeColor(ward.aqi)}`}>
                              {ward.aqi} AQI
                            </span>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>

              {/* Public Reference Legend */}
              <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 space-y-3.5 shadow-xl text-[10px] text-slate-400">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">CPCB Breakpoints Standard</h3>
                  <p className="text-[9px] text-slate-500">Standardized classification limits under Air Act regulations</p>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-[9.5px]">
                  <div className="flex items-center gap-2 p-1.5 bg-emerald-950/20 border border-emerald-900/30 rounded-lg">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    <div className="flex-1">
                      <p className="text-emerald-400 font-bold">Good (0-50)</p>
                      <p className="text-[8px] text-slate-500">Minimal health impact</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 bg-lime-950/20 border border-lime-900/30 rounded-lg">
                    <span className="w-2.5 h-2.5 rounded-full bg-lime-500" />
                    <div className="flex-1">
                      <p className="text-lime-400 font-bold">Moderate (51-100)</p>
                      <p className="text-[8px] text-slate-500">Minor breathing discomfort</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 bg-amber-950/20 border border-amber-900/30 rounded-lg">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    <div className="flex-1">
                      <p className="text-amber-400 font-bold">Poor (101-200)</p>
                      <p className="text-[8px] text-slate-500">Respiratory issues on exposure</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 bg-orange-950/20 border border-orange-900/30 rounded-lg">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                    <div className="flex-1">
                      <p className="text-orange-400 font-bold">Very Poor (201-300)</p>
                      <p className="text-[8px] text-slate-500">Pulmonary/systemic illness</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-1.5 bg-rose-950/20 border border-rose-900/30 rounded-lg col-span-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <div className="flex-1">
                      <p className="text-rose-400 font-bold">Severe (&gt;300)</p>
                      <p className="text-[8px] text-slate-500">Healthy lungs affected, serious risk for vulnerable groups</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Advisory AI Chat */}
          {activeTab === "advisory" && (
            <div className="space-y-4">
              <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 space-y-4 shadow-xl">
                <div>
                  <h3 className="text-slate-100 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    Ask the Air Quality AI
                  </h3>
                  <p className="text-slate-400 text-[10px] mt-0.5">
                    Multilingual statute and health advisory RAG agent
                  </p>
                </div>

                {/* Quick questions list */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Is it safe to exercise outdoors?",
                    "Should schools close in high smog?",
                    "What mask protects against PM2.5?",
                    "বাইরে যাওয়া কি আজ নিরাপদ?",
                  ].map((q) => (
                    <button
                      key={q}
                      onClick={() => setQuestion(q)}
                      className="text-[9.5px] bg-slate-800/70 hover:bg-slate-700/80 text-slate-300 px-3 py-1.5 rounded-full border border-white/5 transition-colors cursor-pointer"
                    >
                      {q}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAsk()}
                    placeholder="Ask in Hindi, Bengali, English, or others…"
                    className="w-full bg-slate-950/60 border border-white/5 rounded-xl px-3.5 py-2.5 text-white text-xs placeholder-slate-600 focus:outline-none focus:border-indigo-500 pr-12"
                  />
                  <button
                    onClick={handleAsk}
                    disabled={advisoryLoading || !question.trim()}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-[10px] font-bold px-3 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {advisoryLoading ? "…" : "Ask"}
                  </button>
                </div>

                {advisoryResponse && (
                  <div className="bg-indigo-950/15 border border-indigo-900/30 rounded-xl p-4 text-slate-200 text-xs leading-relaxed space-y-2">
                    <div className="flex justify-between items-center border-b border-indigo-900/20 pb-1.5 mb-1.5">
                      <div className="text-indigo-400 font-bold uppercase tracking-wider text-[9px]">🤖 AETHER Advisory Response</div>
                      <button
                        type="button"
                        onClick={toggleSpeak}
                        className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[9px] text-gray-300 rounded font-bold transition-colors cursor-pointer select-none"
                      >
                        {speaking ? "⏹️ Stop Speech" : "🔊 Speak Response"}
                      </button>
                    </div>
                    <div className="whitespace-pre-line">{advisoryResponse}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Report Incident & Tracker */}
          {activeTab === "report" && (
            <div className="space-y-4">
              
              {/* Submission Form */}
              {reportSubmitted ? (
                <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-6 text-center space-y-4 shadow-xl">
                  <div className="text-3xl text-emerald-500">✓</div>
                  <div className="space-y-1">
                    <h3 className="text-slate-100 font-bold text-sm">Complaint Logged Successfully!</h3>
                    <p className="text-slate-400 text-xs">The incident has been registered and scheduled for inspector audit.</p>
                    <p className="text-slate-500 text-[10px] font-mono mt-1">ID Reference: {reportId}</p>
                  </div>
                  <button
                    onClick={() => { setReportSubmitted(false); setReportForm((prev) => ({ ...prev, description: "" })); setPhotoPreview(null); setGeoCaptured(false); }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-lg transition-colors"
                  >
                    Submit Another Report
                  </button>
                </div>
              ) : (
                <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 space-y-4 shadow-xl">
                  <div className="space-y-0.5">
                    <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider">Report Air Pollution</h3>
                    <p className="text-[10px] text-slate-500">Provide GPS stamps & photos for automatic enforcement queue dispatching.</p>
                  </div>

                  <form onSubmit={handleReportSubmit} className="space-y-3.5">
                    {/* Ward Dropdown Selector */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">City Ward</label>
                      <select
                        value={reportForm.ward_id}
                        onChange={(e) => setReportForm((p) => ({ ...p, ward_id: e.target.value }))}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none cursor-pointer"
                      >
                        {allWards.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Pollution Source Type Selector */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Violation Category</label>
                      <select
                        value={reportForm.type}
                        onChange={(e) => setReportForm((p) => ({ ...p, type: e.target.value }))}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none cursor-pointer"
                      >
                        <option value="industrial_smoke">Factory Smoke / Gas Leaks</option>
                        <option value="construction_dust">Uncovered Demolition Dust</option>
                        <option value="garbage_burning">Garbage & Plastics Burning</option>
                        <option value="vehicle_emissions">Heavy Truck/Diesel Exhaust</option>
                        <option value="other">Other Violation</option>
                      </select>
                    </div>

                    {/* Description Textarea */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Description & Details</label>
                      <textarea
                        value={reportForm.description}
                        onChange={(e) => setReportForm((p) => ({ ...p, description: e.target.value }))}
                        placeholder="Smell characteristics, exact locality indicators, duration..."
                        className="w-full bg-slate-950/60 border border-white/5 rounded-lg p-2.5 text-white text-xs placeholder-slate-700 focus:outline-none resize-none"
                        rows={3}
                      />
                    </div>

                    {/* Geolocation Stamp */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">GPS Incident Stamp</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleGeoStamp}
                          className="bg-slate-800/80 hover:bg-slate-700 border border-white/5 text-slate-200 text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer flex-1"
                        >
                          📍 Capture Current Location
                        </button>
                        <div className="flex-1 bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2 text-[10px] flex items-center justify-center font-mono text-slate-400">
                          {geoCaptured ? `${reportForm.lat}° N, ${reportForm.lon}° E` : "Stamping Pending"}
                        </div>
                      </div>
                    </div>

                    {/* Camera / Photo Uploader with Base64 Preview */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 block">Evidence Image</label>
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="block w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-white/5 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 file:cursor-pointer"
                        />
                        {photoPreview && (
                          <div className="relative w-full h-32 border border-white/5 rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={photoPreview} alt="Evidence Preview" className="max-h-full max-w-full object-contain" />
                            <button
                              type="button"
                              onClick={() => setPhotoPreview(null)}
                              className="absolute top-1 right-1 bg-rose-950 border border-rose-800 text-rose-400 rounded-full w-5 h-5 flex items-center justify-center font-bold text-xs cursor-pointer"
                            >
                              ✕
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Severity Selection */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1.5 block">Estimated Severity</label>
                      <div className="flex gap-2">
                        {["low", "medium", "high"].map((s) => (
                          <button
                            type="button"
                            key={s}
                            onClick={() => setReportForm((p) => ({ ...p, severity: s }))}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                              reportForm.severity === s
                                ? s === "high" 
                                  ? "bg-rose-600/35 text-rose-300 border border-rose-500/50" 
                                  : s === "medium" 
                                  ? "bg-amber-600/35 text-amber-300 border border-amber-500/50" 
                                  : "bg-blue-600/35 text-blue-300 border border-blue-500/50"
                                : "bg-slate-800/40 text-slate-400 hover:bg-slate-800/80 hover:text-slate-300"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={advisoryLoading || !reportForm.description.trim()}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20"
                    >
                      {advisoryLoading ? "Submitting..." : "Submit Incident Report"}
                    </button>
                  </form>
                </div>
              )}

              {/* Status Tracking List */}
              <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 space-y-3 shadow-xl">
                <div className="space-y-0.5">
                  <h3 className="font-bold text-xs text-slate-200 uppercase tracking-wider">Track My Reports</h3>
                  <p className="text-[9px] text-slate-500">Live database lookup for municipal resolving steps</p>
                </div>

                {trackingLoading ? (
                  <div className="text-center py-4 text-xs text-gray-500">Updating status feeds…</div>
                ) : trackedReports.length === 0 ? (
                  <div className="text-center py-4 text-xs text-slate-500 bg-slate-950/20 rounded-xl border border-dashed border-white/5">
                    No logged report history found on this device.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {trackedReports.map((report) => (
                      <div 
                        key={report.id} 
                        className="p-3 bg-slate-950/40 border border-white/5 rounded-xl space-y-2 hover:border-white/10 transition-colors"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-xs text-slate-200">
                              {report.report_type.replace("_", " ").toUpperCase()}
                            </p>
                            <p className="text-[8.5px] font-mono text-slate-500">ID: RPT-{report.id} | Ward: {report.ward_name}</p>
                          </div>
                          <span className={`text-[8.5px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            report.status === "resolved" 
                              ? "text-emerald-400 bg-emerald-950/20 border-emerald-900/40" 
                              : "text-amber-400 bg-amber-950/20 border-amber-900/40"
                          }`}>
                            {report.status}
                          </span>
                        </div>
                        
                        <p className="text-[9.5px] text-slate-400 leading-normal">{report.description}</p>
                        
                        {report.photo_url && (
                          <div className="w-16 h-16 rounded-lg border border-white/5 overflow-hidden bg-slate-950 flex items-center justify-center">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={report.photo_url} alt="Evidence" className="object-cover w-full h-full" />
                          </div>
                        )}

                        {/* Renders dynamic horizontal status nodes */}
                        {renderStatusStepper(report.status)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Tab 4: SMS Alert Preferences Subscriptions */}
          {activeTab === "alerts" && (
            <div className="space-y-4">
              
              {subSubmitted ? (
                <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-6 text-center space-y-4 shadow-xl">
                  <div className="text-3xl text-emerald-500">🔔</div>
                  <div className="space-y-1">
                    <h3 className="text-slate-100 font-bold text-sm">Alert Preferences Saved!</h3>
                    <p className="text-slate-400 text-xs">You will receive automated notification alerts when AQI limits cross your safety thresholds.</p>
                  </div>
                  <button
                    onClick={() => setSubSubmitted(false)}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-4 py-2 rounded-xl text-xs cursor-pointer shadow-lg transition-colors"
                  >
                    Edit Subscription
                  </button>
                </div>
              ) : (
                <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 space-y-4 shadow-xl">
                  <div className="space-y-0.5">
                    <h3 className="text-slate-200 font-bold text-xs uppercase tracking-wider">SMS Alert Subscriptions</h3>
                    <p className="text-[10px] text-slate-500">Subscribe to hyperlocal ward-level air alerts in your language.</p>
                  </div>

                  <form onSubmit={handleSubscribeSubmit} className="space-y-4">
                    {/* Contact Channels */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Phone Number</label>
                        <input
                          type="tel"
                          value={subPhone}
                          onChange={(e) => setSubPhone(e.target.value)}
                          placeholder="+91 9876543210"
                          className="w-full bg-slate-950/60 border border-white/5 rounded-lg px-2.5 py-2 text-white text-xs placeholder-slate-700 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Email Address</label>
                        <input
                          type="email"
                          value={subEmail}
                          onChange={(e) => setSubEmail(e.target.value)}
                          placeholder="citizen@domain.in"
                          className="w-full bg-slate-950/60 border border-white/5 rounded-lg px-2.5 py-2 text-white text-xs placeholder-slate-700 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Ward Selector */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Alert Target Ward</label>
                      <select
                        value={subWardId}
                        onChange={(e) => setSubWardId(e.target.value)}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none cursor-pointer"
                      >
                        {allWards.map((w) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Alert Threshold Selector */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Notification Threshold</label>
                      <select
                        value={subLevel}
                        onChange={(e) => setSubLevel(e.target.value)}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none cursor-pointer"
                      >
                        <option value="moderate">Moderate (&gt;50 AQI)</option>
                        <option value="poor">Poor (&gt;100 AQI)</option>
                        <option value="very_poor">Very Poor (&gt;200 AQI)</option>
                        <option value="severe">Severe (&gt;300 AQI)</option>
                      </select>
                    </div>

                    {/* Alert Language Selection */}
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1 block">Alert Delivery Language</label>
                      <select
                        value={subLanguage}
                        onChange={(e) => setSubLanguage(e.target.value)}
                        className="w-full bg-slate-950/60 border border-white/5 rounded-lg px-3 py-2 text-slate-200 text-xs focus:outline-none cursor-pointer"
                      >
                        {LANGUAGES.map((l) => (
                          <option key={l.code} value={l.code}>{l.native} ({l.label})</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={advisoryLoading || (!subPhone.trim() && !subEmail.trim())}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-xs transition-all cursor-pointer shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20"
                    >
                      {advisoryLoading ? "Saving..." : "Save Alert Settings"}
                    </button>
                  </form>
                </div>
              )}

              {/* Simulated alerts history list */}
              <div className="glass-card bg-slate-900/40 border border-white/5 rounded-2xl p-4.5 space-y-3 shadow-xl">
                <div className="text-xs text-slate-300 font-bold uppercase tracking-wider">Broadcast Dispatch Logs</div>
                {[
                  { time: "2 hours ago", message: "AQI crossed 200 (Very Poor) in Sector V ward. Children & senior citizens advised to remain indoors.", type: "warning" },
                  { time: "Yesterday", message: "Dispersal model shows PM2.5 returning to Satisfactory bounds (AQI 98). Regular outdoors activities can resume.", type: "info" },
                  { time: "3 days ago", message: "CRITICAL: AQI 324 registered in Salt Lake Ward. High industrial soot. Emergency work halts issued.", type: "emergency" },
                ].map((alert, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border text-[10px] leading-relaxed ${
                      alert.type === "emergency" ? "bg-red-950/15 border-red-900/30 text-rose-300" :
                      alert.type === "warning" ? "bg-orange-950/15 border-orange-900/30 text-orange-300" :
                      "bg-slate-950/30 border-white/5 text-slate-300"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span>{alert.type === "emergency" ? "🚨" : alert.type === "warning" ? "⚠️" : "ℹ️"}</span>
                      <div>
                        <p className="font-semibold text-slate-200">{alert.message}</p>
                        <p className="text-slate-500 text-[9px] mt-1 font-mono">{alert.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-[10px] text-slate-600 pt-3 pb-6 uppercase font-bold tracking-wider">
            AETHER Saathi Portal · 12 Indian Languages · Ward Tracking
          </div>
        </div>
      </div>
    </AppShell>
  );
}
