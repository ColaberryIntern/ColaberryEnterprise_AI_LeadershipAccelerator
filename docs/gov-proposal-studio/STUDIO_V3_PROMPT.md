# Proposal Studio v3: the AI builds and judges, the human supplies what's missing

You are working in `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`.

**Rules**
- Follow `CLAUDE.md`, `backend/CLAUDE.md`, and `MERGE_WORKFLOW.md`.
- PRs target `main`, per `docs/gov-proposal-studio/P0-plan.md` §5.5.
- One branch per phase: `workstream/proposal-studio-v3-<N>`.
- Every reply ends with a brief-me block.
- Never report a check you didn't run.

Save this file as `docs/gov-proposal-studio/STUDIO_V3_PROMPT.md`. Read it with `FLOW.md` and `UI_PARITY_PROMPT.md`.

**The approved design for this release is `docs/gov-proposal-studio/designs/proposal-studio-v3.html`.** Open it in a browser and walk the whole flow before writing code:
1. **Build all documents**
2. answer every card in **Needs you**
3. **Go** at Gold
4. **Package & submit**
5. **Take the tour**

Where it differs from the original `designs/proposal-studio.html`, v3 wins. Match its layout, components, copy, states and interactions, with real API data in place of its sample values. The yellow sample banner and its **Reset** and **Skip to answers needed** buttons are demo-only. Don't ship them.

## The operating model (owner's direction, Nov 5)

> "The scans should be able to tell exactly what is missing and what is needed. That should be part of the process. The human just needs to know what is needed and the AI is the builder and judge."

From this release on:

1. **The AI builds.** It creates every document from nothing: outline, first draft, figures, revisions, the compliance matrix, the exhibit, and prefilled forms. A human never has to start a document or press "draft".
2. **The AI judges.**
   - The six checks plus the elimination scans decide whether a document passes.
   - The judging runs as independent evaluator calls, separate from the drafting call.
   - Pink, Red, and White glove are AI gates. They pass automatically when their checks pass, and the decision is recorded with its evidence (scores, findings, version, judge run ids).
3. **Every scan produces a precise needs list.** Each finding is either:
   - **agent-fixable**: the AI fixes it on the next pass, and no human ever sees it as a task; or
   - **human-needed**: a typed request saying *exactly* what is needed, why, where it will be used, in what format, and what it unblocks.
4. **The human only supplies inputs.** That means answers to facts, decisions, files, signatures, and **one Go / No-go at Gold for the whole package** before export (one decision, not one per document). Gold stays human. It's the single business sign-off, and separation of duties still applies: the Go can't come from the agent run or from the last human editor. All of this is configurable in `proposalReviewConfig`: `aiGates: ['pink','red','white_glove']`, `humanGates: ['gold']`.
5. **The loop never waits on a click.** When an input arrives, the agent resumes on its own for every document that was waiting on it. It keeps working until each document passes or needs something new from a human.

## Evidence: what is shipped today (main @ 30251767)

I rendered the shipped `proposalStudio/*` components with fixture data next to the demo. The visual port of U1–U5 is close. The problems are behavior and the missing creation path:

| # | Delta | Where |
|---|---|---|
| D1 | **There is no way to create a narrative document in the Studio.** `StudioShell.openDoc` sends derived/build/generated docs to the editor, never to the drafting drawer. The editor's empty state says "Run a review cycle", but `reviewCycleCore` returns `no_document` when there is no draft. Production shows 0 of 6 documents drafted. | `StudioShell.tsx` `openDoc`; `runReviewCycle.ts` L35–36 |
| D2 | **First drafts are ungrounded and their questions are dropped.** `draftProposalDocument` calls `generateProposalDocumentDraftAI` with only `{docKey, title, requirements}`: no grounding, no opportunity, buyer, or agency. The returned `gaps` are ignored. Its `[PLACEHOLDER]` markers become **fatal** fact findings with no matching question, so the human has nothing to answer and the document can't pass. | `govProposalDocumentActions.ts` ~L62–70 |
| D3 | **Findings are free text.** `{check, severity, message}` doesn't say who resolves it or what exactly is needed. There's no way to tell "the agent will fix this" from "a human must provide X". | `documentChecks.ts`, `documentChecksAI.ts` |
| D4 | **The "needs you" signals are hidden or wrong.** `questionCount` is hard-coded to `0` in `StudioShell`, so "Where we are" never tells you to answer anything. The only list is the questions in the agent panel. Signatures, decisions, files, gate sign-off, demo URL, and blueprint inputs are scattered or missing. The rail and contract bar show no count. | `StudioShell.tsx` L49, `WhereWeAre.tsx` |
| D5 | The agent state is always `Idle`. The shell never passes `state`, and the run status never reaches the panel. The copilot "Ask" input was dropped. | `AgentPanel.tsx`, `StudioShell.tsx` |
| D6 | Review gates still show **all four "Approve" buttons at once** in a separate accordion list under the matrix. The matrix clips its Result column at 1440px (and worse inside the admin shell). | `ReviewGatesView.tsx` |
| D7 | Editor: the demo's **Edit** button is missing, so a human can't change content. Placeholders aren't highlighted. There's no requirement-reference line per section and no inline findings. Diff flattens everything into one `<p>`. The running header is cramped, the content `h2` renders oversized, and section-plan inputs are always editable with no AI suggestion. | `DraftVersions.tsx` |
| D8 | Build evidence:<br>• Demo URL isn't shown or editable, even though `setDemoUrl` exists.<br>• "Artifacts in documents" is guessed from a caption regex.<br>• **Insert** hard-codes the first narrative doc.<br>• **Decide** is a toast.<br>• Interns get blank thumbnails (only `reviewApi` fetches images). | `BuildEvidence.tsx` |
| D9 | Document set: **Add from library** is a toast stub whose copy says "Texas forms" on a Utah contract. | `DocumentSet.tsx` |
| D10 | Open items: "Answer in the agent panel" navigates to Overview. | `OpenItems.tsx` |
| D11 | The Stage chip is hard-coded to "Proposal production", and the rail's "Where we are" is always marked current. | `ContractBar.tsx`, `StageRail.tsx` |
| D12 | There's no tour or help anywhere. | — |
| D13 | Check weights in code are coverage 25, evaluator 25, proof 15, **clarity 15**, format 10, **fact 10**. FLOW.md says fact 15 and clarity 10. Keep the code values (the reasoning is documented in `proposalReviewConfig.ts`), and update FLOW.md and the Studio copy to match. | docs |

## Phase V1: findings that say exactly what's needed (backend)

1. **Structured findings.** Extend the finding type everywhere (deterministic, AI, blueprint):

   ```ts
   interface CheckFinding {
     check: CheckKey | 'blueprint' | 'package';
     severity: 'fatal' | 'major' | 'minor' | 'info';
     message: string;              // what is wrong, plain English
     sectionKey?: string;
     resolver: 'agent' | 'human';
     need?: HumanNeed;             // present iff resolver === 'human'
     fixHint?: string;             // for the agent's next revision
   }
   interface HumanNeed {
     kind: 'fact' | 'decision' | 'file' | 'signature' | 'approval' | 'confirm_rule' | 'setting';
     key: string;                  // stable dedupe key, e.g. fact:years_in_business, file:signed:execution_offer
     ask: string;                  // the exact request ("How many years has Colaberry delivered data and AI projects?")
     why: string;                  // what it unblocks and the rule behind it
     usedIn: Array<{ docKey: string; sectionKey?: string }>;
     format: string;               // "a whole number", "PDF of the signed form", "one of: Self-perform | Subcontract"
     options?: string[];           // for decisions
     blocking: 'fatal' | 'score';  // fatal = export blocked; score = holds the document under 95
     source?: { quote: string; file: string; page?: number };  // when a solicitation rule drives it
   }
   ```

2. **Classify every rule (pure, table-tested).**

   | Finding | Resolver | Kind of need |
   |---|---|---|
   | Coverage gap, clarity, format/length, section order, unbacked claim when an artifact or approved fact exists | agent | — |
   | `[PLACEHOLDER: …]`, open gap | human | `fact` |
   | Unbacked claim with no evidence anywhere | human | `fact` ("provide evidence for …"), or `decision` ("remove the claim?") |
   | Missing signature | human | `signature` |
   | Missing required form or pricing file | human | `file` |
   | `needs_input` blueprint form (e.g. contract value ≥ $100k? subcontracting probable?) | human | `confirm_rule`, with the quote |
   | Unverified story cited in a requirement | human | `decision` (finish the build, or describe it without a screenshot) |
   | Demo URL unset | human | `setting` |
   | Gold | human | `approval` |
   | Evaluator disagreement of 2+ levels | agent | Re-run with a 4th judge. If it still disagrees, it becomes a human `decision` showing both readings. |

3. **Placeholders are always questions.**
   - Every `[PLACEHOLDER: …]` in any version (first draft, revision, or human edit) is parsed into a `gov_proposal_document_gaps` row with a `need`.
   - Identical asks across documents dedupe by `need.key`, using normalized text when the model gives no key.
   - The marker stays in the content until the answer arrives. The agent then rewrites the section with the fact, and the gap closes.
   - **A document may never sit with an unresolved marker and no open question.** Add a test for this.

4. **One needs list, server-side.**
   - `GET /api/admin/gov-contracts/:projectId/needs` and the portal mirror return every open `HumanNeed` across documents, blueprint, build, and package.
   - The aggregation is a pure function, deduped by key and sorted fatal first, then by how many documents each need unblocks, then by due date.
   - The portal version drops pricing and identities, and shows `approval` needs only to viewers who can give them.
   - `POST …/needs/:key/resolve` takes `{ value | option | file }` according to `kind`. It routes to the right store (library fact, decision log, signature upload, blueprint input, demo URL, gate) and returns the documents it unblocked.
   - Answers that are facts go to the company library as **approved when given by an admin**, and as pending approval when given by an intern.

5. **The projection carries the counts.**
   - `needsCount` and `fatalNeedsCount` on the project.
   - Per document: `needsCount`, `agentWorking: boolean`, and `stage: 'not_started'|'outlining'|'drafting'|'judging'|'needs_you'|'passed'|'go'`.

## Phase V2: the AI builds documents from nothing

1. **The review cycle creates when there is no draft.** Replace `no_document` with a create path: **outline → section drafts → checks → revise**, all inside the same run. Write the run status at each step (`outlining`, `drafting section 3 of 9`, `judging`, `revising`) so the UI can show progress.

2. **Outline first (Blue team inside Pink), by the AI.** A pure `buildOutline(doc, blueprint, requirements, artifacts)` produces:
   - sections in the solicitation's required order (blueprint `section_order` rule; otherwise the requirement order);
   - each section's `requirementIds`;
   - a **page budget** (page limit × Section M weight share, with a floor of 0.5 pages);
   - suggested artifacts.

   An AI pass then suggests a **section plan** (hot button → feature → benefit → proof → discriminator) per section, marked `suggested`. The outline is judged too: Pink coverage passes when every requirement has a section. No human approval is needed. The outline is shown and editable, but the work never waits on it.

3. **Draft by section, grounded.**
   - Use `buildGrounding` for every first draft and revision: blueprint weights and rules, section plans, artifacts with captions, approved facts, and opportunity/agency/buyer.
   - Draft section by section, not the whole document in one call. Each section gets its page budget and its requirements.
   - **Section template** for narrative types: a theme statement (bold, one sentence), `What <agency> needs`, `How our solution does it`, `Proof` (figure or fact), and `Why it matters`. Each section opens with a requirement-reference line: `Responds to <rule ref> · <req ids> · Evaluation factor: <factor> (<weight>)`.
   - **Type templates**:
     - **Cover letter**: one page, signer from library.
     - **Past performance**: one block per reference, from the library.
     - **Key personnel**: one block per person, from the resume library, with the role mapped to the solicitation's named roles.
     - **Compliance matrix**: generated deterministically as `.xlsx` (exceljs), with columns `Req ID / Requirement (verbatim) / Source / Where answered (doc §) / Status`. No AI involved.
     - **Pilot exhibit**: assembled from verified artifacts plus the demo URL.
     - **Forms**: the agency blank form from the ZIP, plus a prefill table of fields from the library. Missing fields become `fact` needs, and the signature becomes a `signature` need.
   - Gaps returned by the model are persisted as needs (fixes D2).

4. **Judging is independent of building.** The evaluator, proof, and clarity checks run as separate calls with a judge prompt. They never get the drafter's reasoning and never reuse the same cache key. Record judge run ids on the version.

5. **Auto-resume.** When `needs/:key/resolve` unblocks documents, enqueue a cycle for each, one active run per document (409 dedupe). Add a project-level **Build all documents** action that enqueues every not-passed document in blueprint order. It's admin, or intern with edit share.

6. **Gates.**
   - Pink, Red, and White glove are recorded automatically by the judge when their checks pass, with `decidedBy: 'ai_judge'`, the version, scores, and judge run ids.
   - A new version reopens them.
   - Gold is the only human gate, and it covers **the whole package**.
     - When every document has passed its AI gates and no fatal finding remains, raise one `approval` need (`key: approval:gold:package`) for program-capable admins: "Go / No-go: submit these N documents?"
     - **Go** records Gold on every document at its current version.
     - **No-go** records the note, stops auto-resume for the project, and keeps the package locked.
     - Any new version after Go reopens Gold for the package.
   - The UI never shows Approve buttons for AI gates.

7. **Human edits.** The editor's **Edit** saves a section-level edit as a new human version, sanitized. The judge re-scores automatically, and the agent resumes only if the edit dropped the document below the bar.

## Phase V3: make "what you need to do" impossible to miss (UI)

1. **Needs inbox.**
   - Rename the rail's **For you → Open items** to **Needs you**, with a count badge: red when any need is fatal, amber otherwise.
   - The contract bar gets a **Needs you N** chip next to Proposal ready. It's clickable and opens the inbox.
   - The inbox view lists every need as a card:
     - kind icon and tag (Fact / Decision / File / Signature / Approval / Confirm / Setting);
     - the exact **ask**;
     - **why** (what it unblocks, with the solicitation quote when one exists);
     - **used in** chips (doc §) that link to the editor at that section;
     - the **expected format**;
     - an inline control matching the kind: text or number input, option buttons, file drop, signed-file upload, Go/No-go with note, or a URL field.
   - Resolving a need shows "Saved. The agent is updating N documents." and the card collapses. Group the cards **Blocking export** first, then **Holding a score**.
   - Replace the `OpenItems` view with this inbox. It fixes D10.

2. **The agent panel shows the same needs**, compact, top 5 with "See all N". Remove the separate question-only list. The header state comes from live runs: **Building** (outline/draft), **Judging**, **Revising**, **Reading ZIP**, **Waiting on you** (needs > 0 and no runs), or **Idle**. The activity log shows run progress lines while runs are active. Restore the copilot as a small **Ask** input at the bottom.

3. **Where we are.**
   - "Next moves" starts with **You** items from the needs list (top 3, with inline resolve for the simple kinds), followed by what the agent is doing now ("Building Technical Proposal: drafting section 4 of 9").
   - Each per-document readiness bar shows its stage pill (Not started / Building / Judging / Needs you / Passed / Go).
   - Add a **Build all documents** primary button when any document is not started (fixes D1 in the UI).

4. **Document set.** Add a **Stage** column and a **Needs** column showing the count with a link. A not-started row shows **Build it** (one click enqueues the run). **Add from library** opens a real picker: library sections, resumes, references, and the state forms for the detected jurisdiction only (fixes D9).

5. **Draft & versions (editor)**, fixing D7:
   - An **Outline** tab next to the paper: sections, page budget per section against actual pages, requirement chips, suggested-plan badge, and drag to reorder (saved as a human version).
   - **Paper**:
     - section blocks with the requirement-reference line;
     - placeholders rendered as amber **Needs: <ask>** chips that open the need inline;
     - findings shown as margin notes (agent-fixable in grey "agent will fix", human-needed in amber);
     - figures with captions;
     - a structured diff that keeps headings and paragraphs;
     - a running header in one line: `Colaberry · <solicitation> · <doc> · v<n> · <pages>/<limit> p`.
   - Normalize the content heading scale to the paper type scale.
   - Hovering a section shows **Edit section**, **Regenerate section**, and **Insert figure here**.
   - **Preview PDF** renders the real PDF through the existing renderer, showing pages and page numbers.
   - The section plan shows AI-suggested values marked `suggested`. A reviewer can edit them, and saving re-runs the section.
   - Version history shows author names for humans, "Agent" for agent versions, and the judge result per version.

6. **Review gates**, fixing D6:
   - The matrix fits: sticky first column, compact cells, the Result column always visible, horizontal scroll only inside the table.
   - Remove the per-document accordion. Each row shows gate progress chips (Pink ✓ AI · Red ✓ AI · White glove ✓ AI · Gold awaiting Go).
   - Clicking a row opens a side panel with the latest findings, split into **Agent will fix** and **Needs you**, plus judge evidence.
   - The only button is **Go / No-go** on Gold, shown to eligible admins.

7. **Build evidence**, fixing D8:
   - Demo URL shown in mono, editable by admins through `setDemoUrl`.
   - "Used in" comes from real figure references, not a caption regex.
   - **Insert** opens a document and section picker.
   - **Decide** on an unverified story resolves a `decision` need.
   - The portal fetches thumbnails through a portal artifact route.

8. **Contract bar and rail**, fixing D11: the Stage chip reads the real pursuit stage. The current rail item follows the view.

## Phase V4: the guided tour

Build a lightweight in-house coach-mark tour. Don't add a library. It lives in `proposalStudio/tour/` and is made of `TourProvider`, `TourStep`, and an anchored popover.

**Behavior**
- It starts automatically on a user's first visit to the Studio, and again from a **Take the tour** button in the contract bar and `?tour=1`.
- Each step anchors to a real element (by `data-tour` attribute) with a spotlight cutout, a title, two or three sentences, and Back / Next / Skip controls with progress dots ("3 of 9").
- Keyboard: arrow keys and Esc, with focus moved into the popover.
- It respects `prefers-reduced-motion`. It works at 400px, falling back to a centered card and no spotlight.

**Seen state**: store it per user server-side if a user-preferences mechanism exists. If not, add a tiny `ui_seen` JSONB on the identity or use an existing settings table, and fall back to `localStorage` in try/catch. Bump a version key when the tour content changes so returning users see the new steps once.

**Steps (admin)**

| # | Anchor | Content |
|---|---|---|
| 1 | Proposal ready meter | "How close every document is to the 95% bar. It moves as the agent builds and as you answer." |
| 2 | Needs you chip | "The AI writes and judges every document. When it needs a fact, a decision, a file or a signature, it asks here, exactly what and why. Red means it blocks export." |
| 2a | Build all documents (shown only while documents are unbuilt) | "One click. The agent outlines, drafts and judges every document in the blueprint, then lists what it needs from you." |
| 3 | Rail: Blueprint | "Built from the solicitation ZIP. Every rule quotes its source." |
| 4 | Rail: Document set | "Everything this contract must submit. Build all creates them." |
| 5 | Rail: Build evidence | "Screens captured from the verified build. They become figures that prove requirements." |
| 6 | Rail: Draft & versions | "Watch the AI build each document section by section. Every version is kept with its scores." |
| 7 | Rail: Review gates | "AI judges pass Pink, Red and White glove. You give the one Go at Gold." |
| 8 | Rail: Package & submit | "When everything passes and you say Go, export the package and upload it to the agency." |
| 9 | Agent panel | "What the agent is doing right now, and what it's waiting on." |

This is 10 steps when Build all is visible, otherwise 9, matching the demo. A first visit gets a non-blocking "New here? Take the 2-minute tour / Not now" prompt rather than an overlay that covers the page.

**Intern variant**: same steps, without Gold Go and pricing, and with "your reviewer gives the Go".

**Contextual help**: a small (i) next to each view title opens that view's single step again.

## Phase V5: cleanup and docs

- Update `FLOW.md` and `OPERATOR_GUIDE.md` to the v3 model: AI gates, human Gold, the needs inbox, auto-resume, and the real weights (D13).
- Remove dead code (the old drawer path for narratives, the question-only list).
- Keep the drawer only for pricing (admin).

## Acceptance (on the Saratoga Springs contract, `3867b241-0761-4f1f-9a32-ffe3b47bf186`)

1. **Build all documents** takes every not-started document through outline → draft → judge with no other clicks. The agent state shows Building, Judging, and Revising, with progress lines.
2. Every unresolved placeholder in any version has exactly one open need. Every finding in the database has a `resolver`. Every human-resolved finding has a complete `need` (ask, why, usedIn, format, blocking). Assert this in tests and with a one-off audit script on staging data.
3. The **Needs you** chip and rail badge show the right count and color. Each card resolves inline. Resolving a fact closes it in every document that asked, and the affected documents re-run automatically.
4. No Approve buttons appear for Pink, Red, or White glove. Those gates record `ai_judge` decisions with evidence. Gold shows a single Go/No-go to an eligible admin only, and the agent or last editor can't give it.
5. The editor shows sections with requirement lines, amber "Needs" chips, margin findings, a structured diff, Preview PDF, and Edit section. A human edit creates a version and is re-judged.
6. The tour starts on first visit, anchors correctly at 1440 and 400px, can be reopened, and isn't shown again after completion.
7. Intern view: the needs list has no pricing and no approvals they can't give. Thumbnails load. The intern can resolve needs on edit-shared documents.
8. Visual parity: attach screenshots of each view at 1440 and 400px, light and dark, next to the demo (fixture data is fine). The matrix shows the Result column without clipping inside the admin shell width.
9. Run `npx tsc --noEmit` and the backend and frontend test suites, and report the results as they are.
