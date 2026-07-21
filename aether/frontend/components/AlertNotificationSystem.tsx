"use client";
/**
 * AETHER — Real-Time Alert Notification System
 * Monitors AQI thresholds and delivers toasts + a notification center.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

export interface AQIAlert {
  id: string;
  city: string;
  stationName: string;
  aqi: number;
  category: string;
  level: "warning" | "danger" | "critical";
  message: string;
  timestamp: Date;
  read: boolean;
}

interface AlertNotificationSystemProps {
  /** Live AQI data passed from parent. The system monitors this for threshold breaches. */
  liveAQI?: Array<{ station_id: number; name: string; aqi: number | null; city: string; category: string | null }>;
  /** City name for contextual messages */
  city?: string;
  /** Live alerts streamed from backend via WebSocket connection */
  wsAlerts?: AQIAlert[];
}

const LEVEL_CONFIG = {
  warning: {
    color: "text-yellow-400",
    bg: "bg-yellow-900/30 border-yellow-700/50",
    icon: "⚠️",
    label: "AQI Warning",
    min: 200,
  },
  danger: {
    color: "text-orange-400",
    bg: "bg-orange-900/30 border-orange-700/50",
    icon: "🔴",
    label: "AQI Danger",
    min: 300,
  },
  critical: {
    color: "text-red-400",
    bg: "bg-red-900/30 border-red-700/50",
    icon: "🚨",
    label: "CRITICAL ALERT",
    min: 400,
  },
};

function getAlertLevel(aqi: number): "warning" | "danger" | "critical" | null {
  if (aqi >= 400) return "critical";
  if (aqi >= 300) return "danger";
  if (aqi >= 200) return "warning";
  return null;
}

// Small toast component
function AlertToast({
  alert,
  onDismiss,
}: {
  alert: AQIAlert;
  onDismiss: (id: string) => void;
}) {
  const cfg = LEVEL_CONFIG[alert.level];
  useEffect(() => {
    const t = setTimeout(() => onDismiss(alert.id), 6000);
    return () => clearTimeout(t);
  }, [alert.id, onDismiss]);

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-xl border shadow-2xl animate-slide-up backdrop-blur-md max-w-xs ${cfg.bg}`}
      style={{ background: "rgba(10,10,18,0.92)" }}
    >
      <span className="text-lg flex-none mt-0.5">{cfg.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold uppercase tracking-wider ${cfg.color}`}>
          {cfg.label} — {alert.city}
        </p>
        <p className="text-xs text-gray-200 font-semibold mt-0.5 truncate">
          {alert.stationName}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{alert.message}</p>
      </div>
      <button
        onClick={() => onDismiss(alert.id)}
        className="text-gray-500 hover:text-gray-300 text-xs flex-none ml-1"
      >
        ✕
      </button>
    </div>
  );
}

export function AlertNotificationSystem({
  liveAQI,
  city,
  wsAlerts,
}: AlertNotificationSystemProps) {
  const [alerts, setAlerts] = useState<AQIAlert[]>([]);
  const [toasts, setToasts] = useState<AQIAlert[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const prevAlertedIds = useRef<Set<string>>(new Set());

  // Monitor liveAQI for threshold breaches
  useEffect(() => {
    if (!liveAQI || liveAQI.length === 0) return;

    const newAlerts: AQIAlert[] = [];

    liveAQI.forEach((station) => {
      if (!station.aqi) return;
      const level = getAlertLevel(station.aqi);
      if (!level) return;

      // Unique key: stationId + level to prevent duplicate toasts per level
      const alertKey = `${station.station_id}-${level}`;
      if (prevAlertedIds.current.has(alertKey)) return;

      const cfg = LEVEL_CONFIG[level];
      const alert: AQIAlert = {
        id: `${Date.now()}-${station.station_id}`,
        city: station.city || city || "Unknown",
        stationName: station.name,
        aqi: station.aqi,
        category: station.category || "Severe",
        level,
        message: `AQI ${station.aqi} — ${station.category || "Severe"}. ${
          level === "critical"
            ? "Emergency protocols should be activated immediately."
            : level === "danger"
            ? "Reduce outdoor activity and use N95 masks."
            : "Sensitive groups should limit outdoor exposure."
        }`,
        timestamp: new Date(),
        read: false,
      };

      newAlerts.push(alert);
      prevAlertedIds.current.add(alertKey);
    });

    if (newAlerts.length > 0) {
      setAlerts((prev) => [...newAlerts, ...prev].slice(0, 50));
      setToasts((prev) => [...prev, ...newAlerts.slice(0, 3)]);
    }
  }, [liveAQI, city]);

  // Monitor wsAlerts from WebSocket stream
  useEffect(() => {
    if (!wsAlerts || wsAlerts.length === 0) return;

    const newWsAlerts: AQIAlert[] = [];

    wsAlerts.forEach((alert) => {
      // Avoid duplicate alerts in state
      if (prevAlertedIds.current.has(alert.id)) return;

      newWsAlerts.push(alert);
      prevAlertedIds.current.add(alert.id);
    });

    if (newWsAlerts.length > 0) {
      setAlerts((prev) => [...newWsAlerts, ...prev].slice(0, 50));
      setToasts((prev) => [...prev, ...newWsAlerts.slice(0, 3)]);
    }
  }, [wsAlerts]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markAllRead = useCallback(() => {
    setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
  }, []);

  const clearAll = useCallback(() => {
    setAlerts([]);
    prevAlertedIds.current.clear();
  }, []);

  const unreadCount = alerts.filter((a) => !a.read).length;
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  return (
    <>
      {/* Bell Icon Button */}
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => {
            setPanelOpen((o) => !o);
            if (!panelOpen) {
              // Mark all as read when opening
              setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
            }
          }}
          className="relative p-1.5 rounded-lg bg-gray-800 border border-gray-700 hover:border-orange-500 text-gray-400 hover:text-orange-400 transition-colors"
          title="Alert Notifications"
          id="alert-bell-btn"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* Notification Panel — fixed so it is never clipped by headers or overflow-hidden parents */}
        {panelOpen && (
          <div
            className="fixed top-[104px] md:top-[64px] right-3 sm:right-4 z-[10005] w-[calc(100vw-24px)] sm:w-80 md:w-96 max-h-[70vh] overflow-y-auto glass-card border border-orange-500/30 shadow-2xl rounded-2xl animate-slide-up"
            style={{ background: "rgba(5,5,12,0.97)" }}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔔</span>
                <h3 className="text-xs font-bold text-gray-200 uppercase tracking-wider">
                  Alert Center
                </h3>
                {unreadCount > 0 && (
                  <span className="text-[9px] px-1.5 py-0.5 bg-red-500/20 text-red-400 border border-red-500/30 rounded font-bold">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={markAllRead}
                  className="text-[10px] text-gray-500 hover:text-gray-300 font-semibold"
                >
                  Mark read
                </button>
                <button
                  onClick={clearAll}
                  className="text-[10px] text-gray-500 hover:text-red-400 font-semibold"
                >
                  Clear
                </button>
                <button
                  onClick={() => setPanelOpen(false)}
                  className="text-gray-500 hover:text-gray-300 text-xs ml-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Alert List */}
            {alerts.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-xs">
                <p className="text-2xl mb-2">🛡️</p>
                <p>No active alerts. All stations nominal.</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {alerts.map((alert) => {
                  const cfg = LEVEL_CONFIG[alert.level];
                  return (
                    <div
                      key={alert.id}
                      className={`px-4 py-3 text-xs ${alert.read ? "opacity-60" : ""} hover:bg-white/3 transition-colors`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span>{cfg.icon}</span>
                          <span className={`font-bold uppercase text-[9px] tracking-wider ${cfg.color}`}>
                            {cfg.label}
                          </span>
                          {!alert.read && (
                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full" />
                          )}
                        </div>
                        <span className="text-gray-600 text-[9px] flex-none">
                          {alert.timestamp.toLocaleTimeString("en-IN", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-gray-200 font-semibold mt-1">
                        {alert.stationName}
                        <span className="text-gray-500 font-normal ml-1">· {alert.city}</span>
                      </p>
                      <p className="text-gray-400 mt-0.5 leading-relaxed">{alert.message}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold border ${cfg.bg} ${cfg.color}`}>
                          AQI {alert.aqi}
                        </span>
                        <Link
                          href="/dashboard"
                          className="text-[9px] text-orange-400 hover:underline font-semibold"
                          onClick={() => setPanelOpen(false)}
                        >
                          View on map →
                        </Link>
                        <Link
                          href="/enforcement"
                          className="text-[9px] text-gray-400 hover:text-orange-400 hover:underline font-semibold"
                          onClick={() => setPanelOpen(false)}
                        >
                          Dispatch →
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div className="px-4 py-2 border-t border-white/5">
              <p className="text-[9px] text-gray-600 text-center">
                Alerts auto-trigger when AQI ≥ 200. High-severity reports escalate to enforcement.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Toast stack (bottom-right of screen, above mobile bottom bar) */}
      {toasts.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-3 sm:right-4 z-[10005] flex flex-col gap-2 pointer-events-auto max-w-[calc(100vw-24px)]">
          {toasts.map((toast) => (
            <AlertToast key={toast.id} alert={toast} onDismiss={dismissToast} />
          ))}
        </div>
      )}
    </>
  );
}
