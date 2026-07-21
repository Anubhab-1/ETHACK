# AETHER 9.5+ Roadmap

## Goal
Make AETHER a genuinely judge-grade product by eliminating synthetic behavior from the core experience and replacing it with real data pipelines, real model training, real persistence, and real operational workflows.

## Non-negotiable rule
No core feature may rely on mock data, seeded demo values, or fallback-generated output when a real source is available. If a data source is missing, the system must show an explicit unavailable/failed state rather than inventing results.

---

## Phase 1 — Remove all fake-data paths

### 1. Replace seeded demo content
- Remove or gate the bootstrap demo reports and synthetic citizen content in [aether/backend/app/main.py](aether/backend/app/main.py).
- Replace them with real ingestion from public complaint feeds or a connected municipal reporting system.
- Ensure the app can start without any seeded content and still show a healthy empty state.

### 2. Replace fallback fetchers with real ingestion
- Harden [aether/backend/app/services/fetch_cpcb.py](aether/backend/app/services/fetch_cpcb.py) so CPCB/WAQI data is the primary path and any failure is surfaced clearly.
- Replace heuristic or simulated verification flows in [aether/backend/app/services/fetch_verification.py](aether/backend/app/services/fetch_verification.py) with real verification sources such as OpenAQ, public station feeds, or municipal API integrations.
- Remove the current fallback-style logic from [aether/backend/app/services/satellite.py](aether/backend/app/services/satellite.py) and connect to verifiable Sentinel-5P/TROPOMI data or a documented external data provider.

### 3. Make the UI honest
- Remove any UI labels or states that imply live data when the backend is actually using fallback behavior.
- Show explicit status indicators: Live, Stale, Missing, Error, or Unavailable.
- In [aether/frontend/app/dashboard/page.tsx](aether/frontend/app/dashboard/page.tsx) and [aether/frontend/app/forecast/page.tsx](aether/frontend/app/forecast/page.tsx), ensure every chart and KPI has a provenance badge and data freshness timestamp.

---

## Phase 2 — Build a real production-grade data backbone

### 1. Data quality and freshness pipeline
- Add ingestion health checks for every external source.
- Track last successful pull time, record count, and quality score per source.
- Expose a data health dashboard for city and station-level status.

### 2. Persistent event store
- Store every ingestion event, anomaly detection result, and action decision in the database.
- Add audit tables for forecasting runs, enforcement actions, citizen reports, and agent deliberations.
- This becomes the evidence layer for judges and operators.

### 3. Real geospatial and station mapping
- Connect ward and station geometry to authoritative boundaries or public GIS data.
- Replace any approximate or hard-coded ward placement where possible.
- Make the map view reflect actual station and ward relationships rather than heuristic overlays.

---

## Phase 3 — Make the models genuinely real

### 1. Train on real historical data
- Replace placeholder forecasting behavior in [aether/backend/app/api/forecast_advanced.py](aether/backend/app/api/forecast_advanced.py) and [aether/backend/app/services/forecaster.py](aether/backend/app/services/forecaster.py) with models trained on real historical AQI, weather, and station data.
- Store trained model artifacts under [aether/backend/models](aether/backend/models) with version metadata and evaluation metrics.
- Report MAE, RMSE, and confidence calibration for every city.

### 2. Use real risk scoring inputs
- Replace heuristic risk scoring in [aether/backend/app/services/risk_scorer.py](aether/backend/app/services/risk_scoring.py) with features derived from live station data and intervention history.
- Add explainability outputs such as SHAP or feature contribution summaries that are generated from real model runs.

### 3. Model governance
- Add a model registry endpoint to show which model version is active.
- Add retraining triggers and rollback support.
- Every forecast should carry model version, training time, and data freshness.

---

## Phase 4 — Make operations real, not simulated

### 1. Real enforcement workflow
- Implement a full state machine: detected → queued → dispatched → evidence collected → notice generated → closed.
- Store every transition and responsible actor in the database.
- Connect the flow to the field officer portal in [aether/frontend/app/field-officer/page.tsx](aether/frontend/app/field-officer/page.tsx).

### 2. Real agent deliberation evidence
- Persist all committee runs from [aether/backend/app/api/agents.py](aether/backend/app/api/agents.py) and [aether/backend/app/api/agents_advanced.py](aether/backend/app/api/agents_advanced.py).
- Each recommendation should cite the evidence used: station readings, risk metrics, legal context, and prior outcomes.
- Add a commissioner review screen for audit history.

### 3. Messaging and alerting with real delivery paths
- Replace simulated notifier paths in [aether/backend/app/services/notifier.py](aether/backend/app/services/notifier.py) and [aether/backend/app/services/citizen_notifier.py](aether/backend/app/services/citizen_notifier.py) with real integrations or a documented operational fallback that is clearly marked.
- If SMS/email is unavailable, show a failed delivery state rather than a fake success.

---

## Phase 5 — Judge-grade quality bar

### 1. Reliability
- Add CI checks for backend tests, frontend build, linting, and import safety.
- Add end-to-end smoke tests for the core journeys: forecast, citizen report, enforcement dispatch, and commissioner audit.

### 2. Observability
- Add request tracing, metrics, and structured logs.
- Add error budgets and alerting for ingestion failures and model drift.

### 3. UX polish
- Every page should explain what the user is looking at, where the data came from, and how fresh it is.
- Remove “demo mode” language and replace it with concrete operational states.

---

## 30-day execution plan

### Week 1: Data integrity
- Audit all fallback paths and mark them as blockers.
- Connect primary public data sources for AQI, weather, and satellite data.
- Add data freshness and source provenance tracking.

### Week 2: Model and workflow hardening
- Train and version real forecasting and risk models.
- Persist enforcement and agent decisions with evidence.
- Wire the field officer and commissioner flows to the real backend.

### Week 3: Reliability and polish
- Add tests, CI, observability, and deployment health checks.
- Remove remaining demo-only UI states.
- Run a full end-to-end walkthrough against live or near-live data.

---

## Success criteria for 9.5+
- No core workflow depends on synthetic or seeded data.
- All major features can be demonstrated with real API-backed data.
- Forecasts, risk scores, and enforcement recommendations are traceable to source evidence.
- The app feels operational, not like a slide deck or demo container.
- Judges can clearly see that the product is built for real city operations, not a mock hackathon prototype.

---

## Immediate blockers to tackle first
- [ ] Remove seeded demo reports from [aether/backend/app/main.py](aether/backend/app/main.py)
- [ ] Replace fallback AQI fetch behavior in [aether/backend/app/services/fetch_cpcb.py](aether/backend/app/services/fetch_cpcb.py)
- [ ] Replace simulated verification in [aether/backend/app/services/fetch_verification.py](aether/backend/app/services/fetch_verification.py)
- [ ] Remove heuristic forecast fallback paths in [aether/backend/app/api/forecast_advanced.py](aether/backend/app/api/forecast_advanced.py)
- [ ] Replace simulated notifications in [aether/backend/app/services/notifier.py](aether/backend/app/services/notifier.py)

---

## Bottom line
To reach 9.5+, the project must stop acting like a polished demo and start behaving like a real operational system. The focus is simple: connect real data, store real evidence, train real models, and expose real outcomes.


