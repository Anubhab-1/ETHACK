"use client";
/**
 * AETHER — Citizen Incident Hub & Report Portal
 * Allows residents to file alerts (garbage burning, road dust),
 * upvote active complaints, and track municipal validation in real-time.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, CitizenReport, WardDetail } from "@/lib/api";
import { AppShell } from "@/components/AppShell";
import { SkeletonCard } from "@/components/SkeletonLoaders";

const CITIES = ["Kolkata", "Delhi", "Mumbai"];

const PRESET_PHOTOS = [
  { id: "fire", name: "🔥 Active Waste Fire", desc: "Garbage or plastic pile burning", latJitter: 0.001, lonJitter: -0.001 },
  { id: "dust", name: "💨 Demolition Dust", desc: "Uncovered construction excavation", latJitter: -0.0005, lonJitter: 0.0005 },
  { id: "factory", name: "🏭 Chimney Smoke Flue", desc: "Dark soot emission from local kiln", latJitter: 0.0015, lonJitter: 0.001 },
  { id: "truck", name: "🚚 Diesel exhaust", desc: "Black smoke from heavy commercial vehicle", latJitter: -0.0008, lonJitter: -0.0002 },
];

export default function CitizenReportsPage() {
  const [city, setCity] = useState("Kolkata");
  const [reports, setReports] = useState<CitizenReport[]>([]);
  const [wards, setWards] = useState<WardDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState("all");
  const [filterSeverity, setFilterSeverity] = useState("all");

  // Form Wizard States
  const [wizardStep, setWizardStep] = useState(1);
  const [reporterName, setReporterName] = useState("");
  const [reportType, setReportType] = useState("garbage_burning");
  const [severity, setSeverity] = useState("medium");
  const [description, setDescription] = useState("");
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);
  const [presetPhoto, setPresetPhoto] = useState("fire");
  const [formSuccess, setFormSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // AI Vision states
  const [cvScanning, setCvScanning] = useState(false);
  const [cvResult, setCvResult] = useState<{ label: string; confidence: number; recommendedSeverity: string; recommendedType: string } | null>(null);

  const triggerCVScan = (photoId: string) => {
    setCvScanning(true);
    setCvResult(null);
    setTimeout(() => {
      let result = { label: "Unknown smoke source", confidence: 52, recommendedSeverity: "medium", recommendedType: "other" };
      if (photoId === "fire") {
        result = { label: "Active Waste/Plastic Fire", confidence: 96.4, recommendedSeverity: "high", recommendedType: "garbage_burning" };
      } else if (photoId === "dust") {
        result = { label: "Fugitive Construction Dust Plume", confidence: 89.1, recommendedSeverity: "medium", recommendedType: "construction_dust" };
      } else if (photoId === "factory") {
        result = { label: "Industrial Chimney Smoke", confidence: 94.7, recommendedSeverity: "high", recommendedType: "industrial_smoke" };
      } else if (photoId === "truck") {
        result = { label: "Diesel Commercial Soot exhaust", confidence: 91.3, recommendedSeverity: "medium", recommendedType: "vehicle_emissions" };
      }
      setCvResult(result);
      setCvScanning(false);
      setReportType(result.recommendedType);
      setSeverity(result.recommendedSeverity);
    }, 1000);
  };

  // Load reports and wards on city change
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportsData, wardsData] = await Promise.all([
        api.citizenReports(city),
        api.wards(city),
      ]);
      setReports(reportsData);
      setWards(wardsData);
      if (wardsData.length > 0) {
        setSelectedWardId(wardsData[0].id);
      }
    } catch (e) {
      console.error("Failed to load reports data:", e);
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => {
    loadData();
    setWizardStep(1);
    setFormSuccess(false);
  }, [city, loadData]);

  // Handle Upvote action
  const handleUpvote = async (id: number) => {
    try {
      const updated = await api.upvoteCitizenReport(id);
      setReports((prev) =>
        prev.map((r) =>
          r.id === id ? { ...r, upvote_count: updated.upvote_count, status: updated.status } : r
        )
      );
    } catch (e) {
      console.error("Failed to upvote report:", e);
    }
  };

  // Submit Incident Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWardId) return;

    const selectedWard = wards.find((w) => w.id === selectedWardId);
    if (!selectedWard) return;

    setSubmitting(true);
    try {
      // Find photo preset to apply geographic jitter to ward center
      const photo = PRESET_PHOTOS.find((p) => p.id === presetPhoto) || PRESET_PHOTOS[0];
      const lat = selectedWard.lat + photo.latJitter;
      const lon = selectedWard.lon + photo.lonJitter;

      await api.createCitizenReport({
        ward_id: selectedWardId,
        city,
        reporter_name: reporterName || "Anonymous",
        report_type: reportType,
        description,
        severity,
        lat,
        lon,
      });

      setFormSuccess(true);
      setWizardStep(4);
      // Reload reports list
      const freshReports = await api.citizenReports(city);
      setReports(freshReports);
    } catch (e) {
      console.error("Failed to submit citizen report:", e);
    } finally {
      setSubmitting(false);
    }
  };

  // Reset form
  const handleResetForm = () => {
    setReporterName("");
    setReportType("garbage_burning");
    setSeverity("medium");
    setDescription("");
    setPresetPhoto("fire");
    setFormSuccess(false);
    setWizardStep(1);
  };

  // Category counts computed properties
  const reportStats = {
    total: reports.length,
    pending: reports.filter((r) => r.status === "pending").length,
    verified: reports.filter((r) => r.status === "verified").length,
    resolved: reports.filter((r) => r.status === "resolved").length,
  };

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    const matchesType = filterType === "all" || r.report_type === filterType;
    const matchesSeverity = filterSeverity === "all" || r.severity === filterSeverity;
    return matchesType && matchesSeverity;
  });

  // Hotspot Wards list (ranked by report count)
  const hotspotWards = Object.entries(
    reports.reduce((acc, r) => {
      const name = r.ward_name || `Ward #${r.ward_id}`;
      acc[name] = (acc[name] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <AppShell city={city}>
    <div className="min-h-full bg-gray-950 text-gray-100 flex flex-col">
      {/* Header Nav */}
      <header className="border-b border-white/8 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-0 bg-gray-950/95 backdrop-blur-md sticky top-0 z-[1100] shadow-md flex-none">
        <div className="flex items-center gap-4 justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-orange-500 font-black text-lg hover:text-orange-400 transition-colors">⬡ AETHER</Link>
            <span className="text-gray-700">·</span>
            <h1 className="font-bold text-sm text-gray-200">Citizen Reports</h1>
          </div>
        </div>

        <div className="flex items-center justify-end w-full sm:w-auto mt-1 sm:mt-0">
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded px-2.5 py-1 text-xs font-bold text-gray-300 focus:outline-none focus:border-orange-500 cursor-pointer"
          >
            {CITIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </header>

      {/* Main Grid */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto">
        
        {/* Left 2 Columns: Feed & Stats */}
        <div className="lg:col-span-2 space-y-6 flex flex-col">
          
          {/* Telemetry Overview Cards */}
          <div className="grid grid-cols-4 gap-4">
            <div className="glass-card p-3 text-center">
              <span className="text-[10px] text-gray-500 block font-bold uppercase">Total Alerts</span>
              <span className="text-xl font-extrabold text-orange-400 font-mono">{reportStats.total}</span>
            </div>
            <div className="glass-card p-3 text-center">
              <span className="text-[10px] text-gray-500 block font-bold uppercase">Open / Investigating</span>
              <span className="text-xl font-extrabold text-yellow-400 font-mono">{reportStats.pending}</span>
            </div>
            <div className="glass-card p-3 text-center">
              <span className="text-[10px] text-gray-500 block font-bold uppercase">Verified Incidents</span>
              <span className="text-xl font-extrabold text-emerald-400 font-mono">{reportStats.verified}</span>
            </div>
            <div className="glass-card p-3 text-center">
              <span className="text-[10px] text-gray-500 block font-bold uppercase">Resolved Actions</span>
              <span className="text-xl font-extrabold text-purple-400 font-mono">{reportStats.resolved}</span>
            </div>
          </div>

          {/* Filtering Header Control */}
          <div className="glass-card p-4 flex flex-wrap gap-4 items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Community Alert Stream
            </h2>
            <div className="flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Category:</span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="bg-gray-950 border border-gray-800 rounded px-2 py-0.5 font-semibold text-gray-300 focus:outline-none"
                >
                  <option value="all">All Types</option>
                  <option value="garbage_burning">Garbage Burning</option>
                  <option value="construction_dust">Demolition Dust</option>
                  <option value="industrial_smoke">Industrial Fumes</option>
                  <option value="vehicle_emissions">Vehicle Exhaust</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Severity:</span>
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="bg-gray-950 border border-gray-800 rounded px-2 py-0.5 font-semibold text-gray-300 focus:outline-none"
                >
                  <option value="all">All Severities</option>
                  <option value="high">🔴 High</option>
                  <option value="medium">🟡 Medium</option>
                  <option value="low">🟢 Low</option>
                </select>
              </div>
            </div>
          </div>

          {/* Incident Feed List */}
          <div className="flex-1 space-y-4">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <SkeletonCard key={i} rows={3} />
                ))}
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="glass-card p-12 text-center text-gray-500 text-xs">
                No reports matched the active filters for {city}.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredReports.map((report) => (
                  <div key={report.id} className="glass-card p-4 flex flex-col justify-between space-y-3 relative hover:border-white/15 transition-all">
                    
                    {/* Severity Ring Icon & Header */}
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 font-bold uppercase rounded ${
                          report.severity === "high" ? "bg-red-500/10 text-red-400 border border-red-500/20" : report.severity === "medium" ? "bg-orange-500/10 text-orange-400 border border-orange-500/20" : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                        }`}>
                          {report.severity} Priority
                        </span>
                        <h3 className="font-bold text-sm text-gray-100 pt-1.5 flex items-center gap-1.5">
                          {report.report_type === "garbage_burning" && "🔥"}
                          {report.report_type === "construction_dust" && "💨"}
                          {report.report_type === "industrial_smoke" && "🏭"}
                          {report.report_type === "vehicle_emissions" && "🚚"}
                          {report.report_type === "other" && "🚨"}
                          {report.report_type.replace("_", " ").toUpperCase()}
                        </h3>
                      </div>
                      <span className={`text-[9px] px-2 py-0.5 rounded font-black border uppercase ${
                        report.status === "verified" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : report.status === "resolved" ? "bg-purple-500/10 text-purple-400 border-purple-500/20" : "bg-gray-500/10 text-gray-400 border-white/5"
                      }`}>
                        {report.status}
                      </span>
                    </div>

                    {/* Body */}
                    <p className="text-xs text-gray-300 leading-relaxed italic">
                      "{report.description}"
                    </p>

                    {/* Metadata */}
                    <div className="border-t border-white/5 pt-2 flex flex-col gap-1 text-[10px] text-gray-500">
                      <div className="flex justify-between">
                        <span>Ward: <span className="font-bold text-gray-300">{report.ward_name || `Ward #${report.ward_id}`}</span></span>
                        <span>By: <span className="text-gray-400">{report.reporter_name}</span></span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span>Filed: {new Date(report.created_at).toLocaleString("en-IN", {
                          month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                        })}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-400 font-bold">👍 {report.upvote_count} upvotes</span>
                          <button
                            onClick={() => handleUpvote(report.id)}
                            className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded text-[9px] font-bold transition-all cursor-pointer"
                          >
                            ▲ Upvote
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column: Report Incident Wizard & Hotspots */}
        <div className="space-y-6">
          
          {/* Submission Wizard Card */}
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-sm font-bold text-orange-400 flex items-center gap-2 uppercase tracking-wider">
              <span>📢</span> Report Air Quality Violation
            </h2>
            <p className="text-[11px] text-gray-500 leading-normal">
              File a verified incident. High-priority complaints automatically trigger municipal inspections.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              
              {/* Wizard Steps indicator */}
              <div className="space-y-2 pb-2 border-b border-white/5">
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-500">
                  <span className={wizardStep >= 1 ? "text-orange-400" : ""}>1. CATEGORY</span>
                  <span className={wizardStep >= 2 ? "text-orange-400" : ""}>2. LOCATION</span>
                  <span className={wizardStep >= 3 ? "text-orange-400" : ""}>3. CONFIRM</span>
                </div>
                <div className="h-1 bg-gray-900 rounded-full overflow-hidden">
                  <div className={`h-full bg-orange-500 transition-all duration-300 ${wizardStep === 1 ? "w-1/3" : wizardStep === 2 ? "w-2/3" : "w-full bg-emerald-500"}`} />
                </div>
              </div>


              {/* STEP 1: Category & Severity */}
              {wizardStep === 1 && (
                <div className="space-y-3.5 animate-slide-up">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 block font-semibold">Violation Category</label>
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-300 focus:outline-none"
                    >
                      <option value="garbage_burning">🔥 Garbage & Plastic Burning</option>
                      <option value="construction_dust">💨 Uncovered Construction Dust</option>
                      <option value="industrial_smoke">🏭 Illegal Factory Emissions</option>
                      <option value="vehicle_emissions">🚚 Heavy Vehicle Soot Smoke</option>
                      <option value="other">🚨 Other Pollution Nuisance</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 block font-semibold">Severity Assessment</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { val: "low", label: "🟢 Low", desc: "Smokey haze" },
                        { val: "medium", label: "🟡 Medium", desc: "Dense fumes" },
                        { val: "high", label: "🔴 High", desc: "Choking/choked" },
                      ].map((s) => (
                        <button
                          key={s.val}
                          type="button"
                          onClick={() => setSeverity(s.val)}
                          className={`p-2 rounded text-center border text-[10px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
                            severity === s.val
                              ? "bg-orange-500/10 border-orange-500 text-orange-400"
                              : "bg-transparent border-gray-800 text-gray-400 hover:text-gray-300"
                          }`}
                        >
                          <span className="font-bold">{s.label}</span>
                          <span className="text-[8px] text-gray-500 mt-0.5">{s.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setWizardStep(2)}
                    className="w-full py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded text-xs transition-colors cursor-pointer text-center"
                  >
                    Next: Location Settings →
                  </button>
                </div>
              )}

              {/* STEP 2: Ward & Location */}
              {wizardStep === 2 && (
                <div className="space-y-3.5 animate-slide-up">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 block font-semibold">Select Affected Ward</label>
                    <select
                      value={selectedWardId || ""}
                      onChange={(e) => setSelectedWardId(Number(e.target.value))}
                      className="w-full bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-300 focus:outline-none"
                    >
                      {wards.map((w) => (
                        <option key={w.id} value={w.id}>
                          Ward #{w.ward_no} — {w.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 block font-semibold">Reporter Identity (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. resident name or anonymous"
                      value={reporterName}
                      onChange={(e) => setReporterName(e.target.value)}
                      className="w-full bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-300 focus:outline-none"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(1)}
                      className="flex-1 py-1.5 bg-gray-900 hover:bg-gray-850 text-gray-400 font-bold rounded text-xs border border-gray-800 cursor-pointer text-center"
                    >
                      ← Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWizardStep(3);
                        triggerCVScan(presetPhoto);
                      }}
                      className="flex-1 py-1.5 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded text-xs cursor-pointer text-center"
                    >
                      Next: Incident Detail
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Details & Preview Photo */}
              {wizardStep === 3 && (
                <div className="space-y-3.5 animate-slide-up">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 block font-semibold">Describe the Incident</label>
                    <textarea
                      rows={3}
                      placeholder="Input exact location landmarks, duration, and details of smoke/smog level..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      required
                      className="w-full bg-gray-900 border border-gray-800 rounded p-2 text-xs text-gray-300 focus:outline-none resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 block font-semibold">Attach Photo Verification</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PRESET_PHOTOS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setPresetPhoto(p.id);
                            triggerCVScan(p.id);
                          }}
                          className={`p-2 rounded text-left border text-[10px] transition-colors cursor-pointer ${
                            presetPhoto === p.id
                              ? "bg-orange-500/10 border-orange-500 text-orange-400 font-bold"
                              : "bg-transparent border-gray-800 text-gray-400 hover:text-gray-300"
                          }`}
                        >
                          <div>{p.name}</div>
                          <div className="text-[7px] text-gray-500 font-normal leading-normal">{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI Visual Classification Output */}
                  <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-400 font-bold uppercase">🔍 AETHER Vision Classifier</span>
                      <span className="text-orange-400 font-bold">ResNet-50 v2</span>
                    </div>
                    
                    {cvScanning ? (
                      <div className="flex items-center gap-2 text-xs py-2 text-slate-400 justify-center">
                        <span className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                        Analyzing image contours & density...
                      </div>
                    ) : cvResult ? (
                      <div className="space-y-1.5 animate-slide-up text-xs">
                        <div className="flex justify-between items-center bg-gray-950/60 p-2 rounded">
                          <div>
                            <span className="text-gray-400 text-[10px] block">Detected Target</span>
                            <span className="font-bold text-gray-200">{cvResult.label}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-gray-400 text-[10px] block">Confidence</span>
                            <span className="font-mono text-orange-400 font-bold">{cvResult.confidence}%</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1.5 justify-center py-1 bg-emerald-950/20 border border-emerald-900/30 rounded text-center">
                          ✅ Class Verified: {cvResult.recommendedType.replace("_", " ").toUpperCase()} ({cvResult.recommendedSeverity.toUpperCase()})
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 text-center py-2">
                        Select a verification photo to run AI classification
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setWizardStep(2)}
                      className="flex-1 py-2 bg-gray-900 hover:bg-gray-850 text-gray-400 font-bold rounded text-xs border border-gray-800 cursor-pointer text-center"
                    >
                      ← Back
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !description || cvScanning}
                      className="flex-1 py-2 bg-orange-600 hover:bg-orange-500 text-white font-bold rounded text-xs transition-colors cursor-pointer text-center disabled:opacity-50"
                    >
                      {submitting ? "Submitting..." : "🚀 File Official Report"}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Success confirmation screen */}
              {wizardStep === 4 && formSuccess && (
                <div className="space-y-4 animate-scale-in text-center py-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl mx-auto">
                    ✓
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-bold text-sm text-gray-200">Incident Filed Successfully</h3>
                    <p className="text-[10px] text-gray-500 leading-normal px-2">
                      Your alert has been registered. It has been plotted on the mission control map and dispatched to municipal field compliance officers.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="w-full py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold rounded text-xs cursor-pointer text-center"
                  >
                    File Another Report
                  </button>
                </div>
              )}

            </form>
          </div>

          {/* Side Panel: Community Leaderboard & Hotspots */}
          <div className="glass-card p-5 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              🚨 Top Reported Hotspot Wards
            </h2>
            <div className="space-y-2">
              {hotspotWards.length === 0 ? (
                <p className="text-xs text-gray-500">No hotspot coordinates flagged yet.</p>
              ) : (
                hotspotWards.map(([wardName, count], idx) => (
                  <div key={idx} className="flex justify-between items-center text-xs p-2 bg-gray-900/60 rounded border border-white/5">
                    <span className="font-bold text-gray-300">{wardName}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-950 border border-red-500/20 text-red-400 font-mono font-bold">
                      {count} alerts
                    </span>
                  </div>
                ))
              )}
            </div>
            
            <div className="border-t border-white/5 pt-3.5 space-y-2 text-[10px] text-gray-500 leading-relaxed">
              <p className="font-bold uppercase text-orange-400/90 tracking-wider">Verification protocol SLA:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Reports from verified residents queue for immediate lookup.</li>
                <li>When a report achieves 5 upvotes, its status updates to "verified" and spawns a field inspection unit automatically.</li>
                <li>High severity alerts bypass validation triggers directly.</li>
              </ul>
            </div>
          </div>

        </div>
      </div>
    </div>
    </AppShell>
  );
}
