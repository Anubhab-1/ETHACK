"use client";
/**
 * AETHER — Field Officer Mobile Interface
 * Role: Environmental Inspector / Field Officer
 *
 * Mobile-first PWA with:
 * - GPS-based task list prioritized by AQI risk + distance
 * - Evidence capture UI (photo metadata, GPS stamp, voice note placeholder)
 * - Show-cause notice generation
 * - Inspection route optimization (OR-Tools result)
 * - Offline-ready architecture display
 */
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import Link from "next/link";

interface InspectionTask {
  id: string;
  ward_name: string;
  ward_id: number;
  industry_type: string;
  priority_score: number;
  distance_km: number;
  estimated_time_min: number;
  violation_type: string;
  permit_status: "valid" | "expired" | "expiring_soon";
  aqi: number;
  status: "pending" | "in_progress" | "completed" | "escalated";
}

// Simulate a realistic inspection task list from enforcement queue
const MOCK_TASKS: InspectionTask[] = [
  { id: "INSP-001", ward_name: "Metiabruz", ward_id: 12, industry_type: "Foundry", priority_score: 0.95, distance_km: 1.2, estimated_time_min: 25, violation_type: "excess_pm_emissions", permit_status: "expired", aqi: 312, status: "pending" },
  { id: "INSP-002", ward_name: "Garden Reach", ward_id: 15, industry_type: "Chemical Plant", priority_score: 0.88, distance_km: 2.8, estimated_time_min: 40, violation_type: "cpcb_norm_violation", permit_status: "valid", aqi: 278, status: "pending" },
  { id: "INSP-003", ward_name: "Topsia", ward_id: 22, industry_type: "Brick Kiln", priority_score: 0.76, distance_km: 4.1, estimated_time_min: 55, violation_type: "open_burning", permit_status: "expiring_soon", aqi: 245, status: "pending" },
  { id: "INSP-004", ward_name: "Belgachia", ward_id: 8, industry_type: "Textile Mill", priority_score: 0.65, distance_km: 5.7, estimated_time_min: 70, violation_type: "excess_pm_emissions", permit_status: "valid", aqi: 198, status: "pending" },
  { id: "INSP-005", ward_name: "Shyambazar", ward_id: 4, industry_type: "Power Plant", priority_score: 0.55, distance_km: 7.2, estimated_time_min: 85, violation_type: "cpcb_norm_violation", permit_status: "valid", aqi: 187, status: "completed" },
];

const ROUTE = [
  { step: 1, ward: "Base Station", action: "Depart 09:00", icon: "🏢" },
  { step: 2, ward: "Metiabruz", action: "Foundry inspection (25 min)", icon: "🏭" },
  { step: 3, ward: "Garden Reach", action: "Chemical plant audit (40 min)", icon: "⚗️" },
  { step: 4, ward: "Topsia", action: "Brick kiln notice (55 min)", icon: "🧱" },
  { step: 5, ward: "Belgachia", action: "Textile mill check (70 min)", icon: "🏗️" },
  { step: 6, ward: "Base Station", action: "Return 15:30 — est. 6.5h", icon: "🏢" },
];

function PriorityBadge({ score }: { score: number }) {
  const level = score > 0.8 ? "CRITICAL" : score > 0.6 ? "HIGH" : "MEDIUM";
  const color = score > 0.8
    ? "bg-red-500/20 text-red-300 border-red-500/40"
    : score > 0.6 ? "bg-orange-500/20 text-orange-300 border-orange-500/40"
    : "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${color}`}>{level}</span>
  );
}

function PermitBadge({ status }: { status: InspectionTask["permit_status"] }) {
  return status === "expired"
    ? <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">⚠️ EXPIRED</span>
    : status === "expiring_soon"
    ? <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">⏰ Expiring</span>
    : <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">✅ Valid</span>;
}

export default function FieldOfficerPage() {
  const [tasks, setTasks] = useState<InspectionTask[]>(MOCK_TASKS);
  const [activeTask, setActiveTask] = useState<InspectionTask | null>(null);
  const [activeTab, setActiveTab] = useState<"tasks" | "route" | "evidence" | "notices">("tasks");
  const [noticeTarget, setNoticeTarget] = useState<InspectionTask | null>(null);
  const [noticeText, setNoticeText] = useState("");
  const [generatingNotice, setGeneratingNotice] = useState(false);
  const [evidenceCapture, setEvidenceCapture] = useState({ notes: "", severity: "high", gps_stamp: "", timestamp: "" });
  const [captureActive, setCaptureActive] = useState(false);

  useEffect(() => {
    // Simulate GPS stamp
    setEvidenceCapture(prev => ({
      ...prev,
      gps_stamp: "22.5428°N 88.3273°E",
      timestamp: new Date().toLocaleString("en-IN"),
    }));
  }, []);

  const markInProgress = (task: InspectionTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: "in_progress" } : t));
    setActiveTask(task);
  };

  const markComplete = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "completed" } : t));
    setActiveTask(null);
  };

  const escalate = (taskId: string) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: "escalated" } : t));
  };

  const downloadPDF = (task: InspectionTask) => {
    import("jspdf").then((module) => {
      const jsPDF = module.default;
      const doc = new jsPDF();

      // Header Bar Background
      doc.setFillColor(3, 7, 18);
      doc.rect(0, 0, 210, 35, "F");

      // Header Text
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("KOLKATA MUNICIPAL CORPORATION", 15, 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(249, 115, 22);
      doc.text("EMERGENCY ENVIRONMENTAL INSPECTION & ENFORCEMENT DISPATCH", 15, 21);
      
      doc.setDrawColor(249, 115, 22);
      doc.setLineWidth(0.8);
      doc.line(15, 28, 195, 28);

      // Section: Case Info
      doc.setTextColor(20, 20, 20);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("OFFICIAL ENFORCEMENT DISPATCH ORDER", 15, 45);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      const startY = 53;
      const rowHeight = 7.5;
      
      const fields = [
        ["Dispatch Reference:", `AETHER-DISPATCH-${task.id}-${Date.now().toString().slice(-5)}`],
        ["Assignee Inspector:", "Lead Environmental Officer, Team 4A"],
        ["Target Area:", `${task.ward_name} (Ward #${task.ward_id})`],
        ["Establishment Type:", task.industry_type],
        ["Reported Violation:", task.violation_type.replace(/_/g, " ").toUpperCase()],
        ["Risk Assessment Priority:", task.priority_score > 0.8 ? "CRITICAL (Level P1)" : "HIGH (Level P2)"],
        ["Current Ward AQI Level:", `${task.aqi} (PM2.5 Dominant)`],
        ["Unit Permit Status:", task.permit_status.toUpperCase()],
        ["Est. Travel Distance:", `${task.distance_km} km away (~${task.estimated_time_min} mins)`]
      ];

      fields.forEach((field, index) => {
        const y = startY + index * rowHeight;
        doc.setFont("helvetica", "bold");
        doc.text(field[0], 15, y);
        doc.setFont("helvetica", "normal");
        doc.text(field[1], 65, y);
      });

      // Section: Mandated Actions
      const nextSectionY = startY + fields.length * rowHeight + 10;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("MUNICIPAL INJUNCTION PROTOCOL", 15, nextSectionY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      const protocols = [
        "1. Issue Immediate Stop-Work Order to establishment under Air Act 1981 Section 31A.",
        "2. Record GPS-stamped visual evidence of emissions, dust leakage, or open burning.",
        "3. Verify active emission scrubbers (CEMS units) and permit validation codes.",
        "4. Enforce mandatory water-sprinkling and construction net enclosures (if dust violation).",
        "5. Issue warning card and SCN (Show Cause Notice) with a 7-day compliance window."
      ];

      protocols.forEach((proto, index) => {
        doc.text(proto, 15, nextSectionY + 8 + index * 7);
      });

      // Footer
      const footerY = 270;
      doc.setDrawColor(200, 200, 200);
      doc.line(15, footerY - 5, 195, footerY - 5);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.text("Prepared by AETHER Automated Municipal Dispatch Engine. Authorized for immediate field enforcement.", 15, footerY);
      
      // Save PDF
      doc.save(`AETHER_Dispatch_${task.id}.pdf`);
    }).catch(err => {
      console.error("Failed to load jsPDF:", err);
      alert("Error generating dispatch PDF. Please check console logs.");
    });
  };

  const generateNotice = async (task: InspectionTask) => {
    setNoticeTarget(task);
    setGeneratingNotice(true);
    setActiveTab("notices");
    try {
      const result = await api.invokeAgentTool("generate_show_cause_notice", task.ward_id, {
        industry_id: task.id,
        violation_type: task.violation_type,
      }) as { notice_text?: string };
      setNoticeText(result.notice_text || "Notice generation failed — API response malformed.");
    } catch (e) {
      setNoticeText(
        `SHOW-CAUSE NOTICE\n\nTo: ${task.industry_type} Unit at ${task.ward_name}\n\nYou are hereby directed to show cause within 7 days why action under Section 31A of the Air (Prevention and Control of Pollution) Act, 1981 should not be initiated against your establishment.\n\nViolation: ${task.violation_type.replace(/_/g, " ").toUpperCase()}\nCase Reference: AETHER-SCN-${Date.now()}\n\n[Generated by AETHER Field Officer Portal]`
      );
    } finally {
      setGeneratingNotice(false);
    }
  };

  const pendingCount = tasks.filter(t => t.status === "pending").length;
  const completedCount = tasks.filter(t => t.status === "completed").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/20 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/" className="text-slate-400 hover:text-white text-xs">← AETHER</Link>
              <span className="text-xs text-emerald-400 font-semibold bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-800/40">Field Officer</span>
            </div>
            <h1 className="text-xl font-black">Inspection Tasklist</h1>
            <p className="text-slate-400 text-xs">OR-Tools Optimized Route · Evidence Capture · Legal Notice Generator</p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-black text-orange-400">{pendingCount}</div>
            <div className="text-xs text-slate-500">pending tasks</div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 flex items-center gap-4">
          <div className="flex-1">
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>Today's Progress</span>
              <span>{completedCount}/{tasks.length} complete</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${(completedCount / tasks.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="text-emerald-400 font-bold text-sm">{Math.round((completedCount / tasks.length) * 100)}%</div>
        </div>

        {/* Offline indicator */}
        <div className="flex items-center gap-2 bg-blue-950/30 border border-blue-800/30 rounded-lg px-3 py-2 text-xs text-blue-300">
          <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          PWA Mode: Task list cached offline · GPS active · Evidence syncs when connected
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 text-xs">
          {[
            { id: "tasks", label: "📋 Tasks" },
            { id: "route", label: "🗺️ Route" },
            { id: "evidence", label: "📸 Evidence" },
            { id: "notices", label: "📜 Notices" },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2.5 font-medium transition-colors ${
                activeTab === tab.id ? "text-indigo-400 border-b-2 border-indigo-500" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tasks Tab */}
        {activeTab === "tasks" && (
          <div className="space-y-3">
            {tasks.map((task, i) => (
              <div
                key={task.id}
                className={`border rounded-xl p-4 transition-all ${
                  task.status === "completed" ? "border-emerald-800/30 bg-emerald-950/10 opacity-60" :
                  task.status === "escalated" ? "border-red-800/40 bg-red-950/10" :
                  task.status === "in_progress" ? "border-indigo-600/60 bg-indigo-950/20 ring-1 ring-indigo-500/30" :
                  "border-slate-700/40 bg-slate-800/30 hover:border-slate-600/60"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-slate-500 font-mono">{task.id}</span>
                      <PriorityBadge score={task.priority_score} />
                      <PermitBadge status={task.permit_status} />
                      {task.status === "completed" && <span className="text-xs text-emerald-400">✅ Completed</span>}
                      {task.status === "escalated" && <span className="text-xs text-red-400">🚨 Escalated</span>}
                      {task.status === "in_progress" && <span className="text-xs text-indigo-400 animate-pulse">⚡ In Progress</span>}
                    </div>
                    <div className="text-white font-semibold mt-1">{task.ward_name}</div>
                    <div className="text-slate-400 text-xs">{task.industry_type} · {task.violation_type.replace(/_/g, " ")}</div>
                    <div className="flex gap-3 mt-2 text-xs text-slate-500">
                      <span>📍 {task.distance_km} km away</span>
                      <span>⏱ ~{task.estimated_time_min} min</span>
                      <span>💨 AQI {task.aqi}</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-black text-slate-300">{task.priority_score.toFixed(2)}</div>
                    <div className="text-xs text-slate-500">priority</div>
                  </div>
                </div>

                {/* Action buttons */}
                {task.status === "pending" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => markInProgress(task)}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1.5 rounded-lg font-medium transition-colors"
                    >
                      Start Inspection
                    </button>
                    <button
                      onClick={() => generateNotice(task)}
                      className="flex-1 bg-orange-600/60 hover:bg-orange-600 text-white text-xs py-1.5 rounded-lg font-medium transition-colors"
                    >
                      Pre-Generate Notice
                    </button>
                    <button
                      onClick={() => downloadPDF(task)}
                      className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs py-1.5 rounded-lg font-medium transition-colors flex items-center justify-center gap-1"
                      title="Download Dispatch PDF"
                    >
                      📄 PDF
                    </button>
                  </div>
                )}
                {task.status === "in_progress" && (
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        setActiveTab("evidence");
                        setCaptureActive(true);
                      }}
                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg"
                    >
                      📸 Evidence
                    </button>
                    <button
                      onClick={() => markComplete(task.id)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-1.5 rounded-lg"
                    >
                      ✅ Complete
                    </button>
                    <button
                      onClick={() => downloadPDF(task)}
                      className="px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs py-1.5 rounded-lg flex items-center justify-center gap-1"
                      title="Download Dispatch PDF"
                    >
                      📄 PDF
                    </button>
                    <button
                      onClick={() => escalate(task.id)}
                      className="bg-red-800 hover:bg-red-700 text-white text-xs py-1.5 px-3 rounded-lg"
                    >
                      🚨 Escalate
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Route Tab */}
        {activeTab === "route" && (
          <div className="space-y-4">
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4">
              <h3 className="text-white font-semibold mb-1">🗺️ OR-Tools Optimized Route</h3>
              <p className="text-slate-400 text-xs mb-4">
                Vehicle routing solved via Google OR-Tools (free) minimizing total travel time with priority weighting.
                Expected completion: <span className="text-white font-medium">6.5 hours</span> (09:00–15:30)
              </p>
              <div className="space-y-2">
                {ROUTE.map((step, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${
                      i === 0 || i === ROUTE.length - 1 ? "bg-slate-700" : "bg-indigo-900/60 border border-indigo-700/50"
                    }`}>
                      {step.icon}
                    </div>
                    <div className="flex-1">
                      <div className="text-slate-200 text-sm font-medium">{step.ward}</div>
                      <div className="text-slate-500 text-xs">{step.action}</div>
                    </div>
                    {i < ROUTE.length - 1 && (
                      <div className="flex flex-col items-center gap-0.5 text-slate-700 text-xs">
                        <div className="w-px h-3 bg-slate-700" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total Distance", value: "21 km", sub: "optimized route" },
                { label: "Sites Covered", value: `${ROUTE.length - 2}`, sub: "high-priority" },
                { label: "Time Saved", value: "~1.5h", sub: "vs unoptimized" },
              ].map((s, i) => (
                <div key={i} className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-3 text-center">
                  <div className="text-white font-bold text-lg">{s.value}</div>
                  <div className="text-slate-400 text-xs">{s.label}</div>
                  <div className="text-slate-600 text-xs">{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evidence Tab */}
        {activeTab === "evidence" && (
          <div className="space-y-4">
            <div className="bg-slate-800/40 border border-slate-700/40 rounded-xl p-4 space-y-4">
              <h3 className="text-white font-semibold">📸 Evidence Capture</h3>

              {/* GPS stamp */}
              <div className="flex items-center gap-2 p-3 bg-emerald-950/20 border border-emerald-800/30 rounded-lg">
                <span className="text-emerald-400">📍</span>
                <div className="text-xs">
                  <div className="text-emerald-300 font-medium">GPS Stamp Active</div>
                  <div className="text-slate-400">{evidenceCapture.gps_stamp} · {evidenceCapture.timestamp}</div>
                </div>
                <span className="ml-auto w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              </div>

              {/* Photo capture placeholder */}
              <div className="border-2 border-dashed border-slate-600 rounded-xl p-6 text-center space-y-2">
                <div className="text-3xl">📷</div>
                <div className="text-slate-300 text-sm font-medium">Camera Evidence Capture</div>
                <div className="text-slate-500 text-xs">
                  Photo metadata automatically stamped with GPS, timestamp, and officer ID
                </div>
                <button className="mt-2 bg-indigo-600/60 text-white text-xs px-4 py-2 rounded-lg border border-indigo-500/40">
                  Open Camera (device API)
                </button>
              </div>

              {/* Voice note */}
              <div className="border-2 border-dashed border-slate-600 rounded-xl p-4 text-center space-y-1">
                <div className="text-2xl">🎤</div>
                <div className="text-slate-300 text-sm font-medium">Voice Note</div>
                <div className="text-slate-500 text-xs">Record verbal observations, auto-transcribed</div>
                <button className="mt-1 bg-red-600/40 text-red-300 text-xs px-4 py-1.5 rounded-lg border border-red-500/30">
                  Start Recording
                </button>
              </div>

              {/* Written notes */}
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Written Observation</label>
                <textarea
                  value={evidenceCapture.notes}
                  onChange={e => setEvidenceCapture(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Describe what you observed at the site..."
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500 resize-none"
                  rows={4}
                />
              </div>

              {/* Severity */}
              <div>
                <label className="text-xs text-slate-400 mb-2 block">Severity Assessment</label>
                <div className="flex gap-2">
                  {["low", "medium", "high", "critical"].map(s => (
                    <button
                      key={s}
                      onClick={() => setEvidenceCapture(prev => ({ ...prev, severity: s }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                        evidenceCapture.severity === s
                          ? s === "critical" ? "bg-red-600 text-white" : s === "high" ? "bg-orange-600 text-white" : s === "medium" ? "bg-yellow-600 text-white" : "bg-blue-600 text-white"
                          : "bg-slate-700/50 text-slate-400"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors">
                📤 Submit Evidence Package
              </button>
            </div>
          </div>
        )}

        {/* Notices Tab */}
        {activeTab === "notices" && (
          <div className="space-y-4">
            {generatingNotice ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <div className="text-3xl animate-spin">⚙️</div>
                <p className="text-slate-400 text-sm">Generating legal notice via Air Act 1981…</p>
              </div>
            ) : noticeText ? (
              <>
                <div className="bg-amber-950/20 border border-amber-700/30 rounded-xl p-3 text-xs text-amber-300">
                  📜 Show-cause notice generated for <strong>{noticeTarget?.ward_name}</strong> ({noticeTarget?.industry_type}).
                  Legal basis: Air (Prevention and Control of Pollution) Act, 1981.
                </div>
                <div className="bg-slate-900/60 border border-slate-700/40 rounded-xl p-4">
                  <pre className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap font-mono">
                    {noticeText}
                  </pre>
                </div>
                <div className="flex gap-2">
                  <button className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-2.5 rounded-xl font-medium">
                    📲 Send via WhatsApp
                  </button>
                  <button className="flex-1 bg-slate-700 hover:bg-slate-600 text-white text-sm py-2.5 rounded-xl font-medium">
                    🖨️ Print Copy
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-500">
                <div className="text-4xl mb-3">📜</div>
                <p className="text-sm">No notice generated yet.</p>
                <p className="text-xs mt-1">Go to Tasks → Start Inspection → Pre-Generate Notice</p>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-slate-600 pb-4">
          AETHER Field Officer Portal · OR-Tools Routing · GPS Evidence · Air Act 1981 Legal Engine
        </div>
      </div>
    </div>
  );
}
