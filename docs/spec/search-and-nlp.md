# Search & Natural Language — Spec Reconciliation

> Source build-guide section: Chapter 5, "Natural Language Search"
> ([Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md L496-511](../../Colaberry_Enterprise_AI_Leadership_Accelerator_Build_Guide_v1.md))
>
> Closes requirement: REQ-110.

## What the spec said

> Enable executives to search content using natural language queries instead of relying solely on keywords. NLP processing to interpret user queries. Integration with a search engine such as Elasticsearch. The search feature will utilize an API endpoint `/api/search` to handle user queries.

## What's shipped

**No Elasticsearch. No `/api/search` endpoint. Deliberate.**

The shipped system uses Postgres-based search via Sequelize `Op.iLike` queries in the specific places search is needed (admin lead search, admin campaign search, project requirements search). For our cohort scale (hundreds of leads, tens of campaigns) this is sufficient and avoids the operational overhead of running an Elasticsearch cluster.

Natural-language search is handled differently: the Cory NextAction surface accepts open-ended questions through the assistantQuery and queryOrchestrator endpoints in [backend/src/controllers/intelligenceController.ts](../../backend/src/controllers/intelligenceController.ts) — LLM-backed semantic interpretation, not Elasticsearch tokenization.

## Why the divergence

| Concern | Build-guide proposal | Shipped reality |
| --- | --- | --- |
| Scale | Enterprise-scale (Elasticsearch overkill at our size) | Postgres iLike handles hundreds-of-rows search instantly |
| NLP | Tokenization + analyzers in ES | LLM-based query understanding via OpenAI |
| Operational cost | ES cluster + index maintenance | Zero — leverages existing Postgres |
| Cohort fit | Designed for multi-tenant SaaS at scale | Sized for single-cohort workflow |

## When to revisit

Add Elasticsearch (or a managed equivalent like Algolia/Meilisearch) if:
- Per-row count in any searchable table exceeds ~50k AND
- Search latency on a Postgres iLike against that table exceeds 200ms p95 AND
- The LLM-augmented assistant query layer can't bridge the gap

Until then: not building it.
