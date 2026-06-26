# 🌫️ AETHER — Urban Air Quality Intelligence Platform

> **ET AI Hackathon 2026 · Problem Statement 5**
> *From measurement to intervention — intelligence that cleans the air.*

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green)](https://fastapi.tiangolo.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black)](https://nextjs.org/)
[![Python](https://img.shields.io/badge/Python-3.8+-blue)](https://python.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

---

## 🚀 What is AETHER?

AETHER is a **real-time, AI-driven urban air quality intelligence platform** designed for city commissioners and environmental agencies. It transforms raw CPCB sensor data into actionable intelligence — from identifying pollution hotspots to auto-deploying enforcement teams and broadcasting multilingual health alerts to citizens.

### Core Features

| Module | Description |
|--------|-------------|
| 🗺️ **Live AQI Situation Room** | Leaflet heatmap across 144 Kolkata wards + 2 cities, powered by IDW interpolation |
| 🤖 **Multi-Agent AI Committee** | 4 specialist AI agents debate and issue policy decrees for each ward |
| 🧪 **Digital Twin Simulator** | Gaussian plume dispersion model — simulate traffic bans, construction halts before enacting |
| 📡 **72h LSTM Forecast** | XGBoost-based predictions with seasonal + temporal features |
| 🚨 **Enforcement Command Center** | Auto-priority scoring → deploy → broadcast SMS/WhatsApp/IVR alerts |
| 🛰️ **Satellite Calibration** | Sentinel-5P NO₂ ground-truth correlation curves |
| 💬 **Multilingual Advisory** | Citizen health chatbot in English, Bengali (বাংলা) and Hindi (हिन्दी) |
| 📊 **Sensor Diagnostics** | Real-time station health monitoring with anomaly detection |

---

## 🏗️ Architecture

```
AETHER Platform
├── Frontend  (Next.js 16 + Tailwind CSS v4)
│   ├── /              — Cinematic landing page with live AQI orbs
│   ├── /dashboard     — Full Situation Room (Map + Digital Twin + AI)
│   ├── /forecast      — 72h ward-level predictions
│   ├── /enforcement   — Command Center (Prioritize → Deploy → Broadcast)
│   ├── /compare       — 3-city analytics dashboard
│   ├── /advisory      — Multilingual citizen health advisor
│   └── /reports       — Citizen pollution reports
│
├── Backend   (FastAPI + SQLAlchemy + SQLite/PostgreSQL)
│   ├── /api/health         — System diagnostics
│   ├── /api/aqi            — Live CPCB station data + heatmap
│   ├── /api/forecast       — XGBoost 72h predictions
│   ├── /api/attribution    — Source breakdown (traffic/industrial/etc.)
│   ├── /api/advisory       — NLP advisory + executive briefing
│   ├── /api/agents         — Multi-agent committee simulation
│   ├── /api/simulation     — Gaussian plume digital twin
│   ├── /api/enforcement    — Priority scoring + dispatch + broadcast
│   └── /api/diagnostics    — Sensor health + anomaly detection
│
└── Data Layer (SQLite dev / PostgreSQL prod)
    ├── stations, wards, readings tables
    ├── enforcement_actions table
    └── Spatial indexing for ward lookup
```

---

## ⚡ Quick Start

### Prerequisites
- Python 3.8+
- Node.js 18+

### 1. Backend

```bash
cd aether/backend
pip install -r requirements.txt

# (Optional) Add API keys for live data
cp .env.example .env
# Edit .env → set CPCB_API_KEY and OPENAI_API_KEY
# App works perfectly WITHOUT keys using intelligent mock data

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Backend starts at **http://localhost:8000**  
Interactive API docs: **http://localhost:8000/docs**

### 2. Frontend

```bash
cd aether/frontend
npm install
npm run dev
```

Frontend starts at **http://localhost:3000**

### 3. Docker (single command)

```bash
cd aether
docker-compose up --build
```

---

## 🔑 API Keys (Optional)

The platform works **fully offline with realistic mock data**. To enable live production feeds:

| Key | Source | Feature Unlocked |
|-----|--------|-----------------|
| `CPCB_API_KEY` | [data.gov.in](https://data.gov.in) → Sign up → CPCB AQI | Live sensor readings from 800+ stations |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) | GPT-4o-mini powered briefings & multilingual advisory |

Set these in `aether/backend/.env`.

---

## ✅ Verified API Endpoints (27/27 passing)

Run the full audit:
```bash
cd aether
python audit.py
```

---

## 📁 Project Structure

```
ETHACK/
├── .gitignore
├── .gitattributes
├── docker-compose.yml              # Root-level orchestration
├── AETHER_Status_And_Future_Scope.md
├── aether/
│   ├── audit.py                    # Full API test suite (27 endpoints)
│   ├── verify_final.py             # Quick sanity check
│   ├── docker-compose.yml          # App-level orchestration
│   ├── backend/
│   │   ├── app/
│   │   │   ├── api/                # FastAPI route handlers
│   │   │   ├── services/           # Business logic (forecast, attribution…)
│   │   │   ├── scripts/            # Seed & refresh scripts
│   │   │   ├── models.py           # SQLAlchemy ORM models
│   │   │   └── main.py             # FastAPI entrypoint
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   └── frontend/
│       ├── app/                    # Next.js App Router pages
│       ├── components/             # React components
│       ├── lib/                    # API client + utilities
│       └── package.json
```

---

## 🛠️ Tech Stack

**Backend:** FastAPI · SQLAlchemy · SQLite/PostgreSQL · XGBoost · NumPy · Pandas · SciPy · APScheduler · OpenAI SDK

**Frontend:** Next.js 16 · React 19 · Tailwind CSS v4 · Recharts · Leaflet + React-Leaflet · TypeScript

**Infrastructure:** Docker · Docker Compose · Uvicorn

---

## 👥 Team

Built for the **ET AI Hackathon 2026** — Problem Statement 5: Urban Air Quality Management.

---

*AETHER — Because clean air is a right, not a privilege.*
