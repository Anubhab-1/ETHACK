"use client";
/**
 * AETHER â€” AppShell
 * Persistent collapsible sidebar + topbar wrapper for all inner pages.
 * Replaces the one-off navigation each page currently builds independently.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  TrendingUp,
  Shield,
  BarChart2,
  MessageSquare,
  Briefcase,
  Users,
  FileText,
  ChevronLeft,
  ChevronRight,
  Activity,
  Wifi,
  WifiOff,
  Menu,
  X,
  Hexagon,
  Home,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    label: "Command Center",
    items: [
      { href: "/", icon: Home, label: "Home", shortLabel: "Home" },
      { href: "/dashboard", icon: LayoutDashboard, label: "Situation Room", shortLabel: "Map", badge: "LIVE" },
      { href: "/forecast", icon: TrendingUp, label: "72h Forecast", shortLabel: "Forecast", badge: "AI" },
    ],
  },
  {
    label: "Enforcement",
    items: [
      { href: "/enforcement", icon: Shield, label: "Enforcement", shortLabel: "Enforce", badge: null },
      { href: "/field-officer", icon: Briefcase, label: "Field Officer", shortLabel: "Field", badge: null },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/compare", icon: BarChart2, label: "Multi-City", shortLabel: "Compare", badge: null },
      { href: "/commissioner", icon: Activity, label: "Commissioner", shortLabel: "Commsr.", badge: null },
    ],
  },
  {
    label: "Public",
    items: [
      { href: "/advisory", icon: MessageSquare, label: "Advisory AI", shortLabel: "Advisory", badge: "NLP" },
      { href: "/citizen", icon: Users, label: "Citizen Portal", shortLabel: "Citizen", badge: null },
      { href: "/reports", icon: FileText, label: "Reports", shortLabel: "Reports", badge: null },
    ],
  },
];

const BADGE_COLORS: Record<string, string> = {
  LIVE: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  AI: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  NLP: "bg-rose-500/20 text-rose-400 border-rose-500/30",
};

function getAQIColor(aqi: number | null) {
  if (aqi === null) return "#64748b";
  if (aqi <= 50) return "#22c55e";
  if (aqi <= 100) return "#84cc16";
  if (aqi <= 200) return "#eab308";
  if (aqi <= 300) return "#f97316";
  if (aqi <= 400) return "#ef4444";
  return "#991b1b";
}

function getAQILabel(aqi: number | null) {
  if (aqi === null) return "\u2014";
  if (aqi <= 50) return "Good";
  if (aqi <= 100) return "Satisfactory";
  if (aqi <= 200) return "Moderate";
  if (aqi <= 300) return "Poor";
  if (aqi <= 400) return "Very Poor";
  return "Severe";
}

interface AppShellProps {
  children: React.ReactNode;
  city?: string;
  liveAQI?: number | null;
}

interface SidebarContentProps {
  collapsed: boolean;
  pathname: string;
  city: string;
  liveAQI?: number | null;
  aqiColor: string;
  aqiLabel: string;
  timeStr: string;
  dateStr: string;
  online: boolean;
}

function SidebarContent({
  collapsed,
  pathname,
  city,
  liveAQI,
  aqiColor,
  aqiLabel,
  timeStr,
  dateStr,
  online,
}: SidebarContentProps) {
  return (
    <div className="flex flex-col h-full">
      <div className={`flex items-center ${collapsed ? "justify-center px-2 py-4" : "gap-3 px-4 py-4"} border-b border-white/5`}>
        <div className="flex-none text-orange-500">
          <Hexagon size={collapsed ? 28 : 24} strokeWidth={1.5} fill="rgba(249,115,22,0.1)" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-black text-white text-base tracking-tight leading-none">AETHER</div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">Air Quality Intelligence</div>
          </div>
        )}
      </div>

      {!collapsed && (
        <div className="mx-3 mt-3 mb-1 p-3 rounded-xl border border-white/6 bg-gradient-to-br from-slate-900/60 to-slate-900/30">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">{city} AQI</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: aqiColor }} />
              <span className="text-[10px] text-slate-400 font-mono" suppressHydrationWarning>{timeStr}</span>
            </span>
          </div>
          {liveAQI !== undefined && liveAQI !== null ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black font-mono text-data" style={{ color: aqiColor }}>{liveAQI}</span>
              <span className="text-xs font-semibold" style={{ color: aqiColor }}>{aqiLabel}</span>
            </div>
          ) : (
            <div className="h-7 skeleton rounded w-20" />
          )}
        </div>
      )}

      {collapsed && (
        <div className="flex flex-col items-center gap-1 py-2 border-b border-white/5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black" style={{ background: `${aqiColor}22`, color: aqiColor }}>
            {liveAQI ?? "\u2014"}
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2 space-y-4 hide-scrollbar">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-2 mb-1">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center ${collapsed ? "justify-center px-2" : "gap-2.5 px-3"} py-2 rounded-lg text-sm transition-all duration-150 group relative ${
                      isActive
                        ? "bg-orange-500/12 text-orange-400 border border-orange-500/20"
                        : "text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent"
                    }`}
                  >
                    <Icon size={15} strokeWidth={isActive ? 2.2 : 1.8} className="flex-none" />
                    {!collapsed && (
                      <>
                        <span className="flex-1 font-medium text-[13px] truncate">{item.label}</span>
                        {item.badge && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${BADGE_COLORS[item.badge] || "bg-slate-700 text-slate-300"}`}>
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-orange-500 rounded-r" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-white/5 ${collapsed ? "p-2" : "p-3"}`}>
        {!collapsed ? (
          <div className="flex items-center justify-between text-[10px] text-slate-600">
            <span className="flex items-center gap-1">
              {online ? <Wifi size={10} className="text-emerald-500" /> : <WifiOff size={10} className="text-red-500" />}
              {online ? "Connected" : "Offline"}
            </span>
            <span suppressHydrationWarning>{dateStr}</span>
          </div>
        ) : (
          <div className="flex justify-center">
            {online ? <Wifi size={12} className="text-emerald-500" /> : <WifiOff size={12} className="text-red-500" />}
          </div>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children, city = "Kolkata", liveAQI }: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [time, setTime] = useState(new Date());
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    if (typeof window !== "undefined") {
      const path = pathname.split("/").filter(Boolean)[0] || "Home";
      const formatted = path.charAt(0).toUpperCase() + path.slice(1);
      const titleName = formatted === "Home" ? "Urban Environmental Intelligence" : formatted;
      document.title = `${titleName} | AETHER`;
    }
  }, [pathname]);

  useEffect(() => {
    // Trigger window resize event repeatedly during transition to ensure Leaflet maps and charts scale smoothly
    const startTime = Date.now();
    const interval = setInterval(() => {
      window.dispatchEvent(new Event("resize"));
      if (Date.now() - startTime > 400) {
        clearInterval(interval);
      }
    }, 16); // ~60fps
    return () => clearInterval(interval);
  }, [collapsed]);

  const aqiColor = getAQIColor(liveAQI ?? null);
  const aqiLabel = getAQILabel(liveAQI ?? null);
  const timeStr = time.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = time.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <aside
        className={`relative hidden md:flex flex-col flex-none transition-all duration-300 ease-in-out app-sidebar ${
          collapsed ? "w-[56px]" : "w-[220px]"
        }`}
      >
        <SidebarContent
          collapsed={collapsed}
          pathname={pathname}
          city={city}
          liveAQI={liveAQI}
          aqiColor={aqiColor}
          aqiLabel={aqiLabel}
          timeStr={timeStr}
          dateStr={dateStr}
          online={online}
        />
        <button
          onClick={() => setCollapsed((current) => !current)}
          className="absolute top-1/2 -right-3.5 -translate-y-1/2 hidden md:flex w-7 h-7 rounded-full border border-orange-500/40 bg-gray-900 hover:bg-orange-500 text-orange-400 hover:text-white items-center justify-center transition-all z-50 shadow-lg shadow-orange-500/10 cursor-pointer"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight size={14} strokeWidth={2.5} /> : <ChevronLeft size={14} strokeWidth={2.5} />}
        </button>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-[240px] app-sidebar flex flex-col">
            <SidebarContent
              collapsed={false}
              pathname={pathname}
              city={city}
              liveAQI={liveAQI}
              aqiColor={aqiColor}
              aqiLabel={aqiLabel}
              timeStr={timeStr}
              dateStr={dateStr}
              online={online}
            />
            <button onClick={() => setMobileOpen(false)} className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 text-slate-400 hover:text-white">
              <X size={14} />
            </button>
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex md:hidden items-center gap-3 px-4 py-3 border-b border-white/6 bg-gray-950/80 backdrop-blur-md flex-none">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg bg-white/5 text-slate-400 hover:text-white">
            <Menu size={16} />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Hexagon size={18} className="text-orange-500" strokeWidth={1.5} fill="rgba(249,115,22,0.1)" />
            <span className="font-black text-white text-sm">AETHER</span>
          </div>
          {liveAQI !== null && liveAQI !== undefined && (
            <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ color: aqiColor, background: `${aqiColor}22` }}>
              AQI {liveAQI}
            </span>
          )}
        </div>

        <main className="flex-1 overflow-auto pb-16 md:pb-0">{children}</main>

        {/* ── Mobile Bottom Navigation Bar (Phone Screens) ── */}
        <div className="fixed bottom-0 left-0 right-0 z-[9999] md:hidden bg-gray-950/95 backdrop-blur-xl border-t border-white/10 px-2 py-1 flex items-center justify-around shadow-2xl pointer-events-auto">
          {[
            { href: "/dashboard", icon: LayoutDashboard, label: "Map" },
            { href: "/forecast", icon: TrendingUp, label: "Forecast" },
            { href: "/enforcement", icon: Shield, label: "Enforce" },
            { href: "/advisory", icon: MessageSquare, label: "Advisory" },
            { href: "/field-officer", icon: Briefcase, label: "Field" },
          ].map((navItem) => {
            const isActive = pathname === navItem.href || (navItem.href !== "/" && pathname.startsWith(navItem.href));
            const IconComponent = navItem.icon;
            return (
              <Link
                key={navItem.href}
                href={navItem.href}
                className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors ${
                  isActive ? "text-orange-400 font-bold" : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <IconComponent size={18} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="text-[10px] font-medium tracking-tight">{navItem.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
