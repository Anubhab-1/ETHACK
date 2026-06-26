"use client";
/**
 * AETHER — Windy-Style Wind Particle Canvas Overlay
 * Custom Leaflet overlay that renders animated particles showing current wind vector.
 */

import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";

interface WindOverlayProps {
  windSpeed: number; // in km/h
  windDir: number;   // in degrees (meteorological, from where it blows)
}

export function WindOverlay({ windSpeed, windDir }: WindOverlayProps) {
  const map = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    // Get the Leaflet map container to append our canvas
    const mapContainer = map.getContainer();
    const canvas = document.createElement("canvas");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "400"; // display over map tiles, under markers
    mapContainer.appendChild(canvas);
    canvasRef.current = canvas;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = mapContainer.clientWidth);
    let height = (canvas.height = mapContainer.clientHeight);

    // Particle pool
    const PARTICLE_COUNT = 80;
    const particles: Array<{
      x: number;
      y: number;
      age: number;
      maxAge: number;
      speedModifier: number;
    }> = [];

    const initParticle = (index: number, randomStart = false) => {
      particles[index] = {
        x: randomStart ? Math.random() * width : Math.random() * width,
        y: randomStart ? Math.random() * height : Math.random() * height,
        age: randomStart ? Math.floor(Math.random() * 80) : 0,
        maxAge: 40 + Math.floor(Math.random() * 60),
        speedModifier: 0.5 + Math.random() * 0.8,
      };
    };

    // Initialize all particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      initParticle(i, true);
    }

    // Convert meteorological wind direction (0=N, 90=E, 180=S, 270=W) to vector angle in radians
    // Meteorological: N (0 deg) blows from North towards South (90 deg in screen space / down)
    const angleRad = ((270 - windDir) * Math.PI) / 180;
    
    // Scale speed to responsive movement velocity
    // E.g. 10 km/h wind speed = ~1.2 pixels per frame
    const baseVelocity = Math.max(0.4, windSpeed * 0.08);
    const vx = Math.cos(angleRad) * baseVelocity;
    const vy = Math.sin(angleRad) * baseVelocity;

    let animationFrameId: number;

    const animate = () => {
      // Fade out previous particles using destination-out to preserve transparent background
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, width, height);

      // Switch back to normal drawing mode for new particles
      ctx.globalCompositeOperation = "source-over";

      // Draw wind vector flow
      ctx.strokeStyle = "rgba(249, 115, 22, 0.45)"; // Tailwind orange-500 transparent
      ctx.lineWidth = 1.2;
      ctx.lineCap = "round";

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p = particles[i];
        
        // Compute turbulence/noise based on coordinates
        const turbulence = Math.sin(p.x * 0.01) * Math.cos(p.y * 0.01) * 0.25;
        const curAngle = angleRad + turbulence;
        
        const curVx = Math.cos(curAngle) * baseVelocity * p.speedModifier;
        const curVy = Math.sin(curAngle) * baseVelocity * p.speedModifier;

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + curVx * 1.5, p.y + curVy * 1.5);
        ctx.stroke();

        // Update position
        p.x += curVx;
        p.y += curVy;
        p.age++;

        // Reset if out of bounds or age exceeded
        if (
          p.x < 0 ||
          p.x > width ||
          p.y < 0 ||
          p.y > height ||
          p.age >= p.maxAge
        ) {
          initParticle(i, false);
          // Jitter starting point to edges to keep flow continuous
          if (Math.abs(vx) > Math.abs(vy)) {
            // More horizontal flow
            particles[i].x = vx > 0 ? 0 : width;
            particles[i].y = Math.random() * height;
          } else {
            // More vertical flow
            particles[i].x = Math.random() * width;
            particles[i].y = vy > 0 ? 0 : height;
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    // Map listeners to handle resizing and panning
    const handleResizeAndMove = () => {
      if (!canvas) return;
      width = canvas.width = mapContainer.clientWidth;
      height = canvas.height = mapContainer.clientHeight;
      ctx.fillStyle = "rgba(3, 7, 18, 1)";
      ctx.fillRect(0, 0, width, height);
    };

    map.on("move", handleResizeAndMove);
    map.on("resize", handleResizeAndMove);

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      map.off("move", handleResizeAndMove);
      map.off("resize", handleResizeAndMove);
      if (mapContainer.contains(canvas)) {
        mapContainer.removeChild(canvas);
      }
    };
  }, [map, windSpeed, windDir]);

  return null;
}
