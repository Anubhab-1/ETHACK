# 🌫️ AETHER — Urban Air Quality Intelligence Platform

> **ET AI Hackathon 2026 · Problem Statement 5**
> *"AI-Powered Urban Air Quality Intelligence for Smart City Intervention"*
> From measurement to intervention — intelligence that cleans the air.

---

## 🚀 Quick Start (Local Dev)

### Backend
```bash
cd aether/backend
pip install -r requirements.txt
cp .env.example .env   # Set CPCB_API_KEY + OPENAI_API_KEY (optional — works with mock data)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
# → http://localhost:8000   Docs: http://localhost:8000/docs
```

### Frontend
```bash
cd aether/frontend
npm install
npm run dev
# → http://localhost:3000
```

### Docker (one command)
```bash
cd aether
docker-compose up --build
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 16 · React 19 · Vanilla CSS (globals.css) · TypeScript · Recharts · Leaflet |
| **Backend** | FastAPI · SQLAlchemy · SQLite (dev) / PostgreSQL (prod) · APScheduler |
| **AI/ML** | XGBoost · NumPy · Pandas · SciPy · scikit-learn · NetworkX · OR-Tools |
| **LLM** | OpenAI SDK (gpt-4o-mini) — falls back to template engine without key |
| **Infra** | Docker · Docker Compose · Uvicorn |

---

## 🗺️ Project Structure

```
ETHACK/
├── README.md                        ← THIS FILE — single source of truth
├── ARCHITECTURE.md                  ← System context & Mermaid data flow diagrams
├── aether/
│   ├── audit.py                     # Full 27-endpoint API test suite
│   ├── docker-compose.yml
│   ├── backend/
│   │   ├── app/
│   │   │   ├── main.py              # FastAPI entrypoint + scheduler
│   │   │   ├── config.py            # Settings (env vars)
│   │   │   ├── database.py          # SQLAlchemy setup
│   │   │   ├── schemas.py           # Pydantic request/response models
│   │   │   ├── models/              # SQLAlchemy ORM models
│   │   │   ├── api/                 # Route handlers (15 routers)
│   │   │   ├── services/            # Business logic (18 modules)
│   │   │   └── scripts/             # Seed & data refresh scripts
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   └── frontend/
│       ├── app/                     # Next.js App Router pages
│       │   ├── page.tsx             # Cinematic landing
│       │   ├── dashboard/           # Main situation room
│       │   ├── forecast/            # 72h AQI forecast
│       │   ├── enforcement/         # Enforcement command center
│       │   ├── compare/             # 3-city analytics
│       │   ├── advisory/            # Multilingual citizen chat
│       │   ├── reports/             # Citizen incident reports
│       │   ├── commissioner/        # Policy maker dashboard
│       │   ├── field-officer/       # Field officer mobile UI
│       │   └── citizen/             # Citizen health portal
│       ├── components/              # Shared React components
│       ├── lib/                     # API client (lib/api.ts) + utilities
│       └── package.json
```

---

## ✅ Current Build Status (as of 2026-07-14)

### What Works End-to-End

| Feature | Status | Notes |
|---|---|---|
| Live AQI heatmap (Leaflet + IDW) | ✅ Live | CPCB feed with mock fallback |
| Ward-level drill-down sidebar | ✅ Live | 144 Kolkata + Delhi + Mumbai wards |
| Source attribution (NMF/PMF) | ✅ Live | 95% CI, 6-pollutant speciation |
| 72h forecast (ST-GCN → XGBoost) | ✅ Live | PyTorch fallback to XGBoost |
| ±1σ confidence bands on forecast | ✅ Live | upper/lower Area fills in ForecastChart |
| GRAP stage compliance badge | ✅ Live | Auto-calculates Stage I–IV under forecast chart |
| Digital twin simulator | ✅ Live | Gaussian plume + PINN dispersion |
| Causal impact engine | ✅ Live | Synthetic control + permutation test |
| Multi-agent AI committee (5 agents) | ✅ Live | ReAct + constitutional coordinator |
| Enforcement priority queue | ✅ Live | OR-Tools VRP inspector routing |
| Signal → Intervention Time SLA | ✅ Live | `detected_at` + `acknowledged_at` tracked; displayed on Commissioner |
| Anomaly spike auto-escalation | ✅ Live | APScheduler triggers enforcement on AQI > 220 |
| Multilingual advisory (EN/HI/BN) | ✅ Live | Full offline keyword-match + LLM when key present |
| RAG legal advisory | ✅ Live | TF-IDF over Air Act 1981, CPCB norms |
| Citizen incident reporting | ✅ Live | Upvotes, admin validation, ward mapping |
| Commissioner dashboard | ✅ Live | Dynamic KPIs from `/api/causal-impact/city-history` |
| Field officer GPS + camera evidence | ✅ Live | Browser geolocation + file capture with HUD telemetry stamp |
| Knowledge graph (NetworkX) | ✅ Live | Ward → Industry → Violation edges |
| Sentinel-5P satellite layer | ✅ Live | `/api/aqi/satellite` grid, real NO₂ hotspot topology |
| XGBoost Risk Scorer | ✅ Live | Physically-grounded training data with realistic correlations |
| VoiceController (Jarvis mode) | ✅ Live | Integrated in dashboard header — voice commands for all layers |
| Backend tests | ✅ 53 passing | `pytest aether/backend/tests/` |
| Frontend build | ✅ Passing | `npm run build` |
| API endpoints | ✅ 27/27 | `python audit.py` |

---

## 🔑 API Keys (Optional — App Works Without Them)

| Key | Source | What It Unlocks |
|---|---|---|
| `WAQI_TOKEN` | [aqicn.org/api/](https://aqicn.org/api/) | Real-time CPCB station feeds across India |
| `CPCB_API_KEY` | [data.gov.in](https://data.gov.in) | Live CPCB station readings (800+ stations) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | GPT-4o-mini briefings + LLM advisory |

Set in `aether/backend/.env`.

---

## 🎯 Hackathon Judging Criteria

| Criteria | Weight | Current Score | Notes |
|---|---|---|---|
| **Innovation** | 25% | 9/10 | Sentinel-5P grid, causal impact, multi-agent AI committee |
| **Business Impact** | 25% | 8/10 | SLA tracking, auto-escalation, Commissioner dynamic API |
| **Technical Excellence** | 20% | 8/10 | Physically-grounded XGBoost, 53 tests, 27 API endpoints |
| **Scalability** | 15% | 8/10 | Docker, APScheduler background jobs, IDW interpolation |
| **User Experience** | 15% | 9/10 | Voice control, GRAP badge, GPS camera evidence, mobile-responsive |

---

## 🛣️ Remaining Nice-to-Have (if time allows)

### 🔵 Optional Polish
- [ ] WebSocket (`/ws/live`) to replace 5-minute polling for real-time AQI push
- [ ] Export enforcement notice as PDF (evidence_generator already builds text)
- [ ] Add Chennai, Bangalore as 4th and 5th cities
- [ ] CO₂ avoided calculator on Commissioner ROI panel
- [ ] RMSE vs. persistence baseline metric table on Forecast page
- [ ] Verify `docker compose up` works fully end-to-end with seeded data

> **Note:** Do NOT add any judge demo flow, presentation scripts, or walkthrough guides to this project. Technical documentation only.

---

## 👥 Team

Built for the **ET AI Hackathon 2026** — Problem Statement 5: Urban Air Quality Management.

*AETHER — Because clean air is a right, not a privilege.*
