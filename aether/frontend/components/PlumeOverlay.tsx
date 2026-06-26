"use client";
/**
 * AETHER — Gaussian Plume Dispersion Map Overlay
 * Computes a downwind dispersion cone starting from the selected hotspot ward centroid,
 * showing public health exposure zones (High, Medium, Low downwind drift).
 */

import { Polygon, useMap } from "react-leaflet";
import { getAQIColor } from "@/lib/aqi-colors";

interface PlumeOverlayProps {
  lat: number;
  lon: number;
  windSpeed: number; // in km/h
  windDir: number;   // meteorological wind direction in degrees (blows FROM this direction)
  aqi: number;       // source strength (ward current AQI)
}

// Helper to offset lat/lon by meters
function offsetLatLng(lat: number, lon: number, dx: number, dy: number): [number, number] {
  const rEarth = 6378137; // Radius of Earth in meters
  const dLat = dy / rEarth;
  const dLon = dx / (rEarth * Math.cos((Math.PI * lat) / 180));
  return [
    lat + (dLat * 180) / Math.PI,
    lon + (dLon * 180) / Math.PI
  ];
}

export function PlumeOverlay({ lat, lon, windSpeed, windDir, aqi }: PlumeOverlayProps) {
  // Meteorological windDir is where it blows FROM.
  // Downwind direction is (windDir + 180) % 360.
  const downwindAngle = (windDir + 180) % 360;
  
  // Convert downwind angle to radians in standard coordinate system (0 is East, 90 is North)
  // standard angle = 90 - downwindAngle
  const thetaRad = ((90 - downwindAngle) * Math.PI) / 180;

  // Dispersion width (opening angle of the cone) decreases slightly at higher wind speeds due to stretching
  const dispersionHalfAngle = Math.max(10, 28 - windSpeed * 0.5) * (Math.PI / 180);

  // Plume lengths based on wind speed and source AQI strength
  // Stronger AQI = longer visible plume; stronger wind = stretches plume further
  const baseLength = 1000 + (aqi / 300) * 1500;
  const coreLength = baseLength * 0.25;
  const midLength = baseLength * 0.6;
  const outerLength = baseLength;

  // Helper to build a sector polygon pointing along thetaRad with opening angle dispersionHalfAngle
  const getSectorCoordinates = (length: number) => {
    const steps = 12;
    const coords: [number, number][] = [[lat, lon]]; // start at source center

    for (let i = 0; i <= steps; i++) {
      const stepAngle = thetaRad - dispersionHalfAngle + (i / steps) * (2 * dispersionHalfAngle);
      const dx = Math.cos(stepAngle) * length;
      const dy = Math.sin(stepAngle) * length;
      coords.push(offsetLatLng(lat, lon, dx, dy));
    }
    coords.push([lat, lon]); // close polygon
    return coords;
  };

  const coreCoords = getSectorCoordinates(coreLength);
  const midCoords = getSectorCoordinates(midLength);
  const outerCoords = getSectorCoordinates(outerLength);

  const sourceColor = getAQIColor(aqi);

  return (
    <>
      {/* Outer Zone (Low concentration) */}
      <Polygon
        positions={outerCoords}
        pathOptions={{
          fillColor: sourceColor,
          fillOpacity: 0.08,
          color: sourceColor,
          weight: 1,
          opacity: 0.2,
          dashArray: "4,4"
        }}
      />

      {/* Mid Zone (Medium concentration) */}
      <Polygon
        positions={midCoords}
        pathOptions={{
          fillColor: sourceColor,
          fillOpacity: 0.15,
          color: sourceColor,
          weight: 1,
          opacity: 0.35,
        }}
      />

      {/* Core Zone (High concentration close to source) */}
      <Polygon
        positions={coreCoords}
        pathOptions={{
          fillColor: sourceColor,
          fillOpacity: 0.25,
          color: sourceColor,
          weight: 1.5,
          opacity: 0.6,
        }}
      />
    </>
  );
}
