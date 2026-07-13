"use client";
/**
 * AETHER — Enforcement Command Center v2.0
 * Priority-ranked enforcement actions with live dispatch timeline,
 * animated status pipeline, and integrated broadcast system.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { api, EnforcementAction, EnforcementStats } from "@/lib/api";
import { AQIBadge } from "@/components/AQIBadge";
import { SOURCE_COLORS, SOURCE_ICONS, SOURCE_LABELS } from "@/lib/aqi-colors";
import { BroadcastModal } from "@/components/BroadcastModal";
import { AppShell } from "@/components/AppShell";
import { SkeletonTable } from "@/components/SkeletonLoaders";

const STATUS_COLORS: Record<string, string> = {
  open: "text-orange-400 bg-orange-900/30 border-orange-800/60",
  deployed: "text-blue-400 bg-blue-900/30 border-blue-800/60",
  resolved: "text-emerald-400 bg-emerald-900/30 border-emerald-800/60",
};

const STATUS_ICONS: Record<string, string> = {
  open: "🔴",
  deployed: "🔵",
  resolved: "✅",
};

const PRIORITY_LABEL = (score: number) => {
  if (score > 80) return { text: "P1 CRITICAL", color: "text-red-400 bg-red-900/30 border-red-700/60" };
  if (score > 60) return { text: "P2 HIGH", color: "text-orange-400 bg-orange-900/30 border-orange-700/60" };
  if (score > 40) return { text: "P3 MEDIUM", color: "text-yellow-400 bg-yellow-900/30 border-yellow-700/60" };
  return { text: "P4 LOW", color: "text-green-400 bg-green-900/30 border-green-700/60" };
};

export default function EnforcementPage() {
  const [city, setCity] = useState("Kolkata");
  const [actions, setActions] = useState<EnforcementAction[]>([]);
  const [stats, setStats] = useState<EnforcementStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [recomputing, setRecomputing] = useState(false);
  const [selectedAction, setSelectedAction] = useState<EnforcementAction | null>(null);
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [deployingId, setDeployingId] = useState<number | null>(null);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [recomputeToast, setRecomputeToast] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const [acts, st] = await Promise.all([
        api.enforcement(city, 30, statusFilter),
        api.enforcementStats(city),
      ]);
      setActions(acts);
      setStats(st);
      setLastSync(new Date());
    } catch (e) {
      console.error(e);
      setError("Couldn't reach the AETHER backend. Note: Render free tier takes ~50s to wake up on initial load. Please wait a moment and click Retry.");
    } finally {
      setLoading(false);
    }
  }, [city, statusFilter]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    loadData();
  }, [loadData]);

  const handleStatusUpdate = async (actionId: number, newStatus: string) => {
    if (newStatus === "deployed") setDeployingId(actionId);
    if (newStatus === "resolved") setResolvingId(actionId);
    await api.updateEnforcementStatus(actionId, newStatus);
    await loadData();
    setDeployingId(null);
    setResolvingId(null);
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    await api.recomputeEnforcement(city);
    await loadData();
    setRecomputing(false);
    setRecomputeToast(true);
    setTimeout(() => setRecomputeToast(false), 3000);
  };

  // Compute resolution rate
  const resolutionRate = stats
    ? stats.total > 0
      ? Math.round((stats.resolved / stats.total) * 100)
      : 0
    : 0;

  const deploymentRate = stats
    ? stats.total > 0
      ? Math.round(((stats.deployed + stats.resolved) / stats.total) * 100)
      : 0
    : 0;

  return (
    <AppShell city={city}>
    <div className="min-h-full bg-gray-950 text-gray-100">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="border-b border-white/8 px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2.5 sm:gap-0 bg-gray-950/95 backdrop-blur-md sticky top-0 z-[1100] shadow-md">
        <div className="flex items-center gap-4 justify-between w-full sm:w-auto">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-orange-500 font-black text-lg hover:text-orange-400 transition-colors">⬡ AETHER</Link>
            <span className="text-gray-700">·</span>
            <h1 className="font-bold text-sm text-gray-200">Enforcement Command</h1>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 w-full sm:w-auto">
          {lastSync && (
            <span className="text-[10px] text-gray-600 hidden sm:block">
              Synced {lastSync.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="text-sm bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500"
          >
            {["Kolkata", "Delhi", "Mumbai"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <button
            onClick={handleRecompute}
            disabled={recomputing}
            className="px-3 py-1.5 text-xs rounded-lg border border-orange-500/50 text-orange-400 hover:bg-orange-500/10 transition-colors disabled:opacity-50 font-semibold cursor-pointer"
          >
            {recomputing ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border border-orange-400 border-t-transparent rounded-full animate-spin" />
                Recomputing...
              </span>
            ) : "⟳ Recompute AI Scores"}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* ── KPI Command Bar ──────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: "Total Actions",
                value: stats.total,
                color: "text-gray-200",
                icon: "📋",
                sub: `${city} enforcement queue`,
                bg: "border-gray-800",
              },
              {
                label: "Open / Priority",
                value: stats.open,
                color: "text-orange-400",
                icon: "🔴",
                sub: "Awaiting deployment",
                bg: "border-orange-900/40",
              },
              {
                label: "Deployed / Active",
                value: stats.deployed,
                color: "text-blue-400",
                icon: "🔵",
                sub: `${deploymentRate}% deployment rate`,
                bg: "border-blue-900/40",
              },
              {
                label: "Resolved",
                value: stats.resolved,
                color: "text-emerald-400",
                icon: "✅",
                sub: `${resolutionRate}% resolution rate`,
                bg: "border-emerald-900/40",
              },
            ].map((s) => (
              <div key={s.label} className={`glass-card p-4 border ${s.bg}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg">{s.icon}</span>
                  <span className="text-[10px] text-gray-600 uppercase font-semibold">{s.label}</span>
                </div>
                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-gray-600 mt-1">{s.sub}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Progress Pipeline Bar ──────────────────────────────── */}
        {stats && stats.total > 0 && (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Response Pipeline — {city}</h3>
              <span className="text-[10px] text-gray-600">{stats.total} total actions</span>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5">
              {stats.open > 0 && (
                <div
                  className="bg-orange-500 transition-all duration-1000 ease-out"
                  style={{ width: `${(stats.open / stats.total) * 100}%` }}
                  title={`${stats.open} open`}
                />
              )}
              {stats.deployed > 0 && (
                <div
                  className="bg-blue-500 transition-all duration-1000 ease-out"
                  style={{ width: `${(stats.deployed / stats.total) * 100}%` }}
                  title={`${stats.deployed} deployed`}
                />
              )}
              {stats.resolved > 0 && (
                <div
                  className="bg-emerald-500 transition-all duration-1000 ease-out"
                  style={{ width: `${(stats.resolved / stats.total) * 100}%` }}
                  title={`${stats.resolved} resolved`}
                />
              )}
            </div>
            <div className="flex gap-4 mt-2 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-orange-500 rounded-full" /> Open</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-blue-500 rounded-full" /> Deployed</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 bg-emerald-500 rounded-full" /> Resolved</span>
            </div>
          </div>
        )}

        {/* ── Filter Tabs ──────────────────────────────────────────── */}
        <div className="flex gap-2 flex-wrap">
          {(["open", "deployed", "resolved"] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold capitalize border transition-all cursor-pointer ${
                statusFilter === status
                  ? STATUS_COLORS[status]
                  : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600"
              }`}
            >
              {STATUS_ICONS[status]} {status}
              {stats && (
                <span className="ml-2 text-xs opacity-70">
                  ({status === "open" ? stats.open : status === "deployed" ? stats.deployed : stats.resolved})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Action Cards ─────────────────────────────────────────── */}
        {error ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] border border-red-500/30 bg-red-950/20 rounded-2xl p-8 max-w-md mx-auto text-center animate-slide-up">
            <span className="text-4xl mb-4 block">⚠️</span>
            <p className="text-gray-200 font-semibold mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setLoading(true);
                loadData();
              }}
              className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-all cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="space-y-4">
            <SkeletonTable rows={5} cols={4} />
          </div>
        ) : actions.length === 0 ? (
          <div className="text-center py-20 glass-card">
            <p className="text-5xl mb-4">✅</p>
            <p className="text-gray-300 font-semibold">No {statusFilter} enforcement actions</p>
            <p className="text-gray-600 text-sm mt-1">Queue is clear for {city}</p>
            <button onClick={handleRecompute} className="mt-6 text-orange-400 text-sm hover:underline cursor-pointer">
              Run AI recompute →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {actions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((action, idx) => {
              const priority = PRIORITY_LABEL(action.priority_score);
              const isDeploying = deployingId === action.id;
              const isResolving = resolvingId === action.id;
              return (
                <div
                  key={action.id}
                  className="glass-card p-5 hover:border-orange-500/30 transition-all duration-200 hover:shadow-lg hover:shadow-orange-500/5 animate-slide-up group"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Source Type Indicator */}
                    <div className="flex items-start gap-3.5">
                      <span className="text-2xl p-2 bg-gray-900/60 rounded-xl border border-white/5 flex-none select-none">
                        {SOURCE_ICONS[action.target_type] || "📍"}
                      </span>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${priority.color}`}>
                            {priority.text}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded border capitalize ${STATUS_COLORS[action.status]}`}>
                            {STATUS_ICONS[action.status]} {action.status}
                          </span>
                        </div>
                        <h2 className="font-bold text-gray-200 text-sm">
                          {SOURCE_LABELS[action.target_type] || "Target Enforcement Source"}
                        </h2>
                        <p className="text-xs text-gray-500">
                          {action.ward_name} (Ward #{action.ward_no}) · {action.city}
                        </p>
                        <p className="text-xs text-gray-400 leading-relaxed mt-1">
                          {action.action_text}
                        </p>
                      </div>
                    </div>

                    {/* Metadata & Actions */}
                    <div className="flex flex-col md:items-end gap-1.5 md:min-w-[200px]">
                      <div className="text-right font-mono text-[10px] text-gray-500">
                        Priority Index: <span className="text-orange-400 font-bold text-xs">{action.priority_score.toFixed(1)}</span>
                      </div>
                      
                      {action.status === "open" && (
                        <button
                          onClick={() => handleStatusUpdate(action.id, "deployed")}
                          disabled={isDeploying}
                          className="w-full px-3 py-1.5 text-xs rounded-lg bg-orange-600 hover:bg-orange-500 text-white font-bold transition-all cursor-pointer text-center disabled:opacity-60 flex items-center justify-center gap-1.5"
                        >
                          {isDeploying ? (
                            <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Deploying...</>
                          ) : "⚡ Deploy Inspector"}
                        </button>
                      )}

                      {action.status === "deployed" && (
                        <div className="flex gap-2 w-full">
                          <button
                            onClick={() => {
                              setSelectedAction(action);
                              setBroadcastOpen(true);
                            }}
                            className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-all font-semibold cursor-pointer text-center"
                          >
                            📢 Broadcast
                          </button>
                          <button
                            onClick={() => handleStatusUpdate(action.id, "resolved")}
                            disabled={isResolving}
                            className="flex-1 px-2 py-1.5 text-xs rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold transition-all cursor-pointer text-center disabled:opacity-60 flex items-center justify-center gap-1.5"
                          >
                            {isResolving ? (
                              <><span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> Resolving...</>
                            ) : "✓ Resolve"}
                          </button>
                        </div>
                      )}

                      {action.status === "resolved" && (
                        <div className="text-[10px] text-emerald-400 font-semibold text-right">
                          Action complete ✓
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Pagination Controls */}
            {!loading && actions.length > PAGE_SIZE && (
              <div className="flex items-center justify-between py-4 border-t border-white/5 mt-4">
                <span className="text-xs text-gray-500">
                  Showing {Math.min(actions.length, (currentPage - 1) * PAGE_SIZE + 1)} - {Math.min(actions.length, currentPage * PAGE_SIZE)} of {actions.length} actions
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Previous
                  </button>
                  <button
                    disabled={currentPage * PAGE_SIZE >= actions.length}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-900 border border-gray-800 text-gray-400 hover:text-white disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Response SLA Note ────────────────────────────────────── */}
        {!loading && actions.length > 0 && (
          <div className="glass-card p-4 border border-white/5">
            <div className="flex items-start gap-3 text-xs text-gray-500">
              <span className="text-blue-400 flex-none text-base">ℹ️</span>
              <div>
                <p className="font-semibold text-gray-400 mb-1">Enforcement SLA Guidelines</p>
                <p>P1 Critical (score &gt; 80): Response within <span className="text-orange-400 font-bold">2 hours</span>. 
                P2 High (score 60–80): Within <span className="text-yellow-400 font-bold">6 hours</span>. 
                P3 Medium: Within <span className="text-green-400 font-bold">24 hours</span>.
                Use "Broadcast Alert" on deployed actions to notify 10,000+ residents via SMS, WhatsApp, and IVR.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Broadcast Simulator Modal ─────────────────────────────── */}
      {selectedAction && (
        <BroadcastModal
          isOpen={broadcastOpen}
          onClose={() => setBroadcastOpen(false)}
          actionId={selectedAction.id}
          wardName={selectedAction.ward_name}
          wardNo={selectedAction.ward_no}
          aqi={Math.min(500, Math.max(150, selectedAction.priority_score * 4))}
          targetType={selectedAction.target_type}
          onStatusUpdate={loadData}
        />
      )}
    </div>
    </AppShell>
  );
}
