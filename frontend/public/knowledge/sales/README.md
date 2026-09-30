# Founding Cohort · Sales Knowledge Base (sales-hub)

An offline-capable, searchable sales-enablement hub for admissions reps (Roselen) to use live on calls. Built for **enterprise.colaberry.ai/sales-hub/**.

**Review now:** open `index.html` in a browser (Chrome/Edge). With internet, Mermaid diagrams + icons render; everything else (75 answers, search, downloads, Cory, training) works offline too.

## What's inside
- **75 verified Q&A** across 11 categories (`kb-data.js` / `kb-data.json`). Generated and graded by a maker/checker loop (every category passed at 9–10/10). 12 refund-related answers are flagged `verify before quoting`.
- **Instant search** · filters answers as you type, across question + answer + detail + tags, with a live count and auto-expand + highlight.
- **4 Mermaid diagrams** · sales funnel, the 12 weeks / what you build, pick-a-plan, objection-to-close.
- **Cory assistant** (bottom-right) · answers from the knowledge base, hands over documents, and has gameplan + call-prep intents. Retrieval-only by default; set `CORY_LIVE_ENDPOINT` in `app.js` to also use a live LLM endpoint (graceful fallback).
- **Downloads** · the 5 sales docs as print-ready PDFs (render inline anywhere).
- **Rep training** · 5-minute prep, talk track, three prospect angles, Cory practice prompts.

## Canonical facts (confirmed by Ali 2026-06-25)
$149/mo annual founding rate · $199/mo monthly · 40 founding seats · Open House **Thu Jul 16** → kickoff **Thu Jul 23, 2026** · public name "AI Systems Architect Accelerator" · "Anthropic Architect certification".
**Open item:** refund/cancellation terms are drafted and pending Ali's final approval (flagged throughout).

## Where it lives
- Review copy: this folder (`Downloads/founding-cohort-sales-hub/`).
- Deploy copy: `accel-repo/frontend/public/sales-hub/` → serves at `enterprise.colaberry.ai/sales-hub/` after a frontend deploy. **Not deployed yet** · awaiting Ali's go.

## Deferred / follow-ups
- Wire Cory's live LLM mode to the backend `/api/chat` (start + message contract) with a KB-grounded system prompt. Retrieval Cory works today.
- Optional: add a nav link to `/sales-hub` from the main site; fix the stale Jul 10/13 dates in the design-system brochure/one-pager templates.
