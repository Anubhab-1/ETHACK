"use client";
/**
 * AETHER — Spatial Mitigation Dispatch Route Planner
 * Computes and renders an optimal tactical routing path from the central depot
 * to the selected ward, prioritizing schools and hospitals within the downwind plume.
 */

import { useEffect, useState } from "react";
import { Polyline, CircleMarker, Popup } from "react-leaflet";
import { getAQIColor } from "@/lib/aqi-colors";

interface ReceptorPoint {
  name: string;
  type: "school" | "hospital";
  lat: number;
  lon: number;
}

interface MitigationRoutingProps {
  wardLat: number;
  wardLon: number;
  wardName: string;
  schoolCount: number;
  hospitalCount: number;
  windDir: number;   // blowing FROM
  windSpeed: number;
  aqi: number;
  city: string;
}

// City-specific Municipal Dispatch Depot coordinates
const CITY_DEPOTS: Record<string, [number, number]> = {
  Kolkata: [22.5626, 88.3630], // Esplanade
  Delhi: [28.6139, 77.2090],    // Connaught Place Depot
  Mumbai: [19.0760, 72.8777],   // CST Depot
};

export function MitigationRouting({
  wardLat,
  wardLon,
  wardName,
  schoolCount,
  hospitalCount,
  windDir,
  windSpeed,
  aqi,
  city,
}: MitigationRoutingProps) {
  const depotCoords = CITY_DEPOTS[city] || CITY_DEPOTS.Kolkata;
  const [routeCoords, setRouteCoords] = useState<[number, number][]>([]);
  const [receptors, setReceptors] = useState<ReceptorPoint[]>([]);

  useEffect(() => {
    // 1. Calculate downwind direction (windDir + 180)
    const downwindAngle = (windDir + 180) % 360;
    const thetaRad = ((90 - downwindAngle) * Math.PI) / 180;

    // Generate mock receptor points based on the active counts, offset downwind
    const generatedReceptors: ReceptorPoint[] = [];

    // Scale displacement based on wind speed (further wind stretches the plume)
    const spreadMultiplier = 0.001 + (windSpeed * 0.0001);

    let idx = 1;
    // Add hospitals first
    const activeHospitals = Math.min(hospitalCount, 3) || 1; // ensure at least 1 for visual routing demo
    for (let i = 0; i < activeHospitals; i++) {
      // Offset along downwind centerline with slight lateral dispersion
      const distance = (i + 1) * 3.5 * spreadMultiplier;
      const lateralJitter = (Math.random() - 0.5) * 1.5 * spreadMultiplier;
      const latOffset = Math.sin(thetaRad) * distance + Math.cos(thetaRad) * lateralJitter;
      const lonOffset = Math.cos(thetaRad) * distance - Math.sin(thetaRad) * lateralJitter;

      generatedReceptors.push({
        name: `${wardName} Public Hospital #${idx++}`,
        type: "hospital",
        lat: wardLat + latOffset,
        lon: wardLon + lonOffset,
      });
    }

    // Add schools
    const activeSchools = Math.min(schoolCount, 3) || 2; // ensure at least 2 for routing demo
    for (let i = 0; i < activeSchools; i++) {
      const distance = (i + 1) * 5.0 * spreadMultiplier;
      const lateralJitter = (Math.random() - 0.5) * 2.5 * spreadMultiplier;
      const latOffset = Math.sin(thetaRad) * distance + Math.cos(thetaRad) * lateralJitter;
      const lonOffset = Math.cos(thetaRad) * distance - Math.sin(thetaRad) * lateralJitter;

      generatedReceptors.push({
        name: `${wardName} Secondary School #${idx++}`,
        type: "school",
        lat: wardLat + latOffset,
        lon: wardLon + lonOffset,
      });
    }

    setReceptors(generatedReceptors);

    // 2. Build the routing path
    // Path: Depot -> Target Ward Centroid -> Receptors in order of distance from ward
    const path: [number, number][] = [depotCoords, [wardLat, wardLon]];
    
    // Sort receptors by distance from ward
    const sortedReceptors = [...generatedReceptors].sort((a, b) => {
      const distA = Math.sqrt((a.lat - wardLat) ** 2 + (a.lon - wardLon) ** 2);
      const distB = Math.sqrt((b.lat - wardLat) ** 2 + (b.lon - wardLon) ** 2);
      return distA - distB;
    });

    sortedReceptors.forEach((r) => {
      path.push([r.lat, r.lon]);
    });

    setRouteCoords(path);
  }, [wardLat, wardLon, wardName, schoolCount, hospitalCount, windDir, windSpeed, depotCoords]);

  // 3. Animated vehicle tracking along the route coords
  const [vehiclePos, setVehiclePos] = useState<[number, number] | null>(null);
  const [activeSegment, setActiveSegment] = useState(0);
  const [segmentRatio, setSegmentRatio] = useState(0);
  const [telemetry, setTelemetry] = useState({
    speed: 42,
    waterLevel: 95,
    masksDelivered: 0,
    status: "En route",
    nextStop: "Target Ward Center"
  });

  // Reset vehicle when route changes
  useEffect(() => {
    setActiveSegment(0);
    setSegmentRatio(0);
    if (routeCoords.length > 0) {
      setVehiclePos(routeCoords[0]);
    } else {
      setVehiclePos(null);
    }
  }, [routeCoords]);

  // Tick animation
  useEffect(() => {
    if (routeCoords.length < 2) return;

    const interval = setInterval(() => {
      setSegmentRatio((prevRatio) => {
        const nextRatio = prevRatio + 0.05; // 20 frames per segment (2 seconds)
        if (nextRatio >= 1) {
          // Move to next segment
          setActiveSegment((prevSeg) => {
            const nextSeg = (prevSeg + 1) % (routeCoords.length - 1);
            
            // Update telemetry dynamically based on destination node type
            setTelemetry((prevTel) => {
              const isLast = nextSeg === 0;
              const nextSpeed = isLast ? 0 : 35 + Math.round(Math.random() * 20);
              let nextWater = prevTel.waterLevel - (10 + Math.round(Math.random() * 5));
              if (nextWater <= 10) nextWater = 100; // Refill at depot
              let nextMasks = prevTel.masksDelivered;
              let nextStatus = "En route";
              let stopName = "Depot";

              if (nextSeg === 0) {
                nextStatus = "Refilling & Restocking at Depot";
                stopName = "Depot";
              } else if (nextSeg === 1) {
                nextStatus = "Spraying active mist in hotspot zones";
                stopName = `${wardName} Centroid`;
              } else {
                const receptorIdx = nextSeg - 2;
                const receptor = receptors[receptorIdx];
                if (receptor) {
                  stopName = receptor.name;
                  nextStatus = receptor.type === "hospital" 
                    ? "Providing emergency filtration kits"
                    : "Delivering safety masks to school admins";
                  nextMasks += 50 + Math.round(Math.random() * 50);
                }
              }

              return {
                speed: nextSpeed,
                waterLevel: nextWater,
                masksDelivered: nextMasks,
                status: nextStatus,
                nextStop: stopName
              };
            });

            return nextSeg;
          });
          return 0;
        }
        return nextRatio;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [routeCoords, receptors, wardName]);

  // Interpolate vehicle position
  useEffect(() => {
    if (routeCoords.length < 2 || activeSegment >= routeCoords.length - 1) return;
    const start = routeCoords[activeSegment];
    const end = routeCoords[activeSegment + 1];
    if (!start || !end) return;

    const lat = start[0] + (end[0] - start[0]) * segmentRatio;
    const lon = start[1] + (end[1] - start[1]) * segmentRatio;
    setVehiclePos([lat, lon]);
  }, [activeSegment, segmentRatio, routeCoords]);

  const pathColor = getAQIColor(aqi);

  return (
    <>
      {/* ── Depot Marker ── */}
      <CircleMarker
        center={depotCoords}
        radius={10}
        pathOptions={{
          fillColor: "#3b82f6", // blue depot
          fillOpacity: 0.9,
          color: "#ffffff",
          weight: 2,
        }}
      >
        <Popup className="aether-popup">
          <div className="text-gray-100 bg-gray-900 p-2.5 rounded-lg text-xs space-y-1">
            <p className="font-bold text-blue-400">🚨 Municipal Dispatch Depot</p>
            <p className="text-gray-400">Mitigation assets stationed here (anti-smog trucks, filters)</p>
          </div>
        </Popup>
      </CircleMarker>

      {/* ── Active Mitigation Route ── */}
      {routeCoords.length > 1 && (
        <Polyline
          positions={routeCoords}
          pathOptions={{
            color: pathColor,
            weight: 3.5,
            opacity: 0.85,
            dashArray: "10, 15",
            className: "leaflet-ant-path", // custom CSS dash-offset animation
          }}
        />
      )}

      {/* ── Receptor Markers ── */}
      {receptors.map((r, i) => (
        <CircleMarker
          key={`receptor-${i}`}
          center={[r.lat, r.lon]}
          radius={7}
          pathOptions={{
            fillColor: r.type === "hospital" ? "#ef4444" : "#eab308", // red for hospital, yellow for school
            fillOpacity: 0.8,
            color: "#ffffff",
            weight: 1.5,
          }}
        >
          <Popup className="aether-popup">
            <div className="text-gray-100 bg-gray-900 p-2.5 rounded-lg text-xs space-y-1">
              <p className="font-bold text-gray-200">
                {r.type === "hospital" ? "🏥" : "🏫"} {r.name}
              </p>
              <p className="text-red-400 font-semibold text-[10px]">
                DOWNWIND RECEPTOR (High Exposure)
              </p>
              <p className="text-gray-400">
                Scheduled for anti-smog spraying & mask delivery.
              </p>
            </div>
          </Popup>
        </CircleMarker>
      ))}

      {/* ── Animated Dispatch Vehicle ── */}
      {vehiclePos && (
        <CircleMarker
          center={vehiclePos}
          radius={9}
          pathOptions={{
            fillColor: "#f97316", // orange
            fillOpacity: 1,
            color: "#ffffff",
            weight: 2,
          }}
        >
          <Popup className="aether-popup">
            <div className="text-gray-100 bg-gray-900 p-2.5 rounded-lg text-xs space-y-1 min-w-[230px]">
              <p className="font-bold text-orange-400 flex items-center gap-1.5">
                <span>🚚</span> Dispatch Fleet #3 (Active)
              </p>
              <p className="text-[10px] text-gray-300">
                Target Zone: <span className="font-semibold">{wardName}</span>
              </p>
              <p className="text-[10px] text-gray-300">
                Velocity: <span className="font-semibold text-emerald-400">{telemetry.speed} km/h</span>
              </p>
              <p className="text-[10px] text-gray-300">
                Mist Water Capacity: <span className="font-semibold text-blue-400">{telemetry.waterLevel}%</span>
              </p>
              <p className="text-[10px] text-gray-300">
                Masks Dispatched: <span className="font-semibold text-purple-400">{telemetry.masksDelivered} units</span>
              </p>
              <p className="text-[10px] text-gray-300">
                Fleet Action: <span className="text-yellow-400 font-semibold">{telemetry.status}</span>
              </p>
              <p className="text-[10px] text-gray-500 border-t border-white/5 pt-1 mt-1 font-mono">
                Heading towards: {telemetry.nextStop}
              </p>
            </div>
          </Popup>
        </CircleMarker>
      )}
    </>
  );
}
