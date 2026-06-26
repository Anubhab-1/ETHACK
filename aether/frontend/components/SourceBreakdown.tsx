"use client";
/**
 * AETHER — Source Attribution Breakdown Component
 * Horizontal bar chart showing pollution source percentages.
 */

import { SOURCE_COLORS, SOURCE_ICONS, SOURCE_LABELS } from "@/lib/aqi-colors";

interface SourceBreakdownProps {
  breakdown: Record<string, number>;
  primarySource: string;
  confidence: number;
  explanation?: string;
}

export function SourceBreakdown({
  breakdown,
  primarySource,
  confidence,
  explanation,
}: SourceBreakdownProps) {
  // Sort by percentage desc
  const sorted = Object.entries(breakdown).sort(([, a], [, b]) => b - a);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Pollution Sources
        </h4>
        <span className="text-xs text-gray-500">
          {Math.round(confidence * 100)}% confidence
        </span>
      </div>

      <div className="space-y-2">
        {sorted.map(([source, pct]) => (
          <div key={source} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-gray-300">
                <span>{SOURCE_ICONS[source] || "●"}</span>
                <span>{SOURCE_LABELS[source] || source}</span>
                {source === primarySource && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase"
                    style={{ backgroundColor: SOURCE_COLORS[source] + "33", color: SOURCE_COLORS[source] }}>
                    Primary
                  </span>
                )}
              </span>
              <span className="font-semibold" style={{ color: SOURCE_COLORS[source] || "#9ca3af" }}>
                {pct.toFixed(1)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  backgroundColor: SOURCE_COLORS[source] || "#9ca3af",
                  boxShadow: source === primarySource ? `0 0 8px ${SOURCE_COLORS[source]}88` : "none",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {explanation && (
        <p className="text-xs text-gray-400 leading-relaxed mt-2 p-2 rounded-lg bg-white/5 border border-white/10">
          {explanation}
        </p>
      )}
    </div>
  );
}
