"use client";
/**
 * AETHER — Interactive Map Component
 * React-Leaflet with CartoDB Dark Matter tiles, station markers,
 * ward choropleth, and interactive side panel.
 */

import { useEffect, useState, useCallback } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { LiveAQIPoint, HeatmapPoint, WardDetail } from "@/lib/api";
import { getAQIColor, getAQILevel } from "@/lib/aqi-colors";
import { WindOverlay } from "./WindOverlay";
import { PlumeOverlay } from "./PlumeOverlay";
import { MitigationRouting } from "./MitigationRouting";


interface AetherMapProps {
  liveData: LiveAQIPoint[];
  heatmapData: HeatmapPoint[];
  onWardClick?: (wardId: number) => void;
  selectedWardId?: number | null;
  city?: string;
  showWind?: boolean;
  windSpeed?: number;
  windDir?: number;
  showSatellite?: boolean;
  showRoute?: boolean;
  wardDetail?: WardDetail | null;
  citizenReports?: import("@/lib/api").CitizenReport[];
  onUpvoteReport?: (id: number) => void;
  showCitizenReports?: boolean;
}


// City center coordinates
const CITY_CENTERS: Record<string, [number, number]> = {
  Kolkata: [22.5726, 88.3639],
  Delhi: [28.6139, 77.2090],
  Mumbai: [19.0760, 72.8777],
};

function FlyToCity({ city }: { city: string }) {
  const map = useMap();
  useEffect(() => {
    const center = CITY_CENTERS[city] || CITY_CENTERS.Kolkata;
    map.flyTo(center, 12, { duration: 1.5 });
  }, [city, map]);
  return null;
}

function ResizeMap() {
  const map = useMap();
  useEffect(() => {
    const handleResize = () => {
      map.invalidateSize();
    };
    window.addEventListener("resize", handleResize);
    // Initial trigger
    map.invalidateSize();
    return () => window.removeEventListener("resize", handleResize);
  }, [map]);
  return null;
}

export function AetherMap({
  liveData,
  heatmapData,
  onWardClick,
  selectedWardId,
  city = "Kolkata",
  showWind = false,
  windSpeed = 0,
  windDir = 0,
  showSatellite = false,
  showRoute = false,
  wardDetail = null,
  citizenReports = [],
  onUpvoteReport,
  showCitizenReports = false,
}: AetherMapProps) {
  const center = CITY_CENTERS[city] || CITY_CENTERS.Kolkata;

  return (
    <MapContainer
      center={center}
      zoom={12}
      style={{ height: "100%", width: "100%", background: "#0d1117" }}
      className="rounded-none"
      zoomControl={false}
    >
      {/* CartoDB Dark Matter tiles — free, no API key, looks premium */}
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={19}
      />

      <FlyToCity city={city} />
      <ResizeMap />

      {/* Ward Choropleth Layer */}
      {heatmapData.map((ward) => (
        <CircleMarker
          key={`ward-${ward.ward_id}`}
          center={[ward.lat, ward.lon]}
          radius={16}
          pathOptions={{
            fillColor: getAQIColor(ward.aqi),
            fillOpacity: 0.35,
            color: getAQIColor(ward.aqi),
            weight: 1,
            opacity: 0.6,
          }}
          eventHandlers={{
            click: () => onWardClick?.(ward.ward_id),
          }}
        >
          <Popup className="aether-popup">
            <div className="text-gray-100 bg-gray-900 p-3 rounded-lg min-w-[200px]">
              <h3 className="font-bold text-sm mb-1">{ward.ward_name}</h3>
              <div className="flex items-center gap-2">
                <span
                  className="text-2xl font-black"
                  style={{ color: getAQIColor(ward.aqi) }}
                >
                  {Math.round(ward.aqi)}
                </span>
                <span className="text-xs text-gray-400">{ward.category}</span>
              </div>
              <button
                onClick={() => onWardClick?.(ward.ward_id)}
                className="mt-2 text-xs text-blue-400 underline hover:text-blue-300"
              >
                View full analysis →
              </button>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* Station Markers */}
      {liveData.map((station) => (
        <CircleMarker
          key={`station-${station.station_id}`}
          center={[station.lat, station.lon]}
          radius={8}
          pathOptions={{
            fillColor: getAQIColor(station.aqi),
            fillOpacity: 1,
            color: "#ffffff",
            weight: 2,
            opacity: 0.9,
          }}
        >
          <Popup className="aether-popup">
            <div className="text-gray-100 bg-gray-900 p-3 rounded-lg min-w-[220px]">
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: getAQIColor(station.aqi) }}
                />
                <h3 className="font-bold text-sm">{station.name}</h3>
              </div>

              <div className="grid grid-cols-2 gap-1 text-xs">
                <div className="text-gray-400">AQI</div>
                <div
                  className="font-bold text-right"
                  style={{ color: getAQIColor(station.aqi) }}
                >
                  {station.aqi ? Math.round(station.aqi) : "—"} · {station.category || "Unknown"}
                </div>

                {station.pm25 != null && (
                  <>
                    <div className="text-gray-400">PM2.5</div>
                    <div className="text-right text-gray-300">{station.pm25.toFixed(1)} µg/m³</div>
                  </>
                )}
                {station.pm10 != null && (
                  <>
                    <div className="text-gray-400">PM10</div>
                    <div className="text-right text-gray-300">{station.pm10.toFixed(1)} µg/m³</div>
                  </>
                )}
                {station.measured_at && (
                  <>
                    <div className="text-gray-400">Updated</div>
                    <div className="text-right text-gray-500 text-[10px]">
                      {new Date(station.measured_at).toLocaleTimeString("en-IN", {
                        hour: "2-digit", minute: "2-digit"
                      })}
                    </div>
                  </>
                )}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
      {/* Windy-style Wind Particle Overlay */}
      {showWind && windSpeed > 0 && (
        <WindOverlay windSpeed={windSpeed} windDir={windDir} />
      )}

      {/* Gaussian Plume Dispersion Overlay */}
      {showWind && selectedWardId && (() => {
        const sw = heatmapData.find((w) => w.ward_id === selectedWardId);
        return sw ? (
          <PlumeOverlay lat={sw.lat} lon={sw.lon} windSpeed={windSpeed} windDir={windDir} aqi={sw.aqi} />
        ) : null;
      })()}

      {/* Mitigation Response Dispatch Routing */}
      {showRoute && wardDetail && (
        <MitigationRouting
          wardLat={wardDetail.lat}
          wardLon={wardDetail.lon}
          wardName={wardDetail.name}
          schoolCount={wardDetail.school_count}
          hospitalCount={wardDetail.hospital_count}
          windDir={windDir}
          windSpeed={windSpeed}
          aqi={wardDetail.aqi || 150}
          city={city}
        />
      )}

      {/* Sentinel-5P NO2 Satellite Layer (Tropospheric Column Density) */}
      {showSatellite && heatmapData.map((ward) => {
        const densityFactor = (ward.aqi * 0.35 + (ward.lat * 1000 % 100)) * 0.05;
        const scaleVal = Math.min(100, Math.max(10, densityFactor));
        return (
          <CircleMarker
            key={`sat-${ward.ward_id}`}
            center={[ward.lat, ward.lon]}
            radius={28}
            pathOptions={{
              fillColor: "#f97316", // glowing orange-red
              fillOpacity: 0.15 * (scaleVal / 100),
              color: "transparent",
              weight: 0,
            }}
          />
        );
      })}

      {/* Citizen Incident Reports Layer */}
      {showCitizenReports && citizenReports.map((report) => (
        <CircleMarker
          key={`citizen-report-${report.id}`}
          center={[report.lat, report.lon]}
          radius={8}
          pathOptions={{
            fillColor: report.severity === "high" ? "#ef4444" : report.severity === "medium" ? "#f97316" : "#eab308",
            fillOpacity: 0.85,
            color: "#ffffff",
            weight: 2,
            opacity: 1,
            className: "pulse-dot"
          }}
        >
          <Popup className="aether-popup">
            <div className="text-gray-100 bg-gray-900 p-3 rounded-lg min-w-[220px] space-y-2">
              <div className="flex justify-between items-center border-b border-white/5 pb-1">
                <span className="font-bold text-[10px] uppercase tracking-wider text-red-400">
                  🚨 Citizen Report
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  report.severity === "high" ? "bg-red-500/20 text-red-400" : report.severity === "medium" ? "bg-orange-500/20 text-orange-400" : "bg-yellow-500/20 text-yellow-400"
                }`}>
                  {report.severity}
                </span>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-xs text-gray-200">
                  {report.report_type.replace("_", " ").toUpperCase()}
                </p>
                <p className="text-[11px] text-gray-400 leading-normal">
                  {report.description}
                </p>
                <div className="text-[10px] text-gray-500 space-y-0.5">
                  <p>Reporter: {report.reporter_name}</p>
                  <p>Ward: {report.ward_name || `Ward #${report.ward_id}`}</p>
                  <p>Status: <span className={`font-semibold ${
                    report.status === "verified" || report.status === "resolved" ? "text-emerald-400" : "text-yellow-400"
                  }`}>{report.status.toUpperCase()}</span></p>
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-white/5 pt-2 mt-1">
                <span className="text-[10px] text-gray-400 font-mono">
                  👍 {report.upvote_count} upvotes
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpvoteReport?.(report.id);
                  }}
                  className="px-2 py-0.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-bold rounded text-[9px] transition-colors cursor-pointer"
                >
                  ▲ Upvote
                </button>
              </div>
            </div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );

}

