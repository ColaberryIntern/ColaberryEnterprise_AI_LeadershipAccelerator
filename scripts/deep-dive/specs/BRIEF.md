# Deep Dive Field Guide — content authoring brief (Weeks 2–12)

You are authoring the CONTENT for ONE week's "Deep Dive Field Guide" in the Colaberry
Enterprise AI Leadership Accelerator. A deterministic generator supplies all the chrome +
machinery (brand CSS, nav, read-tracker, upload gate). **You write ONLY the content spec.**

## The learner + the frame
The learner is becoming an **AI Solution Architect**. They do NOT do the hands-on work —
they **DIRECT, EVALUATE, and APPROVE** what an AI (and a team) produces. Every Field Guide
teaches the **~20% of a discipline** an architect needs to competently direct that role.
This week's role is given in your task. It is one station on the SDLC arc
(Wk1 Business Analyst → Wk12 AI Solution Architect).

## Voice + brand (STRICT)
- Executive, calm, authoritative. Bloomberg-meets-Salesforce, not consumer SaaS.
- **NO EMOJI anywhere.** Colaberry brand voice forbids emoji. Use words / the shared SVG checks.
- Speak to "you" (the architect). Concrete, specific, no fluff. American English.
- Colaberry brand colors are already applied by the generator (Cherry Red / Leaf Green / Berry Blue). Do not set colors.

## Output contract
Write a CommonJS module to the EXACT path given in your task, of the form:

```js
module.exports = {
  week: <N>,
  role: "<Role Name>",            // e.g. "Solution Architect" — used in title/H1/meta
  tag: "<SHORT · Wk N>",          // header chip, e.g. "SA · Wk 2"
  sections: [ /* EXACTLY 15 section objects, in order (see skeleton) */
    { id: "dashboard", navLabel: "Dashboard", eyebrow: "<Role> · Week <N>", title: "<hero one-liner>", body: "<HTML>" },
    ... 14 more ...
  ],
  buildPrompt: "<the multi-paragraph build prompt, LITERAL text — see below>"
};
```

### The 15 sections (fixed skeleton — keep these ids + order)
1. `dashboard` — Hero. A 1-sentence `<p class="lead">` of what this role does for the architect, then a `<div class="kpis">` row of 3–4 `<div class="kpi"><div class="v">N</div><div class="l">label</div></div>` tiles (e.g. docs you'll build, key counts). **Do NOT add a "Start here" banner — the generator injects it.**
2. `overview` — Why this discipline exists; the real problem it solves; what breaks without it.
3. `twenty` — "The 20% you need." The core concepts/frameworks an architect must know to direct this role (name them, define each briefly).
4. `role` — Role in the SDLC: where it sits, what phase it owns, what it takes in and hands off. Use a `<div class="flow">` of `<div class="step"><div class="k">stage</div><div class="t">name</div></div>`.
5. `io` — Inputs & Outputs (two `<div class="card">` or a `<div class="kv">` list of key/val rows).
6. `responsibilities` — What this role OWNS. A checklist-style `<ul class="clean">` of the 6–9 responsibilities.
7. `artifacts` — The documents/artifacts this role produces (the ones the build prompt will generate). One line each, with why it matters.
8. `goodbad` — Good vs bad quality. Two side-by-side `<div class="card good">`/`<div class="card bad">` with `<h4>` + `<ul>`. (navLabel like "Good vs Bad Architecture".)
9. `metrics` — KPIs & success measures for this discipline (use `<div class="kpis">` or a `<div class="kv">` list).
10. `tools` — Common tools of the trade (grouped `<div class="card">`s or a list). Recognition, not tutorials.
11. `ai` — AI collaboration: how AI drafts this role's work, and the specific things you must check because AI gets them wrong.
12. `review` — The architect's REVIEW LENS: the concrete questions you ask to evaluate/approve this role's output before it proceeds. End with a `<div class="callout"><strong>Approve only when:</strong> …</div>`.
13. `inspect` — How to inspect it: concrete, checkable signals of quality vs. trouble.
14. `kb` — Knowledge base / glossary: 8–12 key terms as a `<div class="kv">` list (term → definition), plus 2–3 `<div class="q"><button class="revealbtn">Reveal</button><div class="ans">…</div></div>` FAQ items.
15. `build` — "Build & Submit". A short `<p class="lead">` of what the student will build in their own Claude Code (a rich, searchable, branded {Role} Field Guide with the documents below), then a `<ul>` of the concrete documents. **Do NOT add the checklist/upload box — the generator injects it.** You MAY include one `<button class="buildcta" id="copyPromptBtn2" type="button">Copy the build prompt</button>`.

### HTML rules
- Clean, fully-balanced HTML. NO `<style>`, NO `<script>`, NO inline `style=` except tiny spacing tweaks. NO external anything.
- Use ONLY these shared classes (already styled): `.lead .muted .small .card .sub .kpis .kpi (.c1/.c2/.c3/.c4) .kv (.k/.val) .flow (.step/.k/.t) .stack .callout .good .bad .clean (ul) .table-wrap (table) .chip (.pri) .q .revealbtn .ans .tier (.lab/.row) .buildcta .eyebrow`.
- Tables: wrap in `<div class="table-wrap"><table>…</table></div>`.
- Keep each section substantial but tight. TARGET TOTAL content ~18–26 KB (the generator base is ~10 KB; the whole file must stay < 60 KB). Do not pad.
- Reference ONE concrete example industry consistently if it helps (Restaurant, Insurance, Healthcare, Retail, or Manufacturing) — but content must be genuinely instructive, not a toy.

### The build prompt (section-15 `buildPrompt`) — adapt this proven Week-1 template
Multi-paragraph, LITERAL text (use real `&`, `<`, `>` — the generator escapes them). Keep this shape, tailored to THIS role:
- Line 1: "Build a rich, self-contained {Role} FIELD GUIDE as a single HTML file named {Role_no_spaces}_FieldGuide.html. Take your time and make it genuinely substantial — a 5 to 10 minute build that produces a polished, knowledge-base-style guide, not a quick page."
- WHO IT'S FOR: learner in the Colaberry Enterprise AI Leadership Accelerator becoming an AI Solution Architect; needs the ~20% of {discipline} to DIRECT/EVALUATE/APPROVE AI-generated {this role's work}; no project yet — pick ONE example industry and make every document concrete to it.
- MAKE IT A KNOWLEDGE BASE: left topic nav, prominent SEARCH box, and an offline "Ask" assistant that answers FROM THE GUIDE'S OWN CONTENT (small embedded Q&A, no external API, works offline).
- BRANDING & QUALITY: Colaberry logo in header + on print/PDF; executive calm authoritative voice; light/dark aware; fully self-contained inline CSS+JS, NO external libraries/CDNs, works offline.
- TEACH THE DISCIPLINE (concise): list the specific 20% concepts for THIS role.
- THEN GENERATE THE DOCUMENTS — the heart of it. For the chosen example, produce REAL, substantial versions of THIS role's artifacts (list them — use the artifacts from section 7), each in its own searchable section, each individually DOWNLOADABLE. PRIMARY format = a fully-styled self-contained HTML deliverable that looks like a genuine professional document (branded cover w/ Colaberry logo, a document-control strip [version/owner/status/date], styled headers + tables, callouts, a sign-off block [Prepared/Reviewed/Approved], footer). Make each EXTENSIVE, not a summary. ALSO a Save-as-PDF that prints that same designed document, and an Excel-friendly .csv for tabular ones. Do NOT default to plain .md.
- USE RICH VISUALS: Mermaid-style diagrams (flow/sequence/ERD/C4 as fits the role) AND Power BI-style charts (KPI tiles, bar/line/donut) for anything quantitative, ALL as INLINE SVG (self-contained, offline).
- EMBED metadata JSON script tag id="deepdive-metadata": { guide_type:"{Role} Field Guide", curriculum_type:"deep_dive", week:{N}, discipline:"{Role}", student_id, project_id, repository, generated_by:"Claude Code", generated_date, version, build_number }.
- Last line: "When finished, open the file in the browser."

## Do NOT
- No emoji. No colors. No `<style>`/`<script>`. No "Start here" banner (section 1). No checklist/upload box (section 15). No markdown — this is HTML.
- Return NOTHING but write the module file, then reply with: the file path, the role, and the byte size of the file you wrote.
