/**
 * AETHER — API Client
 * Typed client for all backend endpoints.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface LiveAQIPoint {
  station_id: number;
  station_code: string;
  name: string;
  lat: number;
  lon: number;
  city: string;
  aqi: number | null;
  category: string | null;
  pm25: number | null;
  pm10: number | null;
  measured_at: string | null;
}

export interface HeatmapPoint {
  ward_id: number;
  ward_no: number;
  ward_name: string;
  lat: number;
  lon: number;
  aqi: number;
  category: string;
}

export interface WardDetail {
  id: number;
  ward_no: number;
  name: string;
  city: string;
  lat: number;
  lon: number;
  population: number | null;
  school_count: number;
  hospital_count: number;
  elderly_percentage: number;
  child_percentage: number;
  low_income_percentage: number;
  svi_index: number;
  aqi: number | null;
  category: string | null;
  primary_source: string | null;
  attribution: Record<string, number> | null;
  geojson: string | null;
}

export interface ForecastPoint {
  forecast_for: string;
  horizon_hours: number;
  predicted_aqi: number;
  predicted_category: string;
  confidence_lower: number | null;
  confidence_upper: number | null;
}

export interface ForecastResponse {
  ward_id: number;
  ward_name: string;
  ward_no: number;
  lat: number;
  lon: number;
  current_aqi: number;
  forecasts: ForecastPoint[];
}

export interface AttributionResponse {
  ward_id: number;
  ward_name: string;
  breakdown: Record<string, number>;
  primary_source: string;
  confidence: number;
  explanation: string;
}

export interface EnforcementAction {
  id: number;
  ward_id: number;
  ward_name: string;
  ward_no: number;
  ward_lat: number;
  ward_lon: number;
  city: string;
  priority_score: number;
  action_text: string;
  target_type: string;
  status: string;
  created_at: string;
}

export interface EnforcementStats {
  open: number;
  deployed: number;
  resolved: number;
  total: number;
}

export interface AdvisoryResponse {
  answer: string;
  aqi: number | null;
  category: string | null;
  language: string;
  session_id: string;
}

export interface CityInfo {
  id: string;
  name: string;
  lat: number;
  lon: number;
  station_count: number;
}

export interface CitizenReport {
  id: number;
  ward_id: number;
  city: string;
  reporter_name: string;
  report_type: string;
  description: string;
  severity: string;
  lat: number;
  lon: number;
  status: string;
  upvote_count: number;
  created_at: string;
  ward_name?: string;
}

export interface CitizenReportInput {
  ward_id: number;
  city: string;
  reporter_name?: string;
  report_type: string;
  description: string;
  severity?: string;
  lat: number;
  lon: number;
}

// ── Generic fetch helper ──────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const api = {
  health: () => apiFetch<{ status: string; version: string; city: string }>("/api/health"),

  cities: () => apiFetch<CityInfo[]>("/api/cities"),

  liveAQI: (city = "Kolkata") =>
    apiFetch<LiveAQIPoint[]>(`/api/aqi/live?city=${encodeURIComponent(city)}`),

  heatmap: (city = "Kolkata") =>
    apiFetch<HeatmapPoint[]>(`/api/aqi/heatmap?city=${encodeURIComponent(city)}`),

  wards: (city = "Kolkata") =>
    apiFetch<WardDetail[]>(`/api/wards?city=${encodeURIComponent(city)}`),

  wardDetail: (wardId: number) =>
    apiFetch<WardDetail>(`/api/wards/${wardId}`),

  forecast: (lat: number, lon: number, city = "Kolkata", hours = 72) =>
    apiFetch<ForecastResponse>(
      `/api/forecast?lat=${lat}&lon=${lon}&city=${encodeURIComponent(city)}&hours=${hours}`
    ),

  attribution: (wardId: number) =>
    apiFetch<AttributionResponse>(`/api/attribution/${wardId}`),

  enforcement: (city = "Kolkata", limit = 20, status = "open") =>
    apiFetch<EnforcementAction[]>(
      `/api/enforcement?city=${encodeURIComponent(city)}&limit=${limit}&status=${status}`
    ),

  updateEnforcementStatus: (actionId: number, status: string) =>
    apiFetch(`/api/enforcement/${actionId}/action`, {
      method: "POST",
      body: JSON.stringify({ status }),
    }),

  enforcementStats: (city = "Kolkata") =>
    apiFetch<EnforcementStats>(`/api/enforcement/stats?city=${encodeURIComponent(city)}`),

  recomputeEnforcement: (city = "Kolkata") =>
    apiFetch(`/api/enforcement/recompute?city=${encodeURIComponent(city)}`, { method: "POST" }),

  advisory: (question: string, language: string, lat?: number, lon?: number, sessionId?: string) =>
    apiFetch<AdvisoryResponse>("/api/advisory/ask", {
      method: "POST",
      body: JSON.stringify({ question, language, lat, lon, session_id: sessionId }),
    }),

  currentWeather: (city = "Kolkata") =>
    apiFetch<{ city: string; temp_c: number; humidity_pct: number; wind_speed: number; wind_dir: number }>(
      `/api/weather/current?city=${encodeURIComponent(city)}`
    ),

  briefing: (city = "Kolkata") =>
    apiFetch<{ city: string; briefing: string }>(`/api/advisory/briefing?city=${encodeURIComponent(city)}`),

  agentsSimulation: (wardId: number, customObjective?: string) =>
    apiFetch<{
      ward_id: number;
      ward_name: string;
      city: string;
      current_aqi: number;
      dialogue: { agent: string; message: string; avatar: string }[];
      decree: string;
    }>(`/api/agents/simulation?ward_id=${wardId}${customObjective ? `&custom_objective=${encodeURIComponent(customObjective)}` : ""}`, { method: "POST" }),

  simulationEvaluate: (wardId: number, trafficReduction: number, constructionHalt: boolean, industrialRestriction: number, windSpeed?: number, windDir?: number) =>
    apiFetch<{
      target_ward_id: number;
      city: string;
      wind_speed: number;
      wind_dir: number;
      results: {
        ward_id: number;
        ward_name: string;
        original_aqi: number;
        simulated_aqi: number;
        is_downwind: boolean;
        distance_km: number;
      }[];
    }>("/api/simulation/evaluate", {
      method: "POST",
      body: JSON.stringify({
        ward_id: wardId,
        traffic_reduction: trafficReduction,
        construction_halt: constructionHalt,
        industrial_restriction: industrialRestriction,
        wind_speed: windSpeed,
        wind_dir: windDir,
      }),
    }),

  simulationCalibrate: (city = "Kolkata") =>
    apiFetch<{
      r_squared: number;
      pearson_r: number;
      slope: number;
      intercept: number;
      points: {
        ward_name: string;
        ground_aqi: number;
        satellite_no2: number;
      }[];
    }>(`/api/simulation/calibrate?city=${encodeURIComponent(city)}`),

  broadcastAlerts: (actionId: number) =>
    apiFetch<{
      id: number;
      status: string;
      alerts_sent: number;
      alerts_confirmed: number;
      updated: boolean;
    }>(`/api/enforcement/${actionId}/broadcast`, { method: "POST" }),

  confirmAlertReceipt: (actionId: number) =>
    apiFetch<{
      id: number;
      alerts_sent: number;
      alerts_confirmed: number;
      ratio: number;
    }>(`/api/enforcement/${actionId}/alert/confirm`, { method: "POST" }),

  diagnostics: (city = "Kolkata") =>
    apiFetch<{
      city: string;
      score: number;
      alerts: {
        station_id: number;
        station_code: string;
        name: string;
        status: string;
        issue: string | null;
        last_seen: string | null;
        diagnostics: Record<string, string>;
      }[];
    }>(`/api/aqi/diagnostics?city=${encodeURIComponent(city)}`),

  citizenReports: (city = "Kolkata") =>
    apiFetch<CitizenReport[]>(`/api/reports?city=${encodeURIComponent(city)}`),

  createCitizenReport: (data: CitizenReportInput) =>
    apiFetch<CitizenReport>("/api/reports", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  upvoteCitizenReport: (reportId: number) =>
    apiFetch<CitizenReport>(`/api/reports/${reportId}/upvote`, {
      method: "POST",
    }),

  // ── Aliases for new role-specific pages ──────────────────────────────────

  /** Alias: getHeatmap (Commissioner / Citizen pages) */
  getHeatmap: (city = "Kolkata") =>
    apiFetch<{ points: HeatmapPoint[]; total_stations: number; city: string }>(
      `/api/aqi/heatmap?city=${encodeURIComponent(city)}`
    ).then(r => {
      // Normalize: heatmap endpoint may return array or {points:[...]}
      if (Array.isArray(r)) return { points: r, total_stations: (r as HeatmapPoint[]).length, city };
      return r;
    }),

  /** Alias: askAdvisory (Citizen page) */
  askAdvisory: (question: string, language = "en", lat?: number, lon?: number) =>
    apiFetch<AdvisoryResponse>("/api/advisory/ask", {
      method: "POST",
      body: JSON.stringify({ question, language, lat, lon }),
    }),

  // ── New v2 National Upgrade endpoints ─────────────────────────────────────

  /** Invoke an agent tool directly */
  invokeAgentTool: (toolName: string, wardId: number, extra?: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(
      `/api/agents/tools/invoke?tool_name=${encodeURIComponent(toolName)}&ward_id=${wardId}${
        extra
          ? Object.entries(extra)
              .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
              .join("")
          : ""
      }`,
      { method: "POST" }
    ),

  /** Causal impact analysis using synthetic control methodology */
  getCausalImpact: (wardId: number, interventionType = "combined_emergency", preDays = 30, postDays = 14) =>
    apiFetch<{
      ward_id: number;
      ward_name: string;
      causal_estimate: {
        average_treatment_effect_ugm3: number;
        confidence_interval_95: [number, number];
        p_value: number;
        statistically_significant: boolean;
        effect_magnitude: string;
      };
      time_series: { actual: number[]; counterfactual: number[]; dates: string[]; intervention_index: number };
      interpretation: string;
      health_impact: { hospital_admissions_prevented: number; economic_value_saved_lakhs_inr: number };
    }>(
      `/api/agents/causal-impact?ward_id=${wardId}&intervention_type=${encodeURIComponent(interventionType)}&pre_days=${preDays}&post_days=${postDays}`
    ),

  /** PMF source apportionment with 95% bootstrap CI */
  getPMFAttribution: (wardId: number) =>
    apiFetch<{
      ward_id: number;
      breakdown_with_ci: Record<string, { mean: number; ci_lower: number; ci_upper: number }>;
      method: string;
      primary_source: string;
    }>(`/api/attribution/${wardId}/pmf`),

  /** Ward knowledge graph (industries, violations, enforcement) */
  getWardKnowledgeGraph: (wardId: number) =>
    apiFetch<{
      ward_id: number;
      nodes: Record<string, unknown>[];
      edges: { source: string; target: string; relation: string }[];
      summary: { total_industries: number; total_violations: number };
    }>(`/api/agents/knowledge-graph?ward_id=${wardId}`),

  /** Top polluters ranked by PageRank */
  getPageRankPolluters: (city = "Kolkata") =>
    apiFetch<{
      city: string;
      top_polluters: {
        industry_id: string;
        name: string;
        pagerank_score?: number;
        influence_score?: number;
        permit_status: string;
        violations: number;
      }[];
      graph_stats: Record<string, unknown>;
    }>(`/api/agents/pagerank-polluters?city=${encodeURIComponent(city)}`),
};
