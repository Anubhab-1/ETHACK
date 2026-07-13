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

## ✅ Current Build Status (as of 2026-07-13)

### What Works End-to-End
| Feature | Status | Notes |
|---|---|---|
| Live AQI heatmap (Leaflet + IDW) | ✅ Live | CPCB feed with mock fallback |
| Ward-level drill-down sidebar | ✅ Live | 144 Kolkata + Delhi + Mumbai wards |
| Source attribution (NMF/PMF) | ✅ Live | 95% CI, 6-pollutant speciation |
| 72h forecast (ST-GCN → XGBoost) | ✅ Live | PyTorch fallback to XGBoost |
| Digital twin simulator | ✅ Live | Gaussian plume + PINN dispersion |
| Causal impact engine | ✅ Live | Synthetic control + permutation test |
| Multi-agent AI committee (5 agents) | ✅ Live | ReAct + constitutional coordinator |
| Enforcement priority queue | ✅ Live | OR-Tools VRP inspector routing |
| Multilingual advisory (EN/HI/BN) | ✅ Live | Chatbot UI; translation is template-based |
| RAG legal advisory | ✅ Live | TF-IDF over Air Act 1981, CPCB norms |
| Citizen incident reporting | ✅ Live | Upvotes, admin validation, ward mapping |
| Knowledge graph (NetworkX) | ✅ Live | Ward → Industry → Violation edges |
| Commissioner dashboard | ⚠️ Partial | HISTORICAL_CAUSAL & ROI data hardcoded (not from API) |
| Field officer mobile UI | ⚠️ Partial | GPS/camera tabs are UI-only, not wired to browser APIs |
| Sentinel-5P satellite layer | ⚠️ Fake | Animation only — no real NO₂ data fetched |
| Multilingual real translation | ⚠️ Fake | Text is hardcoded templates, not LLM-translated |
| VoiceController | ⚠️ Orphan | Component exists but not integrated in any page |
| Backend tests | ✅ 53 passing | `pytest aether/backend/tests/` |
| Frontend build | ✅ Passing | `npm run build` |
| API endpoints | ✅ 27/27 | `python audit.py` |

---

## 🔑 API Keys (Optional — App Works Without Them)

| Key | Source | What It Unlocks |
|---|---|---|
| `CPCB_API_KEY` | [data.gov.in](https://data.gov.in) | Live CPCB station readings (800+ stations) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | GPT-4o-mini briefings + advisory translation |

Set in `aether/backend/.env`.

---

## 🎯 Hackathon Judging Criteria

| Criteria | Weight | Current Score | Gap |
|---|---|---|---|
| **Innovation** | 25% | 7/10 | Real satellite data; trained (not synthetic) models |
| **Business Impact** | 25% | 6/10 | Response-time metric; connect Commissioner to real API |
| **Technical Excellence** | 20% | 7/10 | RMSE vs. baseline benchmark; real CPCB training data |
| **Scalability** | 15% | 8/10 | Add caching; async forecast queue |
| **User Experience** | 15% | 7/10 | Wire camera/GPS; real translation; remove orphan components |

---

## ⚠️ Critical Known Issues (Must Fix Before Demo)

### 1. XGBoost Risk Scorer is Trained on Fake Data
**File:** `backend/app/services/risk_scorer.py` — Line 122–125
The model is fit on 100 rows of `np.random.randn()`. Not a real trained model.
**Fix:** Train on real CPCB historical CSV (India AQI dataset, Kaggle). Report RMSE vs. persistence baseline in the UI.

### 2. Commissioner Dashboard Uses Hardcoded Constants
**File:** `frontend/app/commissioner/page.tsx` — `HISTORICAL_CAUSAL` and `ROI_INTERVENTIONS` arrays.
These are static hardcoded data, not fetched from the causal impact / simulation API.
**Fix:** Call `/api/causal-impact/{ward_id}` and `/api/simulation/{ward_id}` instead.

### 3. No Signal-to-Intervention Time Measurement
The hackathon evaluation explicitly asks for "demonstrated reduction in response time from signal to intervention." This is never measured or displayed.
**Fix:** Add `detected_at`, `ticket_created_at`, `acknowledged_at` timestamps to EnforcementAction. Display response time on Commissioner dashboard.

### 4. Satellite Layer is a UI-Only Animation
**File:** `frontend/app/dashboard/page.tsx` — Sentinel-5P scan is a CSS animation. No real NO₂ data.
**Fix:** Fetch cached Sentinel-5P NO₂ GeoTIFF from Copernicus (free) or NASA OMI and overlay as a real map layer.

### 5. Advisory Translation is Hardcoded
**File:** `frontend/app/advisory/page.tsx` — Bengali/Hindi text is in `QUICK_QUESTIONS` constants.
**Fix:** Wrap advisory LLM response with Google Translate API or LibreTranslate for real dynamic translation.

---

## 🛣️ Work Plan (Prioritized)

### 🔴 Do First — Critical (3–4 hours)
- [ ] Fix Commissioner: connect `HISTORICAL_CAUSAL` to `/api/causal-impact/{ward_id}`
- [ ] Add `detected_at` → `ticket_created_at` → `acknowledged_at` to EnforcementAction model + API
- [ ] Show "Signal → Intervention Time" metric card on Commissioner dashboard
- [ ] Add anomaly spike detection in APScheduler job → auto-create enforcement action

### 🟡 Do Next — High Impact (8–10 hours)
- [ ] Train XGBoost risk scorer on real CPCB CSV data (80/20 split, report RMSE vs. persistence)
- [ ] Integrate real Sentinel-5P archived NO₂ data as actual map layer (Copernicus free tier)
- [ ] Add real translation: wrap advisory LLM response with LibreTranslate (free, self-hostable)
- [ ] Wire `getUserMedia` (camera) + `geolocation` GPS to Field Officer evidence tab

### 🟢 Polish for Demo Day (2–4 hours)
- [ ] Remove or integrate `VoiceController.tsx` (currently an orphan component)
- [ ] Add forecast confidence interval ±1σ band to forecast chart
- [ ] Verify `docker compose up` works fully end-to-end with seeded data
- [ ] Add forecast RMSE vs. persistence table to Forecast page
- [ ] Add real GRAP stage checker (given city AQI → display mandatory GRAP actions)

### 🔵 Nice-to-Have (if time allows)
- [ ] WebSocket (`/ws/live`) to replace 5-minute polling for real-time AQI push
- [ ] Export enforcement notice as PDF (evidence_generator already builds text)
- [ ] Add Chennai, Bangalore as 4th and 5th cities
- [ ] CO₂ avoided calculator on Commissioner ROI panel

---

## 🎬 Recommended Demo Flow (for judges)

1. **Landing page** → shows live AQI orbs for 3 cities
2. **Dashboard** → select worst-AQI ward; emergency banner fires
3. **Digital Twin** → apply "Emergency Preset" → show AQI drop + ROI panel
4. **AI Briefing** → stream executive brief
5. **Agent Committee** → convene 5-agent deliberation; show decree
6. **Commissioner** → show response-time metric + causal proof of past intervention
7. **Enforcement** → show P1 action, deploy, broadcast alert
8. **Field Officer** → show task acknowledged from field

**Story arc:** *Detect → Diagnose → Simulate → Justify → Decide → Act → Prove.*

---

## 👥 Team

Built for the **ET AI Hackathon 2026** — Problem Statement 5: Urban Air Quality Management.

*AETHER — Because clean air is a right, not a privilege.*
