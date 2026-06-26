# AETHER — Project Status & Future Scope
## ET AI Hackathon 2026 | Problem Statement 5

> [!NOTE]
> This document provides a comprehensive audit of the **AETHER Urban Air Quality Intelligence Platform**, summarizing what has been built, what remains of the original scope, and a curated list of high-impact "hackathon-winning" extras to set the project apart.

---

## 📊 Development Progress at a Glance

```
Backend Foundation & Services   ████████████████████ 100%
API Layer & Routing             ████████████████████ 100%
Database & Data Pipelines       ████████████████████ 100%
Core Frontend UI / Situation    ████████████████░░░░  80%
Advanced ML & Background Jobs   ████████░░░░░░░░░░░░  40%
```

---

## 🟢 1. What is Built (Current State)

The foundation, databases, background mathematical models, and the core frontend interactive dashboard are complete and running. 

### 🖥️ Backend Architecture (`/backend`)
FastAPI backend fully written in Python 3.8+ compatible type-hinting:
- **Database Schema (`models.py`, `schemas.py`)**: 
  - Relational SQLite database using SQLAlchemy 2.0.
  - Schemas map out `Station`, `Reading` (hourly timeseries), `Ward` (geospatial census metrics), `Forecast` (ML predictions), `Attribution` (pollution sources), `EnforcementAction` (audit trail), and `AdvisoryLog` (chatbot history).
- **Live Ingestion Engines (`services/fetch_cpcb.py`, `fetch_weather.py`)**:
  - Real CPCB sensor data fetcher with automatic caching and failover seed data.
  - Real-time weather parameters (wind speed/direction, temperature, humidity, pressure) pulled dynamically via the Open-Meteo API.
- **Geospatial Ward Attribution (`services/attributor.py`)**:
  - Custom heuristic model that estimates percentage contributions from: **Traffic**, **Industrial**, **Construction**, **Biomass**, and **Residential** sources.
  - Computes percentages dynamically based on a ward's OpenStreetMap land-use profile, road density, active construction sites, wind directions (e.g., blowing pollutants downwind), and temporal parameters (e.g., rush hour).
- **Hyperlocal Forecaster (`services/forecaster.py`)**:
  - Integrates an XGBoost framework for predictive AQI (24h, 48h, 72h targets) using historical lags, wind vectors, and seasonal markers. 
  - Provides a statistical moving-average fallback if the model is not yet trained.
- **Enforcement Priority Engine (`services/enforcement_scorer.py`)**:
  - Dynamically scores and ranks wards (0–100) based on target population exposure, presence of schools/hospitals, AQI severity, and downwind vulnerability vectors.
  - Generates custom action descriptions (e.g., "Deploy anti-smog guns to Ward 58 due to upwind dust dispersal").
- **Interactive API Endpoints (`api/`)**:
  - `/api/health` — Full diagnostic health endpoint.
  - `/api/aqi/live` — Live CPCB station metrics per city.
  - `/api/aqi/heatmap` — Calculates a live spatial grid across 144 Kolkata wards using IDW (Inverse Distance Weighting) interpolation from active sensors.
  - `/api/forecast` — 72-hour predict values.
  - `/api/attribution/{ward_id}` — Live source breakdown.
  - `/api/advisory/ask` — Multilingual chatbot endpoint (RAG-ready, templated fallback) supporting English, Bengali, and Hindi.

### 🌐 Frontend Interface (`/frontend`)
Modern, high-performance web experience built with Next.js (App Router), React, Tailwind CSS:
- **Live Situation Room (`/dashboard`)**:
  - Full-width interactive Map (`AetherMap.tsx` using Leaflet and Dark Matter CartoDB tiles).
  - Renders all 144 Kolkata wards with color-coded AQI choropleth zones and real-time station markers.
  - Interactive right sidebar loads dynamically on ward click: shows CPCB AQI gauges, source attribution progress bars (`SourceBreakdown.tsx`), 72h forecasts (`ForecastChart.tsx` using Recharts), and immediate actions.
  - Interactive header and live scrolling ticker updating current enforcement deployments.
- **Action Control Center (`/enforcement`)**:
  - A real-time priority list showing active, deployed, and resolved environmental issues. 
  - Allows administrative users to toggle status (e.g., "Deploy Inspectors" or "Mark Resolved") with instant visual updates.
- **Citizen Health Advisor (`/advisory`)**:
  - Multi-language support (English, বাংলা, हिन्दी).
  - Quick-action buttons (e.g., "Safe for elderly?", "Outdoor exercises?") that generate targeted responses based on current ward pollution levels.

---

## 🟡 2. What is Left to Build (Planned Scope)

These items are part of the original project proposal but are not yet implemented or completed:

1. **`app/forecast/page.tsx` (Deep Dive Forecast Page)**:
   - A dedicated page to allow users to search for any ward/station and view an expanded hour-by-hour forecast grid.
   - Interactive toggles to export predictions as JSON/CSV or images for government reporting.
2. **`app/compare/page.tsx` (Multi-City Compare)**:
   - A comparative page highlighting Delhi, Mumbai, and Kolkata side-by-side.
   - Allows users to compare intervention history, average AQI trends, and effectiveness indices.
3. **ML Training Endpoint (`POST /api/forecast/train`)**:
   - An API handler that takes stored reading logs, builds the XGBoost feature matrix, trains the regressor, and saves the weights to disk (`xgboost_aqi_model.json`).
4. **APScheduler Background Jobs**:
   - Setting up a background thread in FastAPI (`main.py`) to run the CPCB ingestion and forecast refresh every hour automatically.
5. **Sentinel-5P NO₂ Map Overlay**:
   - Adding a toggle on the map component to overlay satellite tropospheric NO₂ imagery (can be mocked as a secondary raster tile service or built with Google Earth Engine API).
6. **Docker Containers**:
   - Generating standard `Dockerfile` files for frontend and backend + a unified `docker-compose.yml` for single-command local deployments.

---

## 🚀 3. Extra Ideas (Outside the Original Plan)
*Add these features to make AETHER stand out as a premier hackathon submission.*

### 🛠️ 3.1 Digital Twin Mode (Intervention Simulator)
*Make the dashboard interactive for planners by simulating policies before enacting them.*
* **Concept:** Add a **"Simulate Intervention"** panel in the dashboard sidebar.
* **Mechanism:** Let planners toggle scenarios (e.g., *"Halt construction in Ward 58"* or *"Restrict industrial emissions by 50%"*).
* **Impact:** The frontend immediately sends the mock overrides to `/api/attribution/{ward_id}`. The backend recalculates the ward's AQI and downwind impact, dynamically lowering the predicted 24h/48h AQI. The charts and maps update in real-time to show the projected success of the policy.

### 🛰️ 3.2 Dynamic Wind-Dispersion Overlay
*Show users where the air is blowing.*
* **Concept:** Overlay vector particle animations on the dark Leaflet map showing real-time wind speed and direction.
* **Mechanism:** Use wind data from the Open-Meteo API. Render animated canvas particles over the map (using libraries like `leaflet-velocity` or custom canvas rendering) to visually link hotspot wards to downwind vulnerability flags.

### 🚨 3.3 Automated Emergency Alert System (SMS/WhatsApp Mock)
*Close the loop from diagnosis to citizen notification.*
* **Concept:** In the `/enforcement` dashboard, add an **"Issue Alert"** button for wards with Severe AQI.
* **Mechanism:** Clicking this triggers an endpoint that "sends" emergency health alerts (rendered as simulated SMS/WhatsApp mock cards in the UI or utilizing a free service like Twilio).
* **Impact:** Demonstrates an end-to-end municipal warning protocol targeting school administrators and hospitals in the affected radius.

### 📊 3.4 Vulnerability-Weighted Priority Index (Social Demographics)
*Protect the people who need it most.*
* **Concept:** Incorporate socio-demographic indicators into the enforcement ranking calculation.
* **Mechanism:** Add demographic data to the `wards` table:
  - Percentage of population over 65
  - Percentage of population under 5
  - Density of low-income housing
* **Impact:** Wards with high concentrations of vulnerable residents will rank higher for intervention than industrial parks with low population density, showcasing empathetic, data-driven AI routing.

### 🖨️ 3.5 Municipal Dispatch Generator (PDF Export)
*Convert digital data into field action.*
* **Concept:** Allow inspectors to print/export specific actions from the Enforcement Queue.
* **Mechanism:** Clicking "Export Dispatch Order" generates a PDF (using `jsPDF` or backend library) containing a mini map snippet, current ward AQI, source attribution breakdown, and checklist instructions.
* **Impact:** Bridging the gap between software engineers and municipal field personnel.

### 🔍 3.6 Sensor Diagnostic & Outlier Detection
*Keep the data clean.*
* **Concept:** A backend script that detects sensor failures (e.g., flatlines, stuck values, impossible jumps) using simple statistical checks.
* **Mechanism:** Add a dynamic health indicator for each station on the map (Green = Active, Yellow = Warning/Outlier detected, Red = Offline).
* **Impact:** Highly valued by municipal engineers who spend hours identifying malfunctioning monitoring hardware.

---

## 🗺️ 4. Immediate Next Steps

Choose one of these paths to advance the build:

* **Option A:** Complete the planned pages (`/forecast` and `/compare`) to round out the core front-end scope.
* **Option B:** Build the XGBoost model training script (`retrain.py`) and background scheduler to automate backend execution.
* **Option C:** Implement the **Digital Twin Policy Simulator** to maximize presentation points.
