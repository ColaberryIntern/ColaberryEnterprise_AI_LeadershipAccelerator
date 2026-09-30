# Intelligence Engine (Python)

A Flask service providing the capabilities that are simply better in Python than in Node: vector embeddings, classical ML, schema discovery, and natural-language-to-SQL.

Runs as the `intelligence` container on port **5000**. The Node backend reaches it at `INTELLIGENCE_ENGINE_URL=http://intelligence:5000`.

> **Not to be confused with [`backend/src/intelligence/`](../backend/src/intelligence/README.md)**, which is the TypeScript decision layer. Different service, different language, different job. This one computes; that one decides.

---

## Stack

Flask 3.1 + gunicorn, psycopg2 + pgvector, OpenAI SDK, scikit-learn, pandas, numpy, xgboost, shap, hdbscan, nltk. Tests with pytest.

Entry point: [ai_engine/app.py](ai_engine/app.py) — a `create_app()` factory registering four blueprints with lazy imports, plus `/health` and `/config`. `/config` redacts `openai_api_key` and `database_url` before returning.

Blueprint registration is wrapped in `try/except ImportError: pass`, so a blueprint whose dependencies are unavailable is skipped rather than crashing boot. Convenient, but it means **a missing route may indicate a silent import failure rather than a routing bug.** Check the logs before assuming the route was never written.

---

## Modules

### `discovery/` — understand an unfamiliar database

| File | Job |
|---|---|
| `schema_inspector.py` | Read the schema |
| `data_profiler.py` | Profile actual column contents |
| `relationship_mapper.py` | Infer relationships between tables |
| `semantic_classifier.py` | Classify columns by meaning, not just type |
| `dictionary_builder.py` | Assemble a data dictionary |
| `view_generator.py` | Generate useful views |

This is what lets the platform point at a client's database and describe it without a human writing the mapping. The TypeScript side mirrors these names in `backend/src/intelligence/discovery/`.

### `orchestrator/` — natural language to answer

`context_builder.py` → `sql_generator.py` → **`sql_sanitizer.py`** → `query_engine.py` → `chart_data_mapper.py`, with prompts in `prompts.py`.

`sql_sanitizer.py` is the security boundary. LLM-generated SQL is untrusted input by definition; it is sanitized before execution, not after.

### `models/` — classical ML

`base_model.py`, `forecaster.py`, `anomaly_detector.py`, `risk_scorer.py`, `text_clusterer.py`, `root_cause_explainer.py`

`root_cause_explainer.py` uses SHAP, so explanations are attributions rather than model narration. That distinction matters when a score drives an action.

### `services/` — embeddings and vectors

`embedding_service.py`, `embedding_pipeline.py`, `vector_service.py` over pgvector.

### `routes/`

`discovery_routes.py`, `ml_routes.py`, `orchestrator_routes.py`, `vector_routes.py`.

### `migrations/`

Ordered SQL, applied by `run_migrations.py`:

1. `001_enable_extensions.sql` — pgvector and friends
2. `002_add_vector_columns.sql`
3. `003_create_indexes.sql`
4. `004_create_materialized_views.sql`

This is why production Postgres is the `pgvector/pgvector:pg15` image rather than stock postgres.

---

## Configuration

```bash
cp .env.example .env
cp config.yaml.example config.yaml
```

Key values: `DATABASE_URL`, `OPENAI_API_KEY`, `LLM_MODEL` (default `gpt-4o-mini`), `EMBEDDING_MODEL` (default `text-embedding-3-small`).

In production these come from the host `.env` through `docker-compose.production.yml`.

## Running

Comes up with the main stack:

```bash
docker compose -p colaberry-dev -f docker-compose.dev.yml up -d
curl http://localhost:5000/health
```

Standalone: [docker-compose.yml](docker-compose.yml) in this directory.

Tests:

```bash
pytest ai_engine/tests/
```

`tests/test_discovery/` is the populated suite — `test_schema_inspector`, `test_data_profiler`, `test_relationship_mapper`, `test_semantic_classifier`. `test_models/`, `test_orchestrator/`, and `test_services/` exist as packages but hold no tests yet.

---

## Working here

- **Sanitize before executing.** Any path that runs generated SQL goes through `sql_sanitizer.py`. No exceptions, no "just for this internal tool."
- **Never log or return secrets.** `/config` already redacts; keep it that way when you add fields.
- **Migrations are ordered and additive.** Add `005_`, do not edit an applied migration.
- **Explicit timeouts on every outbound call**, same rule as the Node side.
- The engine is stateless. Persistent state lives in Postgres. The `dictionary_data` volume is a cache, not a database.
