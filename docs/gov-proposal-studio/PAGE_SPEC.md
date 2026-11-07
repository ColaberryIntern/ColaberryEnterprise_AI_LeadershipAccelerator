# Proposal Studio: page-by-page spec (v4 round)

**Target:** `designs/proposal-studio-v4.html`. **Pass/fail:** `tests/studio-parity.cjs`.

**What "shipped" means here.** The **Shipped** column describes the `workstream/proposal-studio-v3` branch at `c9a622a9`, rendered with fixture data on Nov 6. Screenshots are in `reference/current-branch/`. Production runs `main`, which has **none** of the v3 work yet. That's why production shows no tour and no Build it.

Each **Required** item lists the `data-testid` the parity script looks for. Copy them exactly. Labels and copy come from the demo, word for word, unless real data says otherwise.

---

## 0. Global: contract bar, rail, agent panel, tour

| Element | Shipped (v3 branch) | Required (demo) |
|---|---|---|
| Contract bar layout | "Take a tour" button sits alone on a second line under the title. | Title on the left. On the right, **one row of chips**: Agency, Build %, Proposal ready meter `bar-ready`, **Needs you** `bar-needs`, **Take the tour** `bar-tour`. The tour chip stays in the same row as the meter. |
| Needs you chip | Hidden when 0. Red outline when greater than 0. | **Always shown.** `data-count` holds the number. `data-severity` is `fatal` (red fill), `score` (amber fill) or `clear` (green "Needs you 0"). Clicking it opens Needs you. |
| Rail order | Done → Proposal production → For you (Needs you at the **bottom**). | Done → **For you: Needs you** (at the top, `rail-step-needs`) → Proposal production. |
| Rail badge | Red dot whose number is unreadable. Hidden at 0. | `rail-needs-badge`: white number on red (fatal) or amber (score), green 0 when clear. The label goes bold when greater than 0. |
| Step icons | Mixed. | Done ✓ green: Blueprint (when built), Document set (when none are not started), Build evidence (when captures exist), Review gates (after Go). The current step shows the accent ring. |
| Agent panel header | "Drafts, checks and revises. You approve." | "**Builds and judges. You supply what's missing.**" State tag `agent-state` with `data-state` = Idle / Building / Judging / Revising / Reading ZIP / Waiting on you. Waiting on you renders amber. |
| Agent log | Static list, no live line. | `agent-log`, newest at the bottom. While a run is active, the last line is `now · <spinner> <doc>: drafting section 4 of 9`. |
| Agent needs | Fact cards inline. Decisions read "Answer in Needs you". | `agent-needs`: top 4 as compact cards (kind label in caps, red or amber by severity), each opening that card in Needs you, plus "See all N". Inline answering belongs in the Needs inbox. |
| Ask | Present. | `agent-ask`, kept. |
| Report a problem button | Covers the Ask button (bottom-right). | Move it so it never overlaps the agent panel. Bottom-left, or into the contract bar's overflow. |
| Tour, first visit | Opens a big centered card automatically over the page. | A **non-blocking prompt** `tour-prompt`: "New here? **Take the 2-minute tour** · Not now". No card until clicked. |
| Tour, card | Centered floating card, no anchor, 11 long steps. | **Spotlight tour**. `tour-ring` is a cut-out ring around the real element (rail item, chip, button). `tour-card` sits next to it with `data-step`, "Tour · n of N", progress dots, Skip `tour-skip`, Back, Next/Finish `tour-next`. Esc closes, arrows move. Use the **demo's 10 steps and copy**. Below 760px, fall back to a centered card with no ring. |
| Per-view help | None. | An (i) button `help` beside every view title. It replays that view's tour step as a single "Help · Got it" card. |
| Toasts | Present. | Keep. Use the demo's copy ("Saved. The agent is updating N documents."). |

## 1. Where we are (`?view=overview`)

| Element | Shipped | Required |
|---|---|---|
| Build hero | None. "Build all documents" is a button inside Next moves. | `overview-build-hero`: a purple-tinted band at the top while any document is not started. It reads "**N documents not started.**" with the explanation line and **Build all documents** `btn-build-all` on the right. Hidden once everything has started. |
| Agent now | None. | `overview-now`: "Agent now: <doc>: <step>" with a spinner while a run is active. |
| Stage strip | Present. | Keep. |
| Readiness | Ring plus rows. The stage pill wraps under the title. | `overview-readiness`: rows laid out as **title · bar · stage pill · score** on one line. Rows carry `data-testid="overview-doc-<key>"` and `data-stage`. Unscored documents show "—", not 0. |
| Right panel | "Next moves" (Agent / Signer lines). | `overview-needs`: "**What you need to do**", with a count tag. It shows the top 3 open needs (kind, ask, why, **Answer** button → that card in Needs you) and "See all N". Empty states: "Start the build and the agent will tell you exactly what it needs" / "Nothing right now. The agent is working." / "Nothing." |
| How it works | "How a document gets to 95%" (Draft / Check / Revise). | "**How it works**": **AI builds** / **AI judges** / **You supply**, using the demo copy. |

## 2. Needs you (`?view=openitems`, rename the param to `needs`; keep `openitems` as an alias)

| Element | Shipped | Required |
|---|---|---|
| Groups | Two boxed groups. | Section headers with count tags: **Blocking export** `needs-group-fatal` first, then **Holding a score under 95** `needs-group-score`, then **Answered** `needs-group-answered`. Answered cards collapse to a green ✓ with the answer. |
| Card | Stacked, all text. | `need-card` with `data-key`, `data-kind`, `data-blocking`, `data-done`. Two columns: the left holds the tags (kind, "blocks export" / "holds a score under 95", "admin only"), the **ask** in bold, the **why**, the solicitation **quote** with file and page (`need-quote`), **used-in chips** (`need-used`, each one opens that document and section in the editor), and **Format** (`need-format`). The right holds the control (`need-control`, with `data-control`). The left border is red (fatal), amber (score) or green (done). |
| Controls | Signature asks you to "Paste the uploaded file reference". | By kind:<br>• fact: text input + Save<br>• multi-line fact: textarea + Save<br>• decision: option buttons<br>• **signature/file: a real file drop + "Choose file"** (`input[type=file]`, `data-control="file"`) that uploads through the existing signed-form route<br>• approval: note + **Go / No-go**<br>• setting: URL input |
| Deep link | — | `?view=needs&need=<key>` scrolls to the card, highlights it and focuses its input. Every "Answer" or "Decide" button elsewhere uses this. |

## 3. Blueprint

Close to the demo. Required: `bp-reanalyze` (agent-purple **Re-analyze ZIP**), `bp-log` (streams progress lines while running and ends with the counts line), `bp-weights` (stacked factor bar), `bp-rules`, `bp-state-forms` (jurisdiction tag; "No state forms rules are loaded for Utah…" for non-Texas buyers), and the (i) help button. A rule that needs a decision shows a "needs a decision" tag linking to its need.

## 4. Document set

| Element | Shipped | Required |
|---|---|---|
| Header actions | Add from library only. | **Add from library** `docs-library` + **Build all documents** `btn-build-all`, shown while anything is not started. |
| Columns | Document, Type, Stage, Needs, Pages, Ver, **Gate**, Score. | Document (title + **file name in mono** + "Hidden from interns" for pricing), Type, **Stage**, **Needs**, Pages, Reqs, Ver, Score. Drop the Gate column; gates live on Review gates. |
| Stage cell | "Not started" pill **and** a Build it button stacked. | Not started → **only** the **Build it** button (`docs-build-it`, agent purple). Started → the stage pill (Building / Judging / Revising with a spinner, Needs you amber, Passed green, Go). Rows carry `data-testid="docs-row"`, `data-key`, `data-stage`. |
| Needs cell | "—" | `docs-needs`: "N from you" tag, red if any are fatal, linking to Needs you filtered to that document. |
| Score | 0 for unbuilt. | "—" until the first judge pass. |
| Pricing row | Not started. | No Build it, because it's admin file upload. It shows "needs file" once the agent asks for it. |

## 5. Build evidence

| Element | Shipped | Required |
|---|---|---|
| Insert | One global "Insert into" select plus an Insert button per card. | A per-card **Insert into…** picker (`ev-insert`) listing document and section. Remove the global select. |
| Captures in documents | "0 of 3", from a heuristic. | Counted from real figure references (`data-artifact` in version content). |
| Decide | A prompt. | `ev-decide` opens the matching **decision need** in Needs you (one click, deep link). |
| Demo URL | Editable. | Keep it (`ev-demo-url`) in mono, with Save. |
| Intern thumbnails | Placeholder. | Add a portal artifact image route so interns see real thumbnails too. |
| Cards | Present. | `ev-capture` with `data-story` and `data-verified`. |

## 6. Draft & versions (editor)

| Element | Shipped | Required |
|---|---|---|
| Header | Paper / Outline / Edit buttons, Run review cycle, Diff vs previous. | View tabs **Paper / Outline / Preview PDF** (`ed-tab-*`) above the paper as an underlined tab row. Header actions: **Re-judge & revise** (`ed-run`, only when the doc is built and below 95) and **Diff vs previous**. Edit moves onto each section. |
| Doc picker | Plain buttons. | `ed-doc-pick`: each button shows the doc title plus its stage pill. An unbuilt doc shows a paper with "**<doc> hasn't been built yet**" + **Build it**. |
| Running header | Wraps to 3 lines. | `ed-running-header`, **one line**: `Colaberry · Response to <solicitation>` (truncates) · `<doc> · v<n> · <pages>/<limit> p`. |
| Headings | `h2` in the content renders at about 24px and wraps. | Normalize stored `h2/h3` to the paper scale (18px serif). |
| Sections | Content is rendered raw. | Each section is a block (`ed-section`, `data-section`). Its first line under the heading is the requirement reference `ed-reqref`: "Responds to … · REQ ids · Evaluation factor: X (weight)". The theme sentence is bold. "How our solution does it" is a small-caps subhead. |
| Section tools | None. | On hover or focus: **Edit section** `ed-sec-edit` (inline editor for that section; save = new human version, then re-judge), **Regenerate** `ed-sec-regen`, **Insert figure** `ed-sec-figure` (capture picker). |
| Placeholders | Raw `[PLACEHOLDER: …]` text. | `ed-needchip`: an amber chip reading "Needs: <ask>". Clicking it opens the need. Once answered it becomes a green chip with the value. **Raw `[PLACEHOLDER` text must never show.** |
| Findings | None in the paper. | Margin notes in the section: `ed-margin-agent` (grey, "Agent will fix: …") and `ed-margin-human` (amber, "Needs you: …" + button). Hidden once the doc passes. |
| Figures | — | `ed-figure`: the real capture image + caption "Figure N. … captured from the verified build (story, commit)". |
| Outline tab | Present (basic). | `ed-outline-row`: drag handle, section number + title, requirement chips, a "plan suggested" tag, page budget bar "x of y p". Drag to reorder saves a human version. |
| Preview PDF tab | Not wired. | `ed-pdf-page`: the real rendered PDF pages (existing renderer) with "Page n of N" footers, plus the line "Rendered with the agency rules: …". |
| Section plan | Five always-editable inputs. | `ed-plan` with `data-suggested="true"` while the values are AI suggestions (a "suggested" tag), shown read-only as a definition list. A reviewer clicks **Edit plan** to change it. |
| Checks | Present. | `ed-checks`, titled "Checks · vN" + the stage pill. Keep the bars, and the 95/85 line. |
| Versions | Present. | `ed-versions`: "v6 Agent 87 · time · change summary". Clicking a version shows it in the paper. |

## 7. Review gates

| Element | Shipped | Required |
|---|---|---|
| Gold | A panel **below** the matrix, with an inline "Not ready" list. | `gates-gold-panel` **at the top**, with a gold border, shown **only** when every document has passed its AI gates: "**Gold: ready for your Go** · All N documents passed…" plus **Go** `gates-go` and **No-go** `gates-nogo`. Afterwards it becomes a green "Go given" band. Before that point, nothing is shown, and the Gold card's text explains it. |
| Team cards | Old copy ("Agent checks · reviewer confirms", "Executive approval (a person)"). | `gates-team-pink/red/glove/gold`, with the demo copy and tags: Pink **AI**, Red **AI ×3**, White glove **AI**, Gold **You**. |
| Matrix | Bars in every cell. The Result column is clipped at 1440px. | `gates-matrix`: score **chips** (number on a tinted background) per check, a bold **Score** column, and a **Gates** column of compact chips `gates-row-chips` (P ✓ · R ✓ · WG ✓ · Gold). The first column is sticky. It fits at 1440px inside the admin shell. Rows: `gates-row`, `data-key`. |
| Row click | — | `gates-detail` panel below the matrix: **Agent will fix** list vs **Needs you** list (each links to its need), and the judge evidence line. |
| Per-document accordion | Still present. | **Remove it.** The row click replaces it. |
| "Approve" buttons | — | **None anywhere.** The parity script fails on any button named Approve. |

## 8. Package & submit

Close to the demo. Required:
- `pkg-files`: mono tree with blueprint file names, pages n/limit, and a ready or stage tag.
- `pkg-sealed`: gold dashed envelope, admin only, showing "uploaded" or "needs file".
- `pkg-checklist`, which includes "Nothing open in Needs you" and "Gold Go: given/waiting".
- `pkg-export`: disabled until Go.
- Remove the raw `<input type=file>` from the checklist. Signed copies are uploaded from Needs you.

## 9. Phone (400px)

No horizontal page scroll on any view. The rail becomes a horizontal scroller with Done hidden. The agent panel drops below the workspace. The tour becomes a centered card.
