# 🏗️ AETHER — System Architecture & Data Flow

This document details the software architecture, data pipelines, predictive models, and multi-agent system workflows powering the **AETHER Urban Air Quality Intelligence Platform**.

---

## 🗺️ High-Level System Context

AETHER is divided into a microservices layout consisting of an **asynchronous FastAPI backend** (acting as the calculation, machine learning, and data integration engine) and a **Next.js 16 frontend** (serving role-specific dashboards).

```mermaid
graph TD
    classDef client fill:#f97316,stroke:#ea580c,color:#fff;
    classDef server fill:#1e293b,stroke:#475569,color:#fff;
    classDef database fill:#0f172a,stroke:#334155,color:#fff;
    classDef external fill:#1c1917,stroke:#44403c,color:#fff;

    %% Client Layer
    subgraph Client ["Frontend Client (Next.js 16)"]
        A["AppShell Layout"]
        B["Situation Room Dashboard"]:::client
        C["Commissioner Portal"]:::client
        D["Field Officer Mobile HUD"]:::client
        E["Citizen Health Advisory"]:::client
    end

    %% API Gateway / Server
    subgraph Backend ["AETHER Core Service (FastAPI)"]
        F["Uvicorn Web Server"]:::server
        G["APIs (AQI, Forecast, Advisory, Simulation, Enforcement)"]:::server
        H["APScheduler Task Scheduler"]:::server
        I["Multi-Agent Consensus Room"]:::server
        J["XGBoost + ST-GCN Predictor"]:::server
    end

    %% Storage Layer
    subgraph Storage ["Database Layer"]
        K[("SQLite / PostgreSQL")]:::database
        L[("In-Memory NetworkX Graph")]:::database
    end

    %% External Interfaces
    subgraph External ["External Data & API Integrations"]
        M["CPCB CAAQMS (data.gov.in)"]:::external
        N["OpenWeatherMap API"]:::external
        O["OpenAI API (GPT-4o-mini)"]:::external
    end

    %% Connections
    Client -.->|"HTTPS / JSON"| F
    F --> G
    H -->|"Scheduled Sync"| M
    H -->|"Scheduled Sync"| N
    G --> K
    G --> L
    I -->|"Constitution Check"| O
    J -->|"Weather & Spatio-Temporal Data"| K
    G -->|"RAG Verification"| O
    K --> L
```

---

## 📡 Data Ingestion & Hyperlocal Enrichment

This pipeline illustrates how AETHER fetches ambient air measurements, fills spatial gaps using Inverse Distance Weighting (IDW), and integrates Sentinel-5P satellite columns.

```mermaid
graph LR
    classDef process fill:#1e293b,stroke:#475569,color:#fff;
    classDef data fill:#0f172a,stroke:#334155,color:#fff;

    A["CPCB CAAQMS API"] -->|"Raw Hourly Speciation"| B["Ingestion Engine"]:::process
    C["Weather API"] -->|"Temp, Humidity, Wind Vector"| B
    
    B --> D{"Validation Pass?"}
    D -->|"Yes"| E[("Database: Readings Table")]:::data
    D -->|"No / Timeout"| F["CPCB Seed Fallback Engine"]:::process
    F --> E
    
    E --> G["Hyperlocal IDW Interpolator"]:::process
    H[("Database: Wards Lat/Lon")]:::data --> G
    
    G --> I["Ward-Level Interpolated AQI"]:::process
    J["Sentinel-5P Satellite Swath"] -->|"TROPOMI L3 NO₂ Columns"| K["Satellite Calibration Engine"]:::process
    
    I & K --> L["Situation Room Map Renderer"]:::process
```

---

## 📈 Hyperlocal Forecasting Model (ST-GCN + XGBoost)

AETHER predicts future air quality by modeling spatial correlations (wind-drift dependencies between wards) using a Graph Convolutional Network, and temporal dependencies using XGBoost.

```mermaid
graph TD
    classDef step fill:#1e293b,stroke:#475569,color:#fff;
    classDef model fill:#f97316,stroke:#ea580c,color:#fff;

    A[("Historical Ward AQI")] --> B["Spatio-Temporal Feature Pipeline"]:::step
    C[("Wind Dir & Speed Forecast")] --> B
    D[("Ward Adjacency Graph")] --> E["Spatio-Temporal Graph Convolutional Network (ST-GCN)"]:::model
    
    B --> E
    E -->|"Spatial Drift Forecast"| F["XGBoost Ensemble Model"]:::model
    B --> F
    
    F --> G["72-Hour Hyperlocal AQI Forecast"]:::step
    G --> H["Standard Deviation Confidence Solver"]:::step
    H -->|"Output"| I["Forecast Chart Area (95% CI Bands)"]:::step
    G --> J["GRAP Compliance Evaluator"]:::step
    J -->|"MoEFCC Classification"| K["Live GRAP Stage Banner"]:::step
```

---

## ⚖️ Multi-Agent Deliberation & Constitutional Intelligence

When a policy simulation is evaluated or an alert triggers, five expert agents deliberate under a Constitutional Moderator to balance public health concerns against economic trade-offs.

```mermaid
graph TD
    classDef agent fill:#0f172a,stroke:#334155,color:#fff;
    classDef leader fill:#f97316,stroke:#ea580c,color:#fff;

    A["Trigger: Dynamic Ward Escalation"] --> B["Constitutional Moderator Agent"]:::leader
    B -->|"Prompt + Guidelines"| C["Deliberation Round 1"]
    
    subgraph ExpertPanel ["Multi-Agent Panel"]
        D["Environmental Scientist"]:::agent
        E["Public Health Specialist"]:::agent
        F["Urban Planner"]:::agent
        G["Traffic Commissioner"]:::agent
    end

    C --> ExpertPanel
    ExpertPanel -->|"Argue Rules & Constraints"| H["Agent Consensus Synthesizer"]
    H -->|"Proposed Intervention Package"| I{"Meets Constitutional Guardrails?"}
    
    I -->|"No: Rule Violation"| J["Re-Deliberate with Penalty Prompt"]
    J --> C
    
    I -->|"Yes: Passed"| K["Consensus Decree & Action Playbook"]
```

---

## 🚨 Automated Enforcement & Intervention SLA

AETHER monitors IoT sensor streams, triggers automated dispatches on anomalies, and calculates municipal response times.

```mermaid
graph TD
    classDef api fill:#1e293b,stroke:#475569,color:#fff;
    classDef state fill:#0f172a,stroke:#334155,color:#fff;

    A["CPCB Telemetry Check (Hourly)"] --> B{"AQI > 220 Spike?"}
    
    B -->|"Yes"| C["Automated Spike Escalation (APScheduler)"]:::api
    C -->|"State: Pending"| D[("Enforcement Actions Queue")]:::state
    D -->|"Calculate Priority"| E["XGBoost Threat Scorer"]:::api
    
    E -->|"Ranked Targets"| F["Google OR-Tools Route Solver (VRP)"]:::api
    F -->|"Optimized Multi-Stop Route"| G["Field Officer Routing View"]
    
    G --> H["Inspector Resolves & Uploads File/GPS"]
    H -->|"State: Deployed/Closed"| D
    
    D --> I["SLA Calculator (Acknowledged - Detected)"]:::api
    I -->|"Real-Time KPI"| J["Commissioner SLA Performance Panel"]
```

---

## 🛠️ Stack Component Architecture & Databases

| Component Layer | Technology Profile | Architectural Role |
| :--- | :--- | :--- |
| **Frontend Framework** | Next.js 16.2 (App Router) | Static compilation with dynamic hydration; route-specific state management. |
| **Mapping Engine** | Leaflet.js (Dynamic Client Import) | Client-side coordinate mapping, heatmaps, and route overlays. |
| **API Web Server** | FastAPI (Python 3.10+) | Asynchronous ASGI request handling, input schema modeling via Pydantic. |
| **Background Scheduler**| APScheduler | Automated triggers for syncing CPCB data, caching meteorological tables. |
| **Spatial Graph Engine** | NetworkX | In-memory representations of ward adjacency structures. |
| **Route Optimization**  | Google OR-Tools | Formulates and solves Vehicle Routing Problems (VRP) for municipal dispatch. |
| **Legal RAG Engine**    | TF-IDF Vectorizer + Cosine Similarity | Indexes *Air Act 1981* directives for citation mapping. |
| **Database Engine**     | SQLAlchemy ORM + SQLite / PostgreSQL | Dynamic schema generation, index constraints for telemetry readings. |
