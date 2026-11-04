# Proposal Studio: target flow

Runs after **Decide** (bid approved) and alongside **Build the bid** in the existing pursuit flow. It replaces the cockpit's Proposal tab and feeds the existing **Submit** step. The clickable shape is in `designs/proposal-studio.html`. This file states what each step must do.

Two entry points onto the same delivery project, as today:
- **Admin**: `/admin/internship/gov-contract/:projectId` (requires `gov_contracts` section). Full view, including pricing.
- **Intern**: `/portal/gov-projects/:projectId` (participant + membership). Student-safe projection: never pricing, never identities.

## Stages (left rail)

| # | Stage | What happens | Who acts | Gate / rail |
|---|---|---|---|---|
| 0 | **Where we are** | Pursuit stage strip, proposal readiness (avg doc score vs 95), per-document bars, ranked next moves (questions, cycles to run, signatures, admin pricing) | Everyone | Read-only summary. Numbers come from stored scores, never recomputed by the client |
| 1 | **Blueprint** | Re-analyze the stored ZIP into a versioned blueprint: scoring (Section M), submission rules (Section L), Texas forms rules, required documents, addenda. Each rule carries a quote + file + page and is flagged fatal/curable. A new blueprint shows what changed from the last | Agent builds; admin confirms | A rule with no literal quote is dropped (verifyQuotes rail). Missing bytes means "re-upload", never a guessed blueprint |
| 2 | **Document set** | The contract's deliverables, derived from blueprint + requirements + forms rules + our additions (Compliance Matrix, Pilot Demonstration Exhibit). Each document has a type: `narrative`, `form`, `build`, `generated`, `pricing` | Admin can add from the library or remove (with reason) | `pricing` is admin-only end to end |
| 3 | **Build evidence** | Build completion, demo URL, gallery of screenshots captured from verified stories, each tagged with requirement IDs and where it's used. An unverified story has no capture, plus a decision card (finish it or describe it) | System captures; people insert | Capture only from the contract's allowlisted demo host; sample data only |
| 4 | **Draft & versions** | Working copy per document: section plan, live checks for the selected version, immutable version history (agent or human), diff, **Run review cycle** | Agent drafts and revises; people edit | Each save = new version + re-score. AI never sets `accepted` |
| 5 | **Review gates** | Pink → Red → Gold → White glove per document; matrix of documents × six checks | Agent scores; a **person** approves each gate; **Gold** needs a program-capable admin | Pass = weighted ≥ 95 **and** no check < 85 **and** no open question **and** no fatal item |
| 6 | **Package & submit** | Assemble approved versions into PDFs with blueprint file names, the sealed pricing file, the redacted copy, and a manifest. Export, upload externally, record the receipt | Admin exports and records | Fatal items block export. Exported ≠ submitted (unchanged) |
| — | **Agent panel** (right) | Activity log, and **Needs your answer** questions. An answer is saved to the company library and re-scores the affected documents | Agent asks; people answer | Agent never answers for the firm |

## The six checks

| Check | Weight | Team | Method |
|---|---|---|---|
| Requirement coverage | 25 | Pink | **Deterministic.** Every requirement mapped to the document is cited by a section (`data-req` anchors); missing = finding |
| Evaluator score | 25 | Red | **AI ×3** independent evaluators with a scoresheet built from the blueprint's Section M factors. Median score; 2+ adjectival-level disagreement → human flag |
| Proof & evidence | 15 | Red | AI finds claims; deterministic join to evidence (artifact, library fact, reference). Unbacked claim = finding |
| Fact integrity | 15 | Red | **Deterministic.** Open questions / placeholders count; facts must come from the library or the blueprint |
| Format & instructions | 10 | White glove | **Deterministic.** Real rendered page count vs limit, font, page size, required headings, section order, file name |
| Clarity & win themes | 10 | Red | AI: theme statement present per section, customer-focused, readability band |

Fatal items outside the score (fail the document outright): over page limit; missing required signature; price text outside the pricing file; missing required form.

## Review cycle (agent loop)

```
for i in 1..maxIterations (default 3):
  scores = runChecks(currentVersion)            # stored on the version
  if passes(scores): log "ready for <next gate>"; stop
  if openQuestions(): log "blocked on N answers"; stop
  findings = failing checks' findings, ranked by weight × gap
  next = reviseDocument(currentVersion, findings, grounding)   # AI, fail-soft
  save as new version (author: agent, change summary from findings)
```

Grounding for every draft and revision: blueprint (weights, rules, order), the document's requirements, section plans, inserted artifacts, approved library facts. Nothing else.
