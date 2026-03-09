# INTELLIGENCE OS BLUEPRINT v1.0

**A complete, dataset-agnostic blueprint for building an AI-powered executive intelligence system on top of any existing project.**

> **For Claude Code**: Read this document top-to-bottom. Execute each phase sequentially. Every file to create is named explicitly. The checklist at the end tracks completeness. Do not skip phases — each layer depends on the previous one.

---

## Table of Contents

1. [Preamble & Configuration](#1-preamble--configuration)
2. [Architecture Overview](#2-architecture-overview)
3. [Phase 0 — Data Discovery Engine](#3-phase-0--data-discovery-engine)
4. [Phase 1 — Database Layer](#4-phase-1--database-layer)
5. [Phase 2 — Vector Intelligence Layer](#5-phase-2--vector-intelligence-layer)
6. [Phase 3 — ML Intelligence Layer](#6-phase-3--ml-intelligence-layer)
7. [Phase 4 — LLM Orchestration Pipeline](#7-phase-4--llm-orchestration-pipeline)
8. [Phase 5 — Frontend Executive OS Dashboard](#8-phase-5--frontend-executive-os-dashboard)
9. [Phase 6 — Infrastructure](#9-phase-6--infrastructure)
10. [Testing Strategy](#10-testing-strategy)
11. [Configuration Reference](#11-configuration-reference)
12. [Comprehensive Checklist](#12-comprehensive-checklist)

---

## 1. Preamble & Configuration

### 1.1 What This Builds

This blueprint creates a **5-layer Intelligence Operating System** that bolts onto any existing project with a database. Once built, the system can:

- **Auto-discover** every table, column, relationship, and data pattern in the database
- **Generate a complete data dictionary** with semantic type detection
- **Vectorize all entities** using OpenAI embeddings for semantic search and similarity
- **Train ML models** (anomaly detection, forecasting, clustering, root cause analysis, risk scoring) on the discovered data
- **Answer any natural-language question** about the data via a 9-step LLM orchestration pipeline that dynamically generates SQL, runs ML models, and searches vectors
- **Render an executive dashboard** with a 3-panel UI: entity network graph, dynamic chart canvas (13 chart types), and an AI chat assistant
- **Drill through** from any chart, map marker, or insight card to get deeper AI-powered analysis

### 1.2 Required Configuration

Before building, set these values. They drive every layer of the system.

```yaml
# --- REQUIRED ---
PROJECT_NAME: "MyProject"                    # Used in branding, container names, database
DATABASE_URL: "postgres://user:pass@host:5432/dbname"  # Existing database to analyze
OPENAI_API_KEY: "sk-..."                     # For GPT-4o orchestration + embeddings

# --- DOMAIN CONFIGURATION ---
PRIMARY_ENTITY: "store"                      # The main entity (store, patient, order, vehicle, property, etc.)
PRIMARY_ENTITY_PLURAL: "stores"              # Plural form for labels
GROUP_ENTITY: "region"                       # How entities are grouped (region, department, category, fleet, etc.)
GROUP_ENTITY_PLURAL: "regions"               # Plural form for labels
DOMAIN_DESCRIPTION: >
  Optical retail chain with 8 stores across 6 regions.
  Key metrics: revenue, complaints, eye exams, inventory.
  Primary concerns: store health, complaint patterns, revenue trends.

# --- OPTIONAL OVERRIDES ---
PRIMARY_ENTITY_TABLE: null                   # Auto-detected if null. Override to force a specific table.
PRIMARY_ENTITY_ID_COLUMN: null               # Auto-detected if null. Override to force the ID column.
PRIMARY_ENTITY_NAME_COLUMN: null             # Auto-detected if null. Override to force the display name column.
GEO_LAT_COLUMN: null                        # If entities have coordinates (enables geo map). Set to column name.
GEO_LNG_COLUMN: null                        # Paired with GEO_LAT_COLUMN.
TIMESTAMP_COLUMN: null                       # Primary timestamp for time-series. Auto-detected if null.
TEXT_COLUMNS: []                             # Columns to vectorize for semantic search. Auto-detected if empty.
```

**Examples for different domains:**

| Domain | PRIMARY_ENTITY | GROUP_ENTITY | DOMAIN_DESCRIPTION |
|--------|---------------|--------------|-------------------|
| Retail | store | region | "Retail chain. Key metrics: revenue, complaints, inventory." |
| Healthcare | patient | department | "Hospital system. Key metrics: outcomes, readmissions, wait times." |
| E-commerce | order | category | "Online marketplace. Key metrics: revenue, returns, conversion." |
| Logistics | vehicle | fleet | "Delivery fleet. Key metrics: on-time rate, fuel cost, maintenance." |
| Real Estate | property | market | "Property portfolio. Key metrics: occupancy, rent, maintenance costs." |
| SaaS | account | plan_tier | "B2B SaaS platform. Key metrics: MRR, churn, feature adoption." |

### 1.3 Directory Structure

```
{project_root}/
├── intelligence/                    # All Intelligence OS code lives here
│   ├── ai_engine/                   # Python Flask — orchestrator, ML, vectors
│   │   ├── app.py                   # Flask entry point
│   │   ├── requirements.txt
│   │   ├── Dockerfile
│   │   ├── discovery/               # Phase 0: Data discovery
│   │   │   ├── schema_inspector.py
│   │   │   ├── data_profiler.py
│   │   │   ├── semantic_classifier.py
│   │   │   ├── relationship_mapper.py
│   │   │   └── dictionary_builder.py
│   │   ├── orchestrator/            # Phase 4: LLM pipeline
│   │   │   ├── query_engine.py      # 9-step pipeline
│   │   │   ├── prompts.py           # LLM prompt templates
│   │   │   ├── sql_generator.py     # Auto-generated SQL templates
│   │   │   ├── context_builder.py   # Token-budgeted context formatting
│   │   │   └── chart_data_mapper.py # Visualization data transformers
│   │   ├── models/                  # Phase 3: ML models
│   │   │   ├── anomaly_detector.py
│   │   │   ├── forecaster.py
│   │   │   ├── text_clusterer.py
│   │   │   ├── root_cause_explainer.py
│   │   │   └── risk_scorer.py
│   │   ├── services/                # Phase 2: Vector services
│   │   │   ├── embedding_service.py
│   │   │   ├── embedding_pipeline.py
│   │   │   └── vector_service.py
│   │   ├── routes/                  # Flask blueprints
│   │   │   ├── orchestrator_routes.py
│   │   │   ├── ml_routes.py
│   │   │   └── vector_routes.py
│   │   └── tests/
│   ├── frontend/                    # React 18 — Executive OS dashboard
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── Dockerfile
│   │   ├── nginx.conf
│   │   ├── index.html
│   │   └── src/
│   │       ├── index.jsx
│   │       ├── App.jsx
│   │       ├── components/
│   │       │   ├── Layout/
│   │       │   │   └── IntelligenceOSLayout.jsx
│   │       │   ├── IntelligenceMap/
│   │       │   │   ├── IntelligenceMap.jsx
│   │       │   │   ├── MapTooltip.jsx
│   │       │   │   └── MapContextMenu.jsx
│   │       │   ├── Canvas/
│   │       │   │   ├── DynamicCanvas.jsx
│   │       │   │   ├── ChartTypeSelector.jsx
│   │       │   │   ├── AutoInsightsGrid.jsx
│   │       │   │   ├── InsightCard.jsx
│   │       │   │   ├── ContextBreadcrumb.jsx
│   │       │   │   ├── EntityDetailPanel.jsx
│   │       │   │   ├── ExecutiveInsightHeader.jsx
│   │       │   │   └── charts/
│   │       │   │       ├── LineChart.jsx
│   │       │   │       ├── BarChart.jsx
│   │       │   │       ├── ComboChart.jsx
│   │       │   │       ├── HeatmapChart.jsx
│   │       │   │       ├── GeoMap.jsx
│   │       │   │       ├── NetworkGraph.jsx
│   │       │   │       ├── RadarChart.jsx
│   │       │   │       ├── WaterfallChart.jsx
│   │       │   │       ├── ForecastCone.jsx
│   │       │   │       ├── RiskMatrix.jsx
│   │       │   │       ├── DecompositionTree.jsx
│   │       │   │       ├── RootCausePanel.jsx
│   │       │   │       └── ClusterView.jsx
│   │       │   ├── AIAssistant/
│   │       │   │   └── AIAssistant.jsx
│   │       │   └── Common/
│   │       │       ├── LoadingOverlay.jsx
│   │       │       └── ThemeToggle.jsx
│   │       ├── pages/
│   │       │   ├── IntelligenceOSPage.jsx
│   │       │   └── LoginPage.jsx
│   │       ├── store/
│   │       │   ├── index.js
│   │       │   └── slices/
│   │       │       ├── authSlice.js
│   │       │       ├── uiSlice.js
│   │       │       ├── contextSlice.js
│   │       │       ├── intelligenceMapSlice.js
│   │       │       ├── canvasSlice.js
│   │       │       ├── aiAssistantSlice.js
│   │       │       ├── orchestratorSlice.js
│   │       │       └── executiveSlice.js
│   │       ├── services/
│   │       │   ├── api.js
│   │       │   ├── orchestratorService.js
│   │       │   └── intelligenceService.js
│   │       ├── utils/
│   │       │   ├── chartAutoSelector.js
│   │       │   ├── chartKPIExtractor.js
│   │       │   └── scopeGuard.js
│   │       └── styles/
│   │           └── theme.js
│   ├── gateway/                     # Nginx reverse proxy
│   │   ├── nginx.conf
│   │   ├── Dockerfile
│   │   └── certs/                   # Self-signed SSL certs
│   ├── docker-compose.yml
│   ├── data_dictionary.json         # Generated by Phase 0
│   └── config.yaml                  # User configuration (section 1.2 values)
```

---

## 2. Architecture Overview

### 2.1 Five-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  LAYER 5: Executive OS Dashboard (React 18 + D3 + Chart.js)    │
│  ┌──────────┐  ┌──────────────────────┐  ┌──────────────────┐  │
│  │ Entity   │  │  Dynamic Canvas      │  │  AI Assistant     │  │
│  │ Map      │  │  (13 chart types)    │  │  (Chat + Follow-  │  │
│  │ (D3)     │  │  + Auto Insights     │  │   up Questions)   │  │
│  └──────────┘  └──────────────────────┘  └──────────────────┘  │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 4: LLM Orchestration (GPT-4o, 9-step pipeline)          │
│  Intent → Plan → SQL + ML + Vector → Context → Narrative → Viz │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 3: ML Intelligence                                       │
│  Anomaly (IsoForest) │ Forecast (Prophet) │ Cluster (HDBSCAN)  │
│  Root Cause (XGBoost+SHAP) │ Risk Score (Weighted Composite)   │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 2: Vector Intelligence (OpenAI embeddings + pgvector)    │
│  Entity embeddings │ Text embeddings │ Similarity search        │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 1: Relational Core (PostgreSQL + pgvector)               │
│  Existing tables │ Materialized views │ Vector columns │ QA log │
├─────────────────────────────────────────────────────────────────┤
│  LAYER 0: Data Discovery (Schema introspection + profiling)     │
│  data_dictionary.json │ Semantic types │ Relationship graph     │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Service Map

```
┌──────────────────────────────────────────────────────────────┐
│                        GATEWAY (nginx)                        │
│              HTTPS :443  →  Routes to services                │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────┐   │
│  │  Frontend     │   │  AI Engine    │   │  PostgreSQL    │   │
│  │  (React/Vite) │   │  (Flask)      │   │  (pgvector)    │   │
│  │  Port 3000    │   │  Port 5000    │   │  Port 5432     │   │
│  └──────────────┘   └──────────────┘   └────────────────┘   │
│                                                              │
│  ┌──────────────┐   ┌──────────────┐                         │
│  │  Redis        │   │  Prometheus   │                        │
│  │  Port 6379    │   │  + Grafana    │                        │
│  └──────────────┘   └──────────────┘                         │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 Query Lifecycle (Data Flow)

```
User asks: "Why is revenue declining at the Dallas store?"
                              │
                    ┌─────────▼──────────┐
                    │ 1. CLASSIFY INTENT  │  GPT-4o identifies: revenue_analysis
                    │    Extract entities │  Entities: {store_name: "Dallas", metric: "revenue"}
                    └─────────┬──────────┘
                    ┌─────────▼──────────┐
                    │ 2. GENERATE PLAN    │  GPT-4o plans data sources:
                    │    Choose sources   │  SQL: [revenue_trends, entity_performance]
                    │                     │  ML: [root_cause_explainer, forecaster]
                    │                     │  Vector: [similar_entities]
                    └─────────┬──────────┘
                    ┌─────────▼──────────┐
            ┌───────┤ 3-5. EXECUTE       ├───────┐
            │       │ (parallel)         │       │
     ┌──────▼─────┐ ┌──────▼─────┐ ┌────▼───────┐
     │ SQL Queries │ │ ML Models  │ │ Vector     │
     │ (parameterized)│ (Python)  │ │ Search     │
     │ revenue_trends │ SHAP vals │ │ (pgvector) │
     └──────┬─────┘ └──────┬─────┘ └────┬───────┘
            └───────┬───────┘────────────┘
                    │
                    ▼
          ┌─────────────────────┐
          │ 6. BUILD CONTEXT    │  Format all results into token-budgeted string
          │    (max 8K tokens)  │  with semantic type formatting ($, %, counts)
          └─────────┬───────────┘
          ┌─────────▼───────────┐
          │ 7. GENERATE         │  GPT-4o writes executive narrative:
          │    NARRATIVE         │  "Dallas revenue declined 12% due to..."
          └─────────┬───────────┘
          ┌─────────▼───────────┐
          │ 8. SELECT & MAP     │  GPT-4o recommends: [line, waterfall, geo]
          │    VISUALIZATIONS   │  Mapper transforms data → chart-ready JSON
          └─────────┬───────────┘
          ┌─────────▼───────────┐
          │ 9. FOLLOW-UP        │  "What are Dallas's top complaint categories?"
          │    QUESTIONS         │  "Compare Dallas to similar stores"
          └─────────┬───────────┘
                    │
                    ▼
          ┌─────────────────────────────────────────────────┐
          │ RESPONSE                                         │
          │ {                                                │
          │   answer: "Executive narrative...",              │
          │   visualizations: [{type, title, data}, ...],   │
          │   follow_up_questions: ["Q1", "Q2", "Q3"],      │
          │   execution_path: "intent→sql→ml→narrative",    │
          │   sources: ["revenue_trends", "root_cause"],    │
          │   metadata: {intent, confidence, entities, ...} │
          │ }                                                │
          └─────────────────────────────────────────────────┘
```

---

## 3. Phase 0 — Data Discovery Engine

> **Goal**: Automatically discover and catalog everything in the target database so every subsequent phase can adapt to the data without hardcoding.

### 3.1 Schema Introspection

**File**: `intelligence/ai_engine/discovery/schema_inspector.py`

Query PostgreSQL `information_schema` to extract complete metadata:

```python
class SchemaInspector:
    """Discovers all tables, columns, types, constraints, and indexes."""

    def inspect(self) -> dict:
        return {
            "tables": self._get_tables(),
            "columns": self._get_columns(),
            "foreign_keys": self._get_foreign_keys(),
            "primary_keys": self._get_primary_keys(),
            "unique_constraints": self._get_unique_constraints(),
            "indexes": self._get_indexes(),
            "enums": self._get_enum_types(),
            "views": self._get_views(),
            "materialized_views": self._get_materialized_views(),
            "extensions": self._get_extensions(),
            "row_counts": self._get_row_counts(),
        }
```

**SQL queries to execute:**

```sql
-- 1. All tables
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type IN ('BASE TABLE', 'VIEW');

-- 2. All columns with full metadata
SELECT table_name, column_name, ordinal_position, data_type,
       udt_name, is_nullable, column_default, character_maximum_length,
       numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- 3. Foreign key relationships
SELECT
    tc.table_name AS source_table,
    kcu.column_name AS source_column,
    ccu.table_name AS target_table,
    ccu.column_name AS target_column,
    tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu
    ON tc.constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';

-- 4. Primary keys
SELECT tc.table_name, kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public';

-- 5. Row counts (approximate, fast)
SELECT relname AS table_name, reltuples::bigint AS approximate_row_count
FROM pg_class
WHERE relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND relkind = 'r';

-- 6. Indexes
SELECT tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname = 'public';

-- 7. Check for pgvector extension
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

### 3.2 Data Profiling

**File**: `intelligence/ai_engine/discovery/data_profiler.py`

For each table, sample data and compute statistics:

```python
class DataProfiler:
    """Profiles each table: cardinality, distributions, null rates, samples."""

    def profile_table(self, table_name: str, sample_size: int = 100) -> dict:
        return {
            "table_name": table_name,
            "row_count": self._exact_count(table_name),
            "columns": {
                col: {
                    "null_count": ...,
                    "null_rate": ...,
                    "distinct_count": ...,
                    "cardinality_ratio": ...,      # distinct / total
                    "min": ...,                     # For numeric/date
                    "max": ...,
                    "mean": ...,                    # For numeric
                    "std": ...,                     # For numeric
                    "median": ...,                  # For numeric
                    "top_values": [...],            # Most frequent 10 values
                    "sample_values": [...],         # Random 5 values
                    "avg_text_length": ...,         # For text columns
                    "is_unique": bool,              # cardinality_ratio == 1.0
                    "looks_like_name": bool,        # Heuristic: unique text, short
                    "looks_like_description": bool, # Heuristic: long text, varied
                }
                for col in columns
            }
        }
```

**Profiling SQL pattern (per column):**

```sql
-- Numeric column profiling
SELECT
    COUNT(*) AS total,
    COUNT(col) AS non_null,
    COUNT(DISTINCT col) AS distinct_count,
    MIN(col), MAX(col), AVG(col), STDDEV(col),
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY col) AS median
FROM table_name;

-- Text column profiling
SELECT
    COUNT(*) AS total,
    COUNT(col) AS non_null,
    COUNT(DISTINCT col) AS distinct_count,
    AVG(LENGTH(col)) AS avg_length,
    MAX(LENGTH(col)) AS max_length
FROM table_name;

-- Top values (categorical detection)
SELECT col, COUNT(*) AS freq
FROM table_name WHERE col IS NOT NULL
GROUP BY col ORDER BY freq DESC LIMIT 10;

-- Sample values
SELECT col FROM table_name WHERE col IS NOT NULL
ORDER BY RANDOM() LIMIT 5;
```

### 3.3 Semantic Type Detection

**File**: `intelligence/ai_engine/discovery/semantic_classifier.py`

Classify each column into a semantic type for proper formatting and ML feature selection:

```python
class SemanticClassifier:
    """Classifies columns by semantic meaning using name heuristics + data patterns."""

    SEMANTIC_TYPES = {
        "currency":    {"keywords": ["revenue", "amount", "price", "cost", "fee", "salary", "total", "spend", "income", "profit", "mrr", "arpu", "ltv"]},
        "percentage":  {"keywords": ["pct", "percent", "rate", "ratio", "conversion", "growth", "churn", "retention"]},
        "count":       {"keywords": ["count", "total", "num_", "number_of", "qty", "quantity", "units"]},
        "score":       {"keywords": ["score", "rating", "rank", "index", "health", "risk", "sentiment"]},
        "date":        {"keywords": ["date", "created_at", "updated_at", "timestamp", "time", "_at", "_on"]},
        "id":          {"keywords": ["_id", "uuid", "pk", "key"]},
        "name":        {"keywords": ["name", "title", "label"]},
        "description": {"keywords": ["description", "notes", "comment", "text", "body", "content", "summary", "detail"]},
        "category":    {"keywords": ["type", "category", "status", "level", "tier", "class", "group", "kind"]},
        "geo_lat":     {"keywords": ["lat", "latitude"]},
        "geo_lng":     {"keywords": ["lng", "lon", "longitude"]},
        "email":       {"keywords": ["email", "mail"]},
        "phone":       {"keywords": ["phone", "tel", "mobile"]},
        "boolean":     {"keywords": ["is_", "has_", "can_", "enabled", "active", "flag"]},
        "url":         {"keywords": ["url", "link", "href", "website"]},
    }

    def classify(self, column_name: str, data_type: str, profile: dict) -> str:
        # 1. Check column name against keyword lists
        # 2. Check data_type (boolean, timestamp, uuid, etc.)
        # 3. Check profile patterns (all values are URLs, emails, etc.)
        # 4. Fallback: "text" for varchar/text, "numeric" for int/float, "other"
        ...
```

### 3.4 Relationship Mapping

**File**: `intelligence/ai_engine/discovery/relationship_mapper.py`

Build an entity-relationship graph from foreign keys + inferred relationships:

```python
class RelationshipMapper:
    """Maps explicit (FK) and inferred relationships between tables."""

    def map_relationships(self, schema: dict, profiles: dict) -> dict:
        relationships = []

        # 1. Explicit: foreign keys from schema
        for fk in schema["foreign_keys"]:
            relationships.append({
                "type": "explicit_fk",
                "source_table": fk["source_table"],
                "source_column": fk["source_column"],
                "target_table": fk["target_table"],
                "target_column": fk["target_column"],
                "cardinality": self._detect_cardinality(fk, profiles),  # 1:1, 1:N, N:M
            })

        # 2. Inferred: columns named "{table}_id" that match another table's PK
        for table, cols in profiles.items():
            for col_name in cols:
                if col_name.endswith("_id"):
                    candidate_table = col_name.replace("_id", "")
                    if candidate_table in schema["tables"] or f"{candidate_table}s" in schema["tables"]:
                        relationships.append({
                            "type": "inferred",
                            "source_table": table,
                            "source_column": col_name,
                            "target_table": candidate_table,  # or pluralized
                            "target_column": "id",
                            "confidence": 0.8,
                        })

        return {
            "relationships": relationships,
            "hub_entity": self._detect_hub_entity(relationships),
            "entity_graph": self._build_adjacency_list(relationships),
        }

    def _detect_hub_entity(self, relationships) -> str:
        """The hub entity is the table most referenced by foreign keys."""
        # Count inbound FK references per table
        # The table with the most inbound references is the hub (primary entity)
        ...
```

### 3.5 Dictionary Builder (Output)

**File**: `intelligence/ai_engine/discovery/dictionary_builder.py`

Assembles all discovery results into `data_dictionary.json`:

```python
class DictionaryBuilder:
    """Combines schema, profiles, semantic types, and relationships into data_dictionary.json."""

    def build(self, config: dict) -> dict:
        schema = SchemaInspector(config["DATABASE_URL"]).inspect()
        profiles = DataProfiler(config["DATABASE_URL"]).profile_all(schema["tables"])
        semantics = SemanticClassifier().classify_all(schema["columns"], profiles)
        relationships = RelationshipMapper().map_relationships(schema, profiles)

        dictionary = {
            "generated_at": datetime.utcnow().isoformat(),
            "database_url": config["DATABASE_URL"].split("@")[1],  # Exclude credentials
            "config": {
                "primary_entity": config["PRIMARY_ENTITY"],
                "group_entity": config["GROUP_ENTITY"],
                "domain_description": config["DOMAIN_DESCRIPTION"],
            },
            "tables": {
                table: {
                    "row_count": profiles[table]["row_count"],
                    "columns": {
                        col: {
                            "data_type": schema["columns"][table][col]["data_type"],
                            "semantic_type": semantics[table][col],
                            "nullable": schema["columns"][table][col]["is_nullable"],
                            "is_primary_key": col in schema["primary_keys"].get(table, []),
                            "is_foreign_key": any(
                                fk["source_column"] == col and fk["source_table"] == table
                                for fk in relationships["relationships"]
                            ),
                            "profile": profiles[table]["columns"][col],
                        }
                        for col in schema["columns"].get(table, {})
                    }
                }
                for table in schema["tables"]
            },
            "relationships": relationships["relationships"],
            "hub_entity": relationships["hub_entity"],
            "entity_graph": relationships["entity_graph"],
            "text_columns": self._find_text_columns(semantics),
            "numeric_columns": self._find_numeric_columns(semantics),
            "time_series_candidates": self._find_time_series(schema, semantics),
            "geo_columns": self._find_geo_columns(semantics),
        }

        # Write to file
        with open("data_dictionary.json", "w") as f:
            json.dump(dictionary, f, indent=2)

        return dictionary
```

### 3.6 Running Phase 0

```bash
cd intelligence/ai_engine
python -m discovery.dictionary_builder --config ../config.yaml
# Produces: intelligence/data_dictionary.json
```

---

## 4. Phase 1 — Database Layer

> **Goal**: Extend the existing database with pgvector support, materialized views for analytics, vector columns for embeddings, and QA history for conversational memory.

### 4.1 Enable pgvector Extension

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

### 4.2 Auto-Generate Materialized Views

Using the data dictionary, generate materialized views that aggregate metrics per primary entity. The view generator reads `data_dictionary.json` and produces SQL.

**File**: `intelligence/ai_engine/discovery/view_generator.py`

**Pattern**: For the primary entity table, JOIN all related tables and compute aggregates:

```sql
-- Auto-generated: {primary_entity}_performance_features
CREATE MATERIALIZED VIEW {primary_entity}_performance_features AS
SELECT
    e.{primary_entity_id} AS entity_id,
    e.{name_column} AS entity_name,
    -- For each numeric column in related tables: compute 30-day aggregates
    COALESCE(SUM(t.amount), 0) AS revenue_30d,
    COUNT(t.id) AS transaction_count_30d,
    -- ... (generated from data dictionary relationships)
FROM {primary_entity_table} e
LEFT JOIN {related_table_1} t ON t.{fk_column} = e.{pk_column}
    AND t.{timestamp_col} >= NOW() - INTERVAL '30 days'
-- ... (one LEFT JOIN per related table)
GROUP BY e.{primary_entity_id}, e.{name_column};

-- Refresh strategy
CREATE UNIQUE INDEX ON {primary_entity}_performance_features (entity_id);
-- Refresh: REFRESH MATERIALIZED VIEW CONCURRENTLY {primary_entity}_performance_features;
```

**Additional auto-generated views** (if data supports):

- `{group_entity}_summary` — Aggregates per group
- `{primary_entity}_time_series` — Daily/weekly metrics over time
- `text_record_features` — Text columns with metadata for clustering

### 4.3 Vector Columns

Add embedding columns to tables that have text content:

```sql
-- For each table with text columns (from data_dictionary.text_columns)
ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS
    {text_column}_embedding vector(1536);

-- Index for fast similarity search
CREATE INDEX IF NOT EXISTS idx_{table}_{col}_embedding
    ON {table_name} USING ivfflat ({text_column}_embedding vector_cosine_ops)
    WITH (lists = 100);
```

### 4.4 Entity Summaries Table

```sql
CREATE TABLE IF NOT EXISTS entity_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_id TEXT NOT NULL UNIQUE,       -- References primary entity
    entity_name TEXT,
    entity_type TEXT DEFAULT '{PRIMARY_ENTITY}',
    summary_text TEXT NOT NULL,            -- LLM-generated or template summary
    summary_embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_entity_summaries_embedding
    ON entity_summaries USING ivfflat (summary_embedding vector_cosine_ops)
    WITH (lists = 100);
```

### 4.5 QA History Table

```sql
CREATE TABLE IF NOT EXISTS qa_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question TEXT NOT NULL,
    question_embedding vector(1536),
    answer TEXT NOT NULL,
    intent TEXT,
    entities JSONB DEFAULT '{}',
    execution_path TEXT,
    sources TEXT[],
    user_id TEXT,
    scope JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_qa_history_embedding
    ON qa_history USING ivfflat (question_embedding vector_cosine_ops)
    WITH (lists = 100);
```

### 4.6 Migration Script

**File**: `intelligence/ai_engine/migrations/001_intelligence_os.sql`

Combine all the above into a single idempotent migration that:
1. Enables extensions
2. Creates entity_summaries and qa_history tables
3. Adds vector columns to text-bearing tables
4. Creates materialized views
5. Creates indexes

---

## 5. Phase 2 — Vector Intelligence Layer

> **Goal**: Vectorize all entity data and text content for semantic search, similarity analysis, and Q&A context retrieval.

### 5.1 Embedding Service

**File**: `intelligence/ai_engine/services/embedding_service.py`

```python
class EmbeddingService:
    """Wraps OpenAI embedding API with batching, retry, and rate-limit handling."""

    MODEL = "text-embedding-3-small"
    DIMENSIONS = 1536
    MAX_BATCH = 100
    MAX_RETRIES = 3
    MAX_INPUT_TOKENS = 8191

    def embed_text(self, text: str) -> list[float]:
        """Embed a single text string → 1536-dim vector."""
        ...

    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Embed multiple texts in batches of 100."""
        # Sanitize: strip newlines, truncate to token limit
        # Batch into groups of MAX_BATCH
        # Retry with exponential backoff on rate limits
        # Return list of 1536-dim vectors
        ...
```

### 5.2 Embedding Pipeline

**File**: `intelligence/ai_engine/services/embedding_pipeline.py`

Runs as a background task on startup or on-demand:

```python
class EmbeddingPipeline:
    """Batch-embeds all text columns and generates entity summaries."""

    def run_full_pipeline(self, data_dictionary: dict):
        """Execute complete embedding pipeline."""
        # 1. Embed text columns (descriptions, notes, comments, etc.)
        for table, col in data_dictionary["text_columns"]:
            self.embed_text_column(table, col)

        # 2. Generate entity summaries from performance features
        self.generate_entity_summaries(data_dictionary)

        # 3. Embed entity summaries
        self.embed_entity_summaries()

    def embed_text_column(self, table: str, column: str):
        """Fetch rows with NULL embeddings, batch embed, update."""
        # SELECT id, {column} FROM {table} WHERE {column}_embedding IS NULL
        # Batch embed all texts
        # UPDATE {table} SET {column}_embedding = %s WHERE id = %s
        ...

    def generate_entity_summaries(self, data_dictionary: dict):
        """Create text summaries for each primary entity from aggregated data."""
        # Query performance features view
        # For each entity, build summary text:
        #   "{entity_name}: Revenue $X (trend: +Y%), Z complaints,
        #    risk score: W. Top issues: ..."
        # INSERT INTO entity_summaries (entity_id, entity_name, summary_text)
        ...

    def embed_entity_summaries(self):
        """Batch embed all entity summaries."""
        # SELECT id, summary_text FROM entity_summaries WHERE summary_embedding IS NULL
        # Batch embed, UPDATE
        ...
```

### 5.3 Vector Search Service

**File**: `intelligence/ai_engine/services/vector_service.py`

Four search functions, all using pgvector cosine distance (`<=>`):

```python
class VectorService:
    """Semantic search via pgvector cosine similarity."""

    def similar_text_search(self, query_text: str, table: str, column: str, limit: int = 10) -> list[dict]:
        """Find text records similar to a query (e.g., similar complaints, tickets, notes)."""
        embedding = self.embedding_service.embed_text(query_text)
        # SELECT *, 1 - ({column}_embedding <=> %s) AS similarity
        # FROM {table} ORDER BY {column}_embedding <=> %s LIMIT %s
        ...

    def similar_entities(self, entity_id: str, limit: int = 5) -> list[dict]:
        """Find entities operationally similar to a given entity."""
        # Get source entity's summary_embedding
        # SELECT *, 1 - (summary_embedding <=> source_embedding) AS similarity
        # FROM entity_summaries WHERE entity_id != %s
        # ORDER BY summary_embedding <=> source_embedding LIMIT %s
        ...

    def semantic_entity_search(self, query_text: str, limit: int = 5) -> list[dict]:
        """Natural language search for entities ('find stores with high complaints')."""
        embedding = self.embedding_service.embed_text(query_text)
        # SELECT *, 1 - (summary_embedding <=> %s) AS similarity
        # FROM entity_summaries ORDER BY summary_embedding <=> %s LIMIT %s
        ...

    def qa_context(self, question_embedding: list[float], limit: int = 3) -> list[dict]:
        """Find historically similar Q&A pairs for context."""
        # SELECT question, answer, 1 - (question_embedding <=> %s) AS similarity
        # FROM qa_history ORDER BY question_embedding <=> %s LIMIT %s
        ...

    def entity_similarity_network(self, threshold: float = 0.5) -> dict:
        """Build pairwise similarity graph for all entities (for frontend D3 map)."""
        # CROSS JOIN entity_summaries, compute cosine similarity
        # Return edges where similarity > threshold
        # { nodes: [...], edges: [{source, target, weight}] }
        ...
```

---

## 6. Phase 3 — ML Intelligence Layer

> **Goal**: Train 5 generic ML models that auto-adapt to whatever features the data dictionary discovered.

### 6.1 Anomaly Detector

**File**: `intelligence/ai_engine/models/anomaly_detector.py`

**Algorithm**: scikit-learn Isolation Forest

```python
class AnomalyDetector:
    """Detects anomalous entities using Isolation Forest on all numeric features."""

    def __init__(self, contamination=0.1, n_estimators=100, random_state=42):
        self.model = IsolationForest(
            contamination=contamination,
            n_estimators=n_estimators,
            random_state=random_state,
        )

    def detect_from_db(self, data_dictionary: dict) -> list[dict]:
        """Fit and detect anomalies from the primary entity performance view."""
        # 1. Query {primary_entity}_performance_features materialized view
        # 2. Select all numeric columns (from data_dictionary.numeric_columns)
        # 3. Handle NaN: fill with median
        # 4. StandardScaler normalization
        # 5. Fit Isolation Forest
        # 6. Score each entity
        # 7. Compute feature contributions via mean absolute deviation
        #
        # Returns per entity:
        # {
        #   "entity_id": "...",
        #   "entity_name": "...",
        #   "anomaly_score": float,      # -1 to 0 (more negative = more anomalous)
        #   "is_anomaly": bool,
        #   "feature_contributions": {    # Normalized to sum to 1.0
        #       "revenue_30d": 0.25,
        #       "complaint_count": 0.15, ...
        #   }
        # }
        ...
```

### 6.2 Forecaster

**File**: `intelligence/ai_engine/models/forecaster.py`

**Algorithm**: Facebook Prophet

```python
class Forecaster:
    """Time-series forecasting for any numeric metric with a timestamp."""

    def __init__(self, yearly_seasonality=True, weekly_seasonality=True):
        ...

    def forecast_from_db(self, data_dictionary: dict, entity_id: str = None,
                         metric: str = "revenue", periods: int = 90) -> dict:
        """Forecast a metric for a specific entity or aggregate."""
        # 1. Auto-detect time series table from data_dictionary.time_series_candidates
        # 2. Query: SELECT date_col AS ds, SUM(metric_col) AS y
        #           FROM {table} WHERE entity_fk = %s GROUP BY date_col ORDER BY ds
        # 3. Fit Prophet model
        # 4. Generate future dataframe
        # 5. Predict with confidence intervals
        #
        # Returns:
        # {
        #   "forecast": [{date, predicted, lower, upper}, ...],
        #   "changepoints": ["2026-01-15", ...],
        #   "seasonality": {yearly: {amplitude, mean_effect}, weekly: {...}},
        #   "trend": "upward" | "downward" | "stable",
        #   "summary": {data_points, date_range, mean, std, min, max}
        # }
        ...

    def forecast(self, df: pd.DataFrame, periods: int = 90) -> dict:
        """Forecast from a prepared DataFrame with 'ds' and 'y' columns."""
        # Minimum 2 data points required
        ...
```

### 6.3 Text Clusterer

**File**: `intelligence/ai_engine/models/text_clusterer.py`

**Algorithm**: HDBSCAN + TF-IDF

```python
class TextClusterer:
    """Clusters text records (complaints, tickets, notes) into thematic groups."""

    def __init__(self, min_cluster_size=5, min_samples=3, max_features=1000):
        ...

    def cluster_from_db(self, data_dictionary: dict, table: str = None,
                        column: str = None) -> dict:
        """Cluster text from the first discovered text column (or specified)."""
        # 1. If table/column not specified, use first from data_dictionary.text_columns
        # 2. Fetch all text values
        # 3. TF-IDF vectorization (max 1000 features, English stop words)
        # 4. HDBSCAN clustering on dense TF-IDF matrix
        # 5. Extract top keywords per cluster
        #
        # Returns:
        # {
        #   "clusters": [{
        #       "cluster_id": 0,
        #       "top_keywords": ["keyword1", "keyword2", ...],
        #       "record_count": 47,
        #       "sample_records": ["text1", "text2", ...],
        #       "record_ids": ["id1", "id2", ...]
        #   }, ...],
        #   "noise_count": 5,
        #   "total_records": 200
        # }
        ...
```

### 6.4 Root Cause Explainer

**File**: `intelligence/ai_engine/models/root_cause_explainer.py`

**Algorithm**: XGBoost + SHAP TreeExplainer

```python
class RootCauseExplainer:
    """Explains what drives a target metric using feature attribution (SHAP values)."""

    def __init__(self, n_estimators=100, max_depth=6, learning_rate=0.1):
        self.model = XGBRegressor(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            random_state=42,
        )

    def explain_from_db(self, data_dictionary: dict, target_metric: str,
                        entity_id: str = None) -> dict:
        """Explain what features drive a target metric across all entities."""
        # 1. Query {primary_entity}_performance_features
        # 2. Target = target_metric column; Features = all other numeric columns
        # 3. Fit XGBoost
        # 4. SHAP TreeExplainer → SHAP values per entity per feature
        #
        # Returns:
        # {
        #   "global_importance": [
        #       {"feature": "complaint_count", "importance": 0.42, "direction": "negative", "mean_shap": -245.67},
        #       ...  # Top 10 features
        #   ],
        #   "entity_explanations": [
        #       {"entity_id": "...", "predicted_value": 15234.5,
        #        "shap_values": {"complaint_count": -1234.56, ...},
        #        "top_factors": [{"feature": "...", "impact": ..., "direction": "..."}]}
        #   ],
        #   "model_performance": {"r_squared": 0.87, "n_features": 15, "n_samples": 8}
        # }
        ...
```

### 6.5 Risk Scorer

**File**: `intelligence/ai_engine/models/risk_scorer.py`

**Algorithm**: Weighted composite of normalized risk dimensions

```python
class RiskScorer:
    """Scores entity risk using auto-discovered dimensions from the performance view."""

    def __init__(self, weights: dict = None):
        # If weights not provided, auto-discover from data dictionary:
        # - Find columns with semantic_type "score", "percentage", "count"
        # - Assign equal weights
        # - Invert metrics where higher = better (e.g., revenue → lower revenue = higher risk)
        ...

    def score_from_db(self, data_dictionary: dict, entity_id: str = None) -> list[dict]:
        """Score all entities (or one) on composite risk."""
        # 1. Query performance features view
        # 2. For each risk dimension:
        #    - Normalize to 0-100 scale (min-max within dataset)
        #    - Invert if necessary (higher_is_better → risk = 100 - normalized)
        # 3. Weighted sum → composite risk_score (0-100)
        # 4. Classify: >=80 critical, >=60 high, >=40 medium, <40 low
        #
        # Returns per entity:
        # {
        #   "entity_id": "...",
        #   "entity_name": "...",
        #   "risk_score": 72.45,
        #   "risk_level": "high",
        #   "contributing_factors": {
        #       "complaint_velocity": {"score": 85.5, "weight": 0.25, "weighted_score": 21.375},
        #       "revenue_trend": {"score": 60.0, "weight": 0.25, "weighted_score": 15.0},
        #       ...
        #   }
        # }
        ...

    # Risk levels
    RISK_LEVELS = {80: "critical", 60: "high", 40: "medium", 0: "low"}
```

### 6.6 Graceful Degradation

Each model implements a `can_run(data_dictionary) -> bool` check:
- **AnomalyDetector**: Needs >= 5 entities with >= 3 numeric features
- **Forecaster**: Needs a timestamp column + numeric metric with >= 30 data points
- **TextClusterer**: Needs a text column with >= 20 non-null records
- **RootCauseExplainer**: Needs >= 5 entities with >= 3 numeric features + 1 target
- **RiskScorer**: Needs >= 3 entities with >= 2 scoreable dimensions

If `can_run()` returns `False`, the model is skipped and the orchestrator excludes it from plans.

---

## 7. Phase 4 — LLM Orchestration Pipeline

> **Goal**: Build a 9-step pipeline that takes any natural-language question, dynamically queries the discovered data, runs ML models, and returns an executive-quality narrative with visualizations.

### 7.1 Prompt Templates (Data-Dictionary-Aware)

**File**: `intelligence/ai_engine/orchestrator/prompts.py`

All prompts are **template strings** that inject schema information from the data dictionary at startup. This is the key to making the orchestrator work with any dataset.

```python
def build_intent_prompt(data_dictionary: dict) -> str:
    """Generate intent classification prompt from data dictionary."""
    tables = list(data_dictionary["tables"].keys())
    metrics = [col for col in data_dictionary["numeric_columns"]]
    entities = data_dictionary["config"]["primary_entity"]
    domain = data_dictionary["config"]["domain_description"]

    return f"""You are an intent classifier for a {domain} intelligence system.

Available data:
- Tables: {', '.join(tables)}
- Key metrics: {', '.join(metrics[:20])}
- Primary entity: {entities}

Classify the user's question into one of these intents:
- performance_analysis: Questions about metrics, KPIs, performance
- trend_analysis: Questions about changes over time, trends, growth
- comparison: Questions comparing entities or groups
- anomaly_investigation: Questions about unusual patterns, outliers
- risk_assessment: Questions about risk, health, operational concerns
- forecast_request: Questions about future predictions
- text_analysis: Questions about text content (complaints, tickets, notes)
- root_cause: Questions about why something happened
- general_qa: General questions about the data

Extract entities: {entities} names/IDs, {data_dictionary["config"]["group_entity"]} names, metric names, time periods.

Return JSON: {{"intent": "...", "confidence": 0.0-1.0, "entities": {{...}}}}
"""


def build_plan_prompt(data_dictionary: dict, available_models: list) -> str:
    """Generate plan generation prompt listing all available data sources."""
    # List auto-generated SQL templates with parameters
    # List available ML models (only those where can_run() == True)
    # List available vector searches
    # Include schema summary for context
    ...


def build_narrative_prompt(data_dictionary: dict) -> str:
    """Generate narrative prompt with domain-specific formatting rules."""
    # Includes: domain context, formatting rules for semantic types,
    # executive summary structure, word limit (120-200 words),
    # guardrail: never fabricate data
    ...


def build_visualization_prompt(data_dictionary: dict) -> str:
    """Generate visualization recommendation prompt with available chart types."""
    # Lists all 13 chart types with when to use each
    # Includes available data shapes from the dictionary
    ...


def build_followup_prompt(data_dictionary: dict) -> str:
    """Generate follow-up question prompt with domain context."""
    # Domain-specific follow-up patterns
    ...
```

### 7.2 SQL Generator (Auto-Generated Templates)

**File**: `intelligence/ai_engine/orchestrator/sql_generator.py`

**Hybrid approach**: Auto-generated safe templates + sanitized LLM fallback.

```python
class SQLGenerator:
    """Generates parameterized SQL from data dictionary. No string interpolation."""

    def __init__(self, data_dictionary: dict):
        self.dictionary = data_dictionary
        self.templates = self._build_templates()

    def _build_templates(self) -> dict:
        """Auto-generate parameterized query templates from data dictionary."""
        templates = {}

        # Template 1: Entity performance (from materialized view)
        templates["entity_performance"] = {
            "description": f"Get performance metrics for {self.dictionary['config']['primary_entity']}(s)",
            "params": ["entity_id", "group"],  # All optional
            "generator": self._gen_entity_performance,
        }

        # Template 2: Time series trends
        if self.dictionary["time_series_candidates"]:
            templates["trends"] = {
                "description": "Get metric trends over time",
                "params": ["entity_id", "group", "metric", "days"],
                "generator": self._gen_trends,
            }

        # Template 3: Text record analysis
        if self.dictionary["text_columns"]:
            templates["text_records"] = {
                "description": "Get text records (complaints, tickets, etc.)",
                "params": ["entity_id", "status", "category"],
                "generator": self._gen_text_records,
            }

        # Template 4: Entity locations (if geo columns exist)
        if self.dictionary["geo_columns"]:
            templates["entity_locations"] = {
                "description": "Get entity coordinates for geographic visualization",
                "params": ["entity_id", "group"],
                "generator": self._gen_locations,
            }

        # Template 5: Top items (products, categories, etc.) for each related table
        for table in self.dictionary["tables"]:
            if table != self.dictionary["hub_entity"]:
                templates[f"top_{table}"] = {
                    "description": f"Get top records from {table}",
                    "params": ["entity_id", "limit"],
                    "generator": lambda params, t=table: self._gen_top_items(params, t),
                }

        # Template 6: Group summary
        templates["group_summary"] = {
            "description": f"Get aggregated metrics per {self.dictionary['config']['group_entity']}",
            "params": ["group"],
            "generator": self._gen_group_summary,
        }

        return templates

    def generate_query(self, template_name: str, params: dict) -> tuple[str, tuple]:
        """Generate (sql_string, params_tuple) from a named template."""
        template = self.templates.get(template_name)
        if not template:
            raise ValueError(f"Unknown template: {template_name}")
        return template["generator"](params)

    def _gen_entity_performance(self, params: dict) -> tuple[str, tuple]:
        """Safe parameterized query against the performance materialized view."""
        view = f"{self.dictionary['config']['primary_entity']}_performance_features"
        sql = f"SELECT * FROM {view} WHERE 1=1"
        values = []
        if params.get("entity_id"):
            sql += " AND entity_id = %s"
            values.append(params["entity_id"])
        if params.get("group"):
            group_col = self._find_group_column(view)
            if group_col:
                sql += f" AND {group_col} = %s"
                values.append(params["group"])
        return sql, tuple(values)

    # ... similar generators for each template ...
```

**LLM SQL Fallback** (when no template matches):

```python
class SQLSanitizer:
    """Validates LLM-generated SQL is safe to execute."""

    FORBIDDEN = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE",
                 "TRUNCATE", "GRANT", "REVOKE", "COPY", "EXECUTE"]

    def sanitize(self, sql: str) -> str:
        """Validate SQL is read-only and safe."""
        upper = sql.upper().strip()

        # Must start with SELECT or WITH
        if not (upper.startswith("SELECT") or upper.startswith("WITH")):
            raise ValueError("Only SELECT queries allowed")

        # No mutation keywords
        for word in self.FORBIDDEN:
            if word in upper:
                raise ValueError(f"Forbidden keyword: {word}")

        # No semicolons (prevent multi-statement)
        if ";" in sql.rstrip(";").rstrip():
            raise ValueError("Multiple statements not allowed")

        # Wrap in timeout
        return f"SET statement_timeout = '10s'; {sql}"
```

### 7.3 Query Engine (9-Step Pipeline)

**File**: `intelligence/ai_engine/orchestrator/query_engine.py`

This is the central brain. Each step is a separate method, and partial failures don't break the pipeline.

```python
class QueryEngine:
    """9-step LLM orchestration pipeline. Adapts to any dataset via data_dictionary."""

    LLM_MODEL = "gpt-4o"
    LLM_TEMPERATURE = 0.3

    def __init__(self, data_dictionary: dict):
        self.dictionary = data_dictionary
        self.sql_generator = SQLGenerator(data_dictionary)
        self.vector_service = VectorService()
        self.prompts = PromptBuilder(data_dictionary)

        # Build available model list (only models that can run on this data)
        self.available_models = self._detect_available_models()

    def query(self, question: str, user_id: str = None,
              context: dict = None) -> dict:
        """Execute the full 9-step pipeline."""
        errors = []

        # Step 1: Classify intent
        intent_result = self._classify_intent(question)

        # Step 2: Generate plan
        plan = self._generate_plan(question, intent_result)

        # Step 2a: Inject scope from user context
        plan = self._inject_scope(plan, context)

        # Step 2b: Resolve entity names to IDs
        plan = self._resolve_entity_params(plan, question)

        # Steps 3-5: Execute data sources (parallel where possible)
        sql_results = self._execute_sql(plan, errors)      # Step 3
        ml_results = self._execute_ml(plan, errors)         # Step 4
        vector_results = self._execute_vectors(plan, question, errors)  # Step 5

        # Step 6: Build context
        context_str = self._build_context(sql_results, ml_results, vector_results, errors)

        # Step 7: Generate narrative
        narrative = self._generate_narrative(question, context_str)

        # Step 8: Recommend and map visualizations
        visualizations = self._select_visualizations(question, context_str, narrative)
        visualizations = self._map_chart_data(visualizations,
                                               {"sql": sql_results, "ml": ml_results, "vector": vector_results})

        # Step 9: Generate follow-up questions
        followups = self._generate_followups(question, narrative)

        # Save to QA history
        self._save_qa(question, narrative, intent_result, user_id, context)

        return {
            "answer": narrative,
            "visualizations": visualizations,
            "follow_up_questions": followups,
            "execution_path": self._build_execution_path(plan),
            "sources": self._collect_sources(sql_results, ml_results, vector_results),
            "metadata": {
                "intent": intent_result.get("intent"),
                "intent_confidence": intent_result.get("confidence"),
                "entities": intent_result.get("entities", {}),
                "scope": context or {},
                "errors": errors if errors else None,
                "user_id": user_id,
            }
        }
```

### 7.4 Context Builder

**File**: `intelligence/ai_engine/orchestrator/context_builder.py`

Formats all data into a token-budgeted string with semantic type formatting:

```python
class ContextBuilder:
    """Formats SQL/ML/Vector results into LLM context with token budget."""

    MAX_CONTEXT_TOKENS = 8000
    CHARS_PER_TOKEN = 4

    def __init__(self, data_dictionary: dict):
        self.dictionary = data_dictionary
        self.semantic_types = {
            col_key: col_info["semantic_type"]
            for table in data_dictionary["tables"].values()
            for col_key, col_info in table["columns"].items()
        }

    def build(self, sql_results, ml_results, vector_results, errors) -> str:
        sections = []
        sections.append(self._format_sql(sql_results))
        sections.append(self._format_ml(ml_results))
        sections.append(self._format_vectors(vector_results))
        if errors:
            sections.append(self._format_errors(errors))
        context = "\n\n".join(s for s in sections if s)
        return self._enforce_token_budget(context)

    def _format_value(self, column_name: str, value) -> str:
        """Format a value based on its column's semantic type."""
        sem_type = self._get_semantic_type(column_name)
        if sem_type == "currency":
            return f"${value:,.2f}" if isinstance(value, (int, float)) else str(value)
        elif sem_type == "percentage":
            return f"{value:.1f}%" if isinstance(value, (int, float)) else str(value)
        elif sem_type == "count":
            return f"{value:,}" if isinstance(value, (int, float)) else str(value)
        return str(value)
```

### 7.5 Chart Data Mapper

**File**: `intelligence/ai_engine/orchestrator/chart_data_mapper.py`

Transforms raw SQL/ML/Vector results into React chart component contracts:

```python
CHART_PALETTE = ["#4285F4", "#34A853", "#FBBC04", "#EA4335",
                 "#8E24AA", "#00ACC1", "#FF7043", "#9E9D24"]

def prepare_chart_data(visualizations: list, structured_data: dict,
                       data_dictionary: dict) -> list:
    """Attach chart-ready 'data' to each visualization."""
    entity_name_map = _build_entity_name_map(structured_data, data_dictionary)

    mappers = {
        "line": map_line,
        "bar": map_bar,
        "combo": map_combo,
        "heatmap": map_heatmap,
        "geo": map_geo,
        "forecast_cone": map_forecast,
        "risk_matrix": map_risk,
        "radar": map_radar,
        "waterfall": map_waterfall,
        "network": map_network,
        "decomposition_tree": map_tree,
        "cluster": map_cluster,
    }

    for viz in visualizations:
        mapper = mappers.get(viz.get("type"))
        if mapper:
            chart_data = mapper(viz, structured_data, entity_name_map, data_dictionary)
            if chart_data:
                viz["data"] = chart_data

    return visualizations
```

**Each mapper returns the exact data shape expected by the corresponding React chart component.** See Section 8 for the component contracts.

### 7.6 LLM Configuration

```python
# Temperature settings (low for analytical accuracy)
LLM_TEMPERATURE = 0.3

# Max tokens per step
LLM_MAX_TOKENS = {
    "classify": 500,
    "plan": 800,
    "narrative": 1500,
    "visualization": 600,
    "followup": 400,
}
```

---

## 8. Phase 5 — Frontend Executive OS Dashboard

> **Goal**: Build a 3-panel executive dashboard with an entity network graph, dynamic chart canvas, and AI chat assistant.

### 8.1 Technology Stack

```json
{
  "react": "^18.3.0",
  "react-dom": "^18.3.0",
  "react-router-dom": "^6.28.0",
  "@reduxjs/toolkit": "^2.5.0",
  "react-redux": "^9.2.0",
  "styled-components": "^6.1.0",
  "d3": "^7.9.0",
  "chart.js": "^4.4.0",
  "react-chartjs-2": "^5.2.0",
  "leaflet": "^1.9.0",
  "react-leaflet": "^4.2.0",
  "axios": "^1.7.0",
  "vite": "^6.0.0"
}
```

Dev dependencies: `vitest`, `@testing-library/react`, `jsdom`, `eslint`.

### 8.2 Three-Panel Layout

**File**: `intelligence/frontend/src/components/Layout/IntelligenceOSLayout.jsx`

```
┌──────────────────────────────────────────────────────────────┐
│  TopBar (48px): PROJECT_NAME | Scope Badge | Theme Toggle    │
├──────────┬─────────────────────────────┬─────────────────────┤
│          │                             │                     │
│  LEFT    │    CENTER CANVAS            │   RIGHT PANEL       │
│  PANEL   │                             │                     │
│  260px   │  Executive Insights Header  │   AI Assistant      │
│          │  Context Breadcrumb         │   Chat Interface    │
│  Entity  │  Dynamic Chart Grid         │   Follow-up Pills   │
│  Map     │  (13 chart types)           │   System Health     │
│  (D3)    │  Auto Insights Grid         │   Starter Questions │
│          │                             │                     │
│(collapse │                             │  (collapse to 0px)  │
│  to 60px)│                             │                     │
├──────────┴─────────────────────────────┴─────────────────────┤
│  StatusBar (24px): Last Refresh | Execution Path             │
└──────────────────────────────────────────────────────────────┘
```

**Responsive breakpoints:**
- Desktop (>1024px): 3 panels
- Tablet (768-1024px): 2 panels (left collapsed, right as overlay)
- Mobile (<768px): 1 panel with bottom navigation

### 8.3 Left Panel — Intelligence Map (D3 Force Graph)

**File**: `intelligence/frontend/src/components/IntelligenceMap/IntelligenceMap.jsx`

**What it shows**: A force-directed graph of all entities, grouped by `GROUP_ENTITY`.

**Altitude model** (2-level hierarchy):
- **Level 1 — Groups**: Show `GROUP_ENTITY` bubbles (e.g., regions, departments). Size = total metric, Color = risk level.
- **Level 2 — Entities**: Click a group to drill into individual entities. Size = primary metric, Color = health/risk.

**Node data contract** (from `intelligenceMapSlice`):

```javascript
{
  id: "entity-001",
  label: "Entity Name",
  entityId: "entity-001",
  group: "Group Name",                    // GROUP_ENTITY value
  primaryMetric: 125000,                  // For sizing (e.g., revenue)
  riskScore: 45,                          // 0-100
  riskLevel: "medium",                    // critical/high/medium/low
  health: 55,                             // 0-100
  anomalyDetected: false,
  lat: 32.7767,                           // Optional (enables geo map)
  lng: -96.7970,                          // Optional
  factors: { /* risk contributing factors */ },
  // ... additional metrics from performance view
}
```

**D3 force configuration:**
- Forces: link, charge (-400 to -600), center, collision (radius 50-70)
- Adaptive: different force strengths per altitude level
- Node radius: sqrt scale from min to max primary metric
- Colors: `#34A853` (healthy/low risk) → `#F9AB00` (medium) → `#D93025` (high/critical)

**Interactions:**
- **Click node**: Drill down (Group → Entity) or select entity
- **Right-click**: Context menu (performance, risk, forecast, text analysis)
- **Hover**: Tooltip with key metrics and "Click to drill in"
- **Escape**: Ascend back to group level
- **Similarity toggle**: Show/hide pairwise similarity edges (from vector service)

### 8.4 Center Panel — Dynamic Canvas

**File**: `intelligence/frontend/src/components/Canvas/DynamicCanvas.jsx`

**13 lazy-loaded chart components**, each in its own file under `charts/`:

| Component | Chart.js/D3 | Data Contract (props.data) |
|-----------|-------------|---------------------------|
| `LineChart` | Chart.js | `{labels: [dates], datasets: [{label, data, borderColor}]}` |
| `BarChart` | Chart.js | `{labels: [names], datasets: [{label, data, backgroundColor}]}` |
| `ComboChart` | Chart.js | `{labels, datasets: [{type:"bar"\|"line", yAxisID:"y"\|"y1", data}]}` |
| `HeatmapChart` | D3 | `{rows: [names], columns: [metrics], values: [[2D array]]}` |
| `GeoMap` | Leaflet | `{stores: [{name, lat, lng, metrics: {revenue, health}}]}` |
| `NetworkGraph` | D3 | `{nodes: [{id, label, group, radius}], links: [{source, target, weight}]}` |
| `RadarChart` | Chart.js | `{labels: [dimensions], datasets: [{label, data}]}` |
| `WaterfallChart` | D3 | `{steps: [{label, value, type:"increase"\|"decrease"\|"total"}]}` |
| `ForecastCone` | Chart.js | `{dates, actual: [], forecast: [], upper: [], lower: []}` |
| `RiskMatrix` | D3 | `{items: [{name, likelihood: 0-5, impact: 0-5, label}]}` |
| `DecompositionTree` | D3 | `{name, value, children: [{name, value, children: [...]}]}` |
| `RootCausePanel` | D3 | `{features: [{name, impact, direction}], target_metric}` |
| `ClusterView` | D3 | `{clusters: [{id, keywords: [], count, samples: []}]}` |

**Smart features:**
- `chartAutoSelector.js`: Picks best chart type from data shape if backend doesn't specify
- `chartKPIExtractor.js`: Extracts key metrics as colored badges on each chart card
- **Drill-through**: Every chart fires `onElementClick({label, metric, value})` which dispatches a contextual AI query
- **cursor: pointer** on all clickable charts

### 8.5 Right Panel — AI Assistant

**File**: `intelligence/frontend/src/components/AIAssistant/AIAssistant.jsx`

**Components:**
1. **SystemHealthBar** — Color-coded service status (green/yellow/red)
2. **AlertFeed** — High-priority alerts from risk scorer
3. **ChatMessages** — Scrollable message list (user + AI)
4. **ThinkingIndicator** — 5-step pipeline animation while processing:
   - "Classifying intent..."
   - "Planning data sources..."
   - "Executing queries..."
   - "Running ML models..."
   - "Generating analysis..."
5. **SuggestedQuestions** — Follow-up question pills from last response
6. **StarterQuestions** — Context-aware initial questions:

```javascript
// Generated dynamically from config:
const starterQuestions = {
  GLOBAL: [
    `Which ${PRIMARY_ENTITY_PLURAL} need immediate attention?`,
    `Show me ${PRIMARY_ENTITY} performance trends`,
    `Are there any anomalies across ${PRIMARY_ENTITY_PLURAL}?`,
    `What are the top risk factors?`,
  ],
  GROUP: (groupName) => [
    `Which ${PRIMARY_ENTITY_PLURAL} in ${groupName} need attention?`,
    `Compare ${PRIMARY_ENTITY} performance in ${groupName}`,
    `Any patterns in ${groupName}?`,
  ],
  ENTITY: (entityName) => [
    `What are the key risk factors for ${entityName}?`,
    `Show ${entityName} trends`,
    `Forecast ${entityName} performance for 90 days`,
    `What's causing ${entityName}'s issues?`,
  ],
};
```

### 8.6 Redux Store (8 Slices)

**File**: `intelligence/frontend/src/store/index.js`

```javascript
const store = configureStore({
  reducer: {
    auth: authReducer,              // User session (JWT, profile)
    ui: uiReducer,                  // Theme, panel collapse state
    context: contextReducer,        // Scope hierarchy (GLOBAL→GROUP→ENTITY→METRIC)
    intelligenceMap: mapReducer,    // D3 nodes, edges, altitude, selection
    canvas: canvasReducer,          // Visualizations, insights, KPIs
    aiAssistant: assistantReducer,  // Messages, processing, health, suggestions
    orchestrator: orchestratorReducer, // Last response, execution path
    executive: executiveReducer,    // Summary, alerts, KPI headers
  },
});
```

**Context slice** — drives the entire UI hierarchy:

```javascript
// contextSlice.js
initialState: {
  scope: "GLOBAL",       // GLOBAL | GROUP | ENTITY | METRIC
  group: null,           // GROUP_ENTITY value (e.g., region name)
  entityId: null,        // PRIMARY_ENTITY ID
  entityName: null,      // Display name
  metric: null,          // Specific metric being analyzed
  originType: null,      // "query" | "map_click" | "chart_drill" | "insight_drill"
  originQuery: null,
  analysisMode: "performance",
  updatedAt: null,
}

// Actions:
setContext(payload)      // Full override
drillDown(payload)       // Smart descent (GLOBAL→GROUP or GROUP→ENTITY)
drillUp()               // Ascend one level
resetContext()          // Back to GLOBAL
```

### 8.7 Theme System

**File**: `intelligence/frontend/src/styles/theme.js`

```javascript
const baseTheme = {
  fontSizes: { xs: "10px", sm: "12px", md: "14px", lg: "18px", xl: "24px" },
  spacing: { xs: "4px", sm: "8px", md: "16px", lg: "24px", xl: "32px" },
  borderRadius: { sm: "4px", md: "8px", lg: "12px", full: "9999px" },
  breakpoints: { mobile: "480px", tablet: "768px", desktop: "1024px" },
  shadows: { sm: "...", md: "...", lg: "..." },
  chartColors: ["#4285F4", "#34A853", "#FBBC04", "#EA4335", "#8E24AA",
                "#00ACC1", "#FF7043", "#9E9D24"],
};

export const lightTheme = {
  ...baseTheme,
  colors: {
    primary: "#1A73E8", background: "#FFFFFF", surface: "#F8F9FA",
    text: "#202124", textSecondary: "#5F6368", border: "#DADCE0",
    success: "#188038", error: "#D93025", warning: "#F9AB00",
  },
};

export const darkTheme = {
  ...baseTheme,
  colors: {
    primary: "#8AB4F8", background: "#202124", surface: "#292A2D",
    text: "#E8EAED", textSecondary: "#9AA0A6", border: "#3C4043",
    success: "#81C995", error: "#F28B82", warning: "#FDD663",
  },
};
```

### 8.8 Service Layer

**File**: `intelligence/frontend/src/services/api.js`

```javascript
const api = axios.create({
  baseURL: "/",          // Proxied through gateway
  timeout: 120000,       // 2 minutes (ML models can be slow)
});

// Request interceptor: attach JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor: redirect on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) window.location.href = "/login";
    return Promise.reject(error);
  }
);
```

**File**: `intelligence/frontend/src/services/orchestratorService.js`

```javascript
export const queryOrchestrator = (question, userId, context) =>
  api.post("/orchestrator/query", { question, user_id: userId, context });

export const getExecutiveSummary = (params) =>
  api.get("/orchestrator/executive-summary", { params });

export const getRankedInsights = (params) =>
  api.get("/orchestrator/ranked-insights", { params });

export const getSystemHealth = () =>
  api.get("/orchestrator/health");

export const getEntityNetwork = () =>
  api.get("/orchestrator/entity-network");

export const getEntitySimilarity = (threshold = 0.5) =>
  api.get("/orchestrator/entity-similarity", { params: { threshold } });
```

---

## 9. Phase 6 — Infrastructure

### 9.1 Docker Compose

**File**: `intelligence/docker-compose.yml`

```yaml
version: "3.8"

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: ${PROJECT_NAME}_intelligence
      POSTGRES_USER: ${PROJECT_NAME}_user
      POSTGRES_PASSWORD: ${DB_PASSWORD:-changeme}
    ports:
      - "5433:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${PROJECT_NAME}_user"]
      interval: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 5

  ai_engine:
    build: ./ai_engine
    ports:
      - "5000:5000"
    environment:
      DATABASE_URL: postgres://${PROJECT_NAME}_user:${DB_PASSWORD:-changeme}@postgres:5432/${PROJECT_NAME}_intelligence
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      REDIS_URL: redis://redis:6379/1
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/health"]
      interval: 10s
      retries: 5

  frontend:
    build: ./frontend
    ports:
      - "3010:3000"
    depends_on:
      ai_engine:
        condition: service_healthy

  gateway:
    build: ./gateway
    ports:
      - "8080:80"
      - "8443:443"
    depends_on:
      - frontend
      - ai_engine

  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3100:3000"
    environment:
      GF_SECURITY_ADMIN_PASSWORD: admin

volumes:
  pgdata:
```

### 9.2 Gateway (Nginx)

**File**: `intelligence/gateway/nginx.conf`

```nginx
upstream ai_engine {
    server ai_engine:5000;
}
upstream frontend {
    server frontend:3000;
}

# HTTP → HTTPS redirect
server {
    listen 80;
    server_name localhost;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name localhost;

    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 10m;

    # AI Engine routes
    location /orchestrator/ {
        proxy_pass http://ai_engine;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }

    location /vectors/ {
        proxy_pass http://ai_engine;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /ml/ {
        proxy_pass http://ai_engine;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    # Health checks
    location /health/ai {
        proxy_pass http://ai_engine/health;
    }

    location /health {
        return 200 '{"status":"ok","service":"gateway"}';
        add_header Content-Type application/json;
    }

    # Frontend — HTML (no cache)
    location ~ ^/(?:intelligence|login|$) {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Cache-Control;
        proxy_hide_header ETag;
        add_header Cache-Control "no-cache, no-store, must-revalidate, max-age=0" always;
    }

    # Frontend (catch-all for SPA)
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 9.3 AI Engine Dockerfile

**File**: `intelligence/ai_engine/Dockerfile`

```dockerfile
FROM python:3.12-slim

# Required for compiled packages (hdbscan, psycopg2, xgboost)
RUN apt-get update && apt-get install -y gcc g++ libpq-dev curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 5000
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "app:app"]
```

### 9.4 Frontend Dockerfile

**File**: `intelligence/frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
```

### 9.5 Self-Signed SSL Certs

```bash
mkdir -p intelligence/gateway/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout intelligence/gateway/certs/server.key \
  -out intelligence/gateway/certs/server.crt \
  -subj "/CN=localhost"
```

---

## 10. Testing Strategy

### 10.1 AI Engine Tests (pytest)

```
intelligence/ai_engine/tests/
├── test_discovery/
│   ├── test_schema_inspector.py     # Mock information_schema queries
│   ├── test_data_profiler.py        # Test profiling with sample tables
│   ├── test_semantic_classifier.py  # Test column classification heuristics
│   └── test_relationship_mapper.py  # Test FK and inferred relationship detection
├── test_models/
│   ├── test_anomaly_detector.py     # Test with synthetic DataFrames
│   ├── test_forecaster.py           # Test with synthetic time series
│   ├── test_text_clusterer.py       # Test with sample text arrays
│   ├── test_root_cause_explainer.py # Test SHAP output shape
│   └── test_risk_scorer.py          # Test normalization and scoring
├── test_orchestrator/
│   ├── test_query_engine.py         # Mock LLM calls, test pipeline flow
│   ├── test_sql_generator.py        # Test parameterized query generation
│   ├── test_context_builder.py      # Test formatting and token budget
│   └── test_chart_data_mapper.py    # Test each chart type mapper
├── test_services/
│   ├── test_embedding_service.py    # Mock OpenAI API
│   └── test_vector_service.py       # Test pgvector queries
└── conftest.py                      # Shared fixtures, mock DB
```

**Run**: `cd intelligence/ai_engine && python -m pytest`

### 10.2 Frontend Tests (vitest)

```
intelligence/frontend/src/
├── __tests__/
│   ├── App.test.jsx                 # Route rendering, auth guards
│   └── IntelligenceOSPage.test.jsx  # Page-level integration
├── components/
│   ├── Canvas/__tests__/
│   │   ├── DynamicCanvas.test.jsx   # Chart rendering, drill-through
│   │   ├── GeoMap.test.jsx          # Map rendering, click handlers
│   │   ├── HeatmapChart.test.jsx    # D3 chart rendering
│   │   ├── BarChart.test.jsx        # Chart.js rendering
│   │   ├── LineChart.test.jsx
│   │   ├── ComboChart.test.jsx
│   │   ├── RadarChart.test.jsx
│   │   ├── ForecastCone.test.jsx
│   │   ├── RiskMatrix.test.jsx
│   │   ├── WaterfallChart.test.jsx
│   │   ├── NetworkGraph.test.jsx
│   │   └── AutoInsightsGrid.test.jsx
│   ├── AIAssistant/__tests__/
│   │   └── AIAssistant.test.jsx     # Chat flow, processing states
│   └── IntelligenceMap/__tests__/
│       └── IntelligenceMap.test.jsx  # D3 rendering, interactions
├── store/__tests__/
│   ├── contextSlice.test.js         # Scope transitions
│   ├── canvasSlice.test.js          # Visualization state
│   └── aiAssistantSlice.test.js     # Message management
```

**Run**: `cd intelligence/frontend && npx vitest run`

### 10.3 Minimum Coverage Targets

| Layer | Target |
|-------|--------|
| Data Discovery | 90% (critical for correctness) |
| ML Models | 80% (test with synthetic data) |
| Orchestrator | 85% (mock LLM, test pipeline logic) |
| Frontend Components | 75% (render + interaction tests) |
| Redux Slices | 90% (state management logic) |

---

## 11. Configuration Reference

### 11.1 Environment Variables

```bash
# Required
OPENAI_API_KEY=sk-...                                    # GPT-4o + embeddings
DATABASE_URL=postgres://user:pass@host:5432/dbname       # Target database

# Optional (with defaults)
LLM_MODEL=gpt-4o                                         # LLM model ID
LLM_TEMPERATURE=0.3                                       # Analytical accuracy
EMBEDDING_MODEL=text-embedding-3-small                    # Embedding model
EMBEDDING_DIMENSIONS=1536                                 # Vector dimensions
REDIS_URL=redis://redis:6379/1                            # Cache/session store
MAX_CONTEXT_TOKENS=8000                                   # Context window budget
SQL_TIMEOUT=10s                                           # Per-query timeout
ML_ANOMALY_CONTAMINATION=0.1                              # Expected anomaly rate
ML_FORECAST_PERIODS=90                                    # Default forecast horizon
ML_CLUSTER_MIN_SIZE=5                                     # HDBSCAN min cluster
ML_XGBOOST_ESTIMATORS=100                                 # XGBoost trees
ML_XGBOOST_DEPTH=6                                        # Max tree depth
RISK_CRITICAL_THRESHOLD=80                                # Risk level thresholds
RISK_HIGH_THRESHOLD=60
RISK_MEDIUM_THRESHOLD=40
```

### 11.2 LLM Token Budgets

| Pipeline Step | Max Tokens | Temperature |
|--------------|------------|-------------|
| Intent Classification | 500 | 0.3 |
| Plan Generation | 800 | 0.3 |
| Narrative Generation | 1500 | 0.4 |
| Visualization Selection | 600 | 0.3 |
| Follow-up Generation | 400 | 0.5 |

---

## 12. Comprehensive Checklist

### Phase 0: Data Discovery

- [ ] `intelligence/ai_engine/discovery/__init__.py`
- [ ] `intelligence/ai_engine/discovery/schema_inspector.py` — Query information_schema for tables, columns, types, foreign keys, primary keys, indexes, row counts
- [ ] `intelligence/ai_engine/discovery/data_profiler.py` — Sample rows, compute cardinality, null rates, distributions, min/max/mean for numerics, top values for categoricals
- [ ] `intelligence/ai_engine/discovery/semantic_classifier.py` — Classify columns into semantic types (currency, percentage, count, score, date, ID, name, description, category, geo, boolean)
- [ ] `intelligence/ai_engine/discovery/relationship_mapper.py` — Map explicit FK relationships + inferred relationships from `{table}_id` naming patterns. Detect hub entity.
- [ ] `intelligence/ai_engine/discovery/dictionary_builder.py` — Assemble all discovery into `data_dictionary.json`
- [ ] `intelligence/ai_engine/discovery/view_generator.py` — Auto-generate materialized view SQL from data dictionary
- [ ] `intelligence/config.yaml` — User configuration file with all required values
- [ ] `intelligence/data_dictionary.json` — Generated output (committed after first run)
- [ ] `intelligence/ai_engine/tests/test_discovery/test_schema_inspector.py`
- [ ] `intelligence/ai_engine/tests/test_discovery/test_data_profiler.py`
- [ ] `intelligence/ai_engine/tests/test_discovery/test_semantic_classifier.py`
- [ ] `intelligence/ai_engine/tests/test_discovery/test_relationship_mapper.py`

### Phase 1: Database Layer

- [ ] `intelligence/ai_engine/migrations/001_enable_extensions.sql` — Enable pgvector and uuid-ossp
- [ ] `intelligence/ai_engine/migrations/002_create_entity_summaries.sql` — entity_summaries table with vector column
- [ ] `intelligence/ai_engine/migrations/003_create_qa_history.sql` — qa_history table with vector column
- [ ] `intelligence/ai_engine/migrations/004_add_vector_columns.sql` — Add `_embedding vector(1536)` to text-bearing tables
- [ ] `intelligence/ai_engine/migrations/005_create_materialized_views.sql` — Auto-generated performance views
- [ ] `intelligence/ai_engine/migrations/006_create_indexes.sql` — ivfflat indexes on vector columns, GIN indexes on JSONB
- [ ] Materialized view refresh script (cron or scheduled)
- [ ] Verify all migrations run idempotently

### Phase 2: Vector Intelligence

- [ ] `intelligence/ai_engine/services/__init__.py`
- [ ] `intelligence/ai_engine/services/embedding_service.py` — OpenAI embedding wrapper with batching and retry
- [ ] `intelligence/ai_engine/services/embedding_pipeline.py` — Batch embed text columns + generate and embed entity summaries
- [ ] `intelligence/ai_engine/services/vector_service.py` — 4 search functions: similar text, similar entities, semantic search, QA context
- [ ] Entity similarity network function (for D3 graph)
- [ ] Background startup task: auto-embed on first boot
- [ ] `intelligence/ai_engine/tests/test_services/test_embedding_service.py`
- [ ] `intelligence/ai_engine/tests/test_services/test_vector_service.py`

### Phase 3: ML Intelligence

- [ ] `intelligence/ai_engine/models/__init__.py`
- [ ] `intelligence/ai_engine/models/anomaly_detector.py` — Isolation Forest with auto-feature selection from data dictionary
- [ ] `intelligence/ai_engine/models/forecaster.py` — Prophet with auto-detected time series
- [ ] `intelligence/ai_engine/models/text_clusterer.py` — HDBSCAN + TF-IDF on any text column
- [ ] `intelligence/ai_engine/models/root_cause_explainer.py` — XGBoost + SHAP for any target metric
- [ ] `intelligence/ai_engine/models/risk_scorer.py` — Weighted composite with auto-discovered dimensions
- [ ] Each model: `can_run(data_dictionary) -> bool` check
- [ ] Each model: `detect_from_db()` / `forecast_from_db()` / `explain_from_db()` DB-integrated method
- [ ] `intelligence/ai_engine/tests/test_models/test_anomaly_detector.py`
- [ ] `intelligence/ai_engine/tests/test_models/test_forecaster.py`
- [ ] `intelligence/ai_engine/tests/test_models/test_text_clusterer.py`
- [ ] `intelligence/ai_engine/tests/test_models/test_root_cause_explainer.py`
- [ ] `intelligence/ai_engine/tests/test_models/test_risk_scorer.py`

### Phase 4: LLM Orchestration

- [ ] `intelligence/ai_engine/orchestrator/__init__.py`
- [ ] `intelligence/ai_engine/orchestrator/prompts.py` — 5 template prompt builders (intent, plan, narrative, viz, followup) that inject data dictionary
- [ ] `intelligence/ai_engine/orchestrator/sql_generator.py` — Auto-generated parameterized SQL templates + LLM fallback with sanitizer
- [ ] `intelligence/ai_engine/orchestrator/query_engine.py` — 9-step pipeline: classify → plan → scope inject → resolve names → execute SQL/ML/Vector → build context → narrative → viz → followups
- [ ] `intelligence/ai_engine/orchestrator/context_builder.py` — Token-budgeted formatting with semantic type detection
- [ ] `intelligence/ai_engine/orchestrator/chart_data_mapper.py` — 13 chart type mappers (line, bar, combo, heatmap, geo, forecast, risk, radar, waterfall, network, tree, root_cause, cluster)
- [ ] `intelligence/ai_engine/orchestrator/sql_sanitizer.py` — Read-only SQL validation for LLM-generated queries
- [ ] Response assembly with execution_path, sources, metadata
- [ ] QA history save (embed question + store answer)
- [ ] `intelligence/ai_engine/routes/orchestrator_routes.py` — POST /orchestrator/query, GET /orchestrator/health, GET /orchestrator/entity-network, GET /orchestrator/entity-similarity, GET /orchestrator/executive-summary, GET /orchestrator/ranked-insights
- [ ] `intelligence/ai_engine/routes/ml_routes.py` — GET /ml/anomaly, /ml/forecast, /ml/cluster, /ml/root-cause, /ml/risk-score
- [ ] `intelligence/ai_engine/routes/vector_routes.py` — POST /vectors/embed, /vectors/similar, /vectors/search, /vectors/embed-pipeline
- [ ] `intelligence/ai_engine/app.py` — Flask app with blueprint registration + background embed task
- [ ] `intelligence/ai_engine/tests/test_orchestrator/test_query_engine.py`
- [ ] `intelligence/ai_engine/tests/test_orchestrator/test_sql_generator.py`
- [ ] `intelligence/ai_engine/tests/test_orchestrator/test_context_builder.py`
- [ ] `intelligence/ai_engine/tests/test_orchestrator/test_chart_data_mapper.py`

### Phase 5: Frontend Dashboard

- [ ] `intelligence/frontend/package.json` — React 18, Redux Toolkit, D3, Chart.js, Leaflet, styled-components, Vite
- [ ] `intelligence/frontend/vite.config.js`
- [ ] `intelligence/frontend/index.html` — SPA entry with cache-busting meta tags
- [ ] `intelligence/frontend/src/index.jsx` — App mount with Redux Provider + ThemeProvider
- [ ] `intelligence/frontend/src/App.jsx` — Routes: /intelligence (protected), /login
- [ ] `intelligence/frontend/src/styles/theme.js` — Light + dark themes
- [ ] `intelligence/frontend/src/store/index.js` — 8-slice Redux store
- [ ] `intelligence/frontend/src/store/slices/authSlice.js` — Login, register, session restore
- [ ] `intelligence/frontend/src/store/slices/uiSlice.js` — Theme toggle, panel collapse
- [ ] `intelligence/frontend/src/store/slices/contextSlice.js` — Scope hierarchy (GLOBAL→GROUP→ENTITY→METRIC), drill down/up
- [ ] `intelligence/frontend/src/store/slices/intelligenceMapSlice.js` — Nodes, edges, altitude, selection, similarity toggle
- [ ] `intelligence/frontend/src/store/slices/canvasSlice.js` — Visualizations, insights, KPIs
- [ ] `intelligence/frontend/src/store/slices/aiAssistantSlice.js` — Messages, processing, health, follow-ups, sendQuery thunk
- [ ] `intelligence/frontend/src/store/slices/orchestratorSlice.js` — Last response, execution path
- [ ] `intelligence/frontend/src/store/slices/executiveSlice.js` — Summary, alerts
- [ ] `intelligence/frontend/src/services/api.js` — Axios with JWT interceptor, 120s timeout
- [ ] `intelligence/frontend/src/services/orchestratorService.js` — queryOrchestrator, getExecutiveSummary, getRankedInsights, getSystemHealth
- [ ] `intelligence/frontend/src/services/intelligenceService.js` — getEntityNetwork, getEntitySimilarity
- [ ] `intelligence/frontend/src/utils/chartAutoSelector.js` — Best chart type from data shape
- [ ] `intelligence/frontend/src/utils/chartKPIExtractor.js` — Extract metrics as badges
- [ ] `intelligence/frontend/src/utils/scopeGuard.js` — Build fetch params from scope
- [ ] `intelligence/frontend/src/components/Layout/IntelligenceOSLayout.jsx` — 3-panel shell (260px | flex | 380px)
- [ ] `intelligence/frontend/src/components/IntelligenceMap/IntelligenceMap.jsx` — D3 force-directed entity graph with altitude drill-down
- [ ] `intelligence/frontend/src/components/IntelligenceMap/MapTooltip.jsx` — Hover tooltip with entity metrics
- [ ] `intelligence/frontend/src/components/IntelligenceMap/MapContextMenu.jsx` — Right-click context menu
- [ ] `intelligence/frontend/src/components/Canvas/DynamicCanvas.jsx` — Lazy-loaded chart grid with drill-through
- [ ] `intelligence/frontend/src/components/Canvas/ChartTypeSelector.jsx` — Chart type filter pills
- [ ] `intelligence/frontend/src/components/Canvas/AutoInsightsGrid.jsx` — Ranked insight cards grid
- [ ] `intelligence/frontend/src/components/Canvas/InsightCard.jsx` — Clickable insight card with severity badge
- [ ] `intelligence/frontend/src/components/Canvas/ContextBreadcrumb.jsx` — GLOBAL > GROUP > ENTITY navigation
- [ ] `intelligence/frontend/src/components/Canvas/EntityDetailPanel.jsx` — Entity-scoped KPI summary panel
- [ ] `intelligence/frontend/src/components/Canvas/ExecutiveInsightHeader.jsx` — Top-level KPI cards
- [ ] `intelligence/frontend/src/components/Canvas/charts/LineChart.jsx`
- [ ] `intelligence/frontend/src/components/Canvas/charts/BarChart.jsx`
- [ ] `intelligence/frontend/src/components/Canvas/charts/ComboChart.jsx`
- [ ] `intelligence/frontend/src/components/Canvas/charts/HeatmapChart.jsx` (D3)
- [ ] `intelligence/frontend/src/components/Canvas/charts/GeoMap.jsx` (Leaflet — single-click drill)
- [ ] `intelligence/frontend/src/components/Canvas/charts/NetworkGraph.jsx` (D3)
- [ ] `intelligence/frontend/src/components/Canvas/charts/RadarChart.jsx`
- [ ] `intelligence/frontend/src/components/Canvas/charts/WaterfallChart.jsx` (D3)
- [ ] `intelligence/frontend/src/components/Canvas/charts/ForecastCone.jsx`
- [ ] `intelligence/frontend/src/components/Canvas/charts/RiskMatrix.jsx` (D3)
- [ ] `intelligence/frontend/src/components/Canvas/charts/DecompositionTree.jsx` (D3)
- [ ] `intelligence/frontend/src/components/Canvas/charts/RootCausePanel.jsx` (D3)
- [ ] `intelligence/frontend/src/components/Canvas/charts/ClusterView.jsx` (D3)
- [ ] `intelligence/frontend/src/components/AIAssistant/AIAssistant.jsx` — Chat interface with starter questions, processing indicator, follow-up pills
- [ ] `intelligence/frontend/src/components/Common/LoadingOverlay.jsx`
- [ ] `intelligence/frontend/src/components/Common/ThemeToggle.jsx`
- [ ] `intelligence/frontend/src/pages/IntelligenceOSPage.jsx` — Main page: context watcher, geo viz builder, effective viz list
- [ ] `intelligence/frontend/src/pages/LoginPage.jsx`

### Phase 6: Infrastructure

- [ ] `intelligence/docker-compose.yml` — PostgreSQL (pgvector), Redis, AI Engine, Frontend, Gateway, Prometheus, Grafana
- [ ] `intelligence/gateway/nginx.conf` — HTTPS + routing + compression + no-cache for HTML
- [ ] `intelligence/gateway/Dockerfile` — Nginx Alpine + SSL certs
- [ ] `intelligence/gateway/certs/server.crt` + `server.key` — Self-signed SSL
- [ ] `intelligence/ai_engine/Dockerfile` — Python 3.12 + gcc/g++/libpq-dev
- [ ] `intelligence/ai_engine/requirements.txt` — Flask, scikit-learn, pandas, prophet, hdbscan, xgboost, shap, openai, pgvector, psycopg2-binary, gunicorn, pytest
- [ ] `intelligence/frontend/Dockerfile` — Multi-stage: node build → nginx serve
- [ ] `intelligence/frontend/nginx.conf` — SPA serving with cache headers
- [ ] `intelligence/monitoring/prometheus.yml` — Scrape config for ai_engine
- [ ] Health check endpoints: `/health` on every service
- [ ] `.env.example` — Template environment file

### Phase 7: Testing & Validation

- [ ] All Phase 0 discovery tests pass
- [ ] All Phase 3 ML model tests pass (synthetic data)
- [ ] All Phase 4 orchestrator tests pass (mocked LLM)
- [ ] All Phase 5 frontend component tests pass
- [ ] `docker compose up -d` — All services start and pass health checks
- [ ] Data discovery runs successfully on target database
- [ ] Embedding pipeline completes without errors
- [ ] Ask 5 test questions via AI Assistant — all return narratives + visualizations
- [ ] Click entity on map → drill-through works → AI panel shows analysis
- [ ] Click chart element → drill-through works → AI panel shows analysis
- [ ] Click insight card → follow-up query triggers
- [ ] Dark/light theme toggle works across all panels
- [ ] Responsive layout: test at desktop, tablet, mobile breakpoints

---

## Quick Start

```bash
# 1. Configure
cp intelligence/config.yaml.example intelligence/config.yaml
# Edit config.yaml with your values

# 2. Start infrastructure
cd intelligence && docker compose up -d postgres redis

# 3. Run data discovery
cd ai_engine && python -m discovery.dictionary_builder --config ../config.yaml

# 4. Run migrations
python -m migrations.run_all

# 5. Run embedding pipeline
python -m services.embedding_pipeline

# 6. Start all services
cd .. && docker compose up -d

# 7. Open dashboard
open https://localhost:8443/intelligence
```
