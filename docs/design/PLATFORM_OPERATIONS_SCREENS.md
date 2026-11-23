# Platform Operations — design template

The source of truth for `/admin/system/operations`. Extracted from
`Platform Operations dashboard screens.html` (downloaded 2026-11-23), which carries seven
rendered screens, one per tab. Every value below is measured from that file, not estimated.

The page answers Quincy's domain: 49 platform capabilities, grouped into seven questions a
person can actually act on. One tab per question. Nothing is in two tabs.

---

## 1. Tokens

These are the template's own values. **They are not the `baseline-ui` admin palette.** The
template uses a deeper, warmer cherry (`#B00D1C`) on a warm paper ground (`#FBF6F6`), where
`tokens.css` uses `--color-primary: #FB2832` on white. Where a shipped page must match the
template, it carries these values; it does not substitute the admin tokens and call that a
match.

### Surfaces and ink

| Role | Value |
|---|---|
| Page ground | `#FBF6F6` |
| Card surface | `#FFFFFF` |
| Tab strip ground | `#F3EAEB` |
| Top bar ground | `#2C2326` |
| Top bar ink | `#FBF6F6` |
| Route chip ground (in top bar) | `#45383C` |
| Route chip border (in top bar) | `#8C7B80` |
| Body ink | `#261A1C` |
| Muted ink | `#5E5054` |
| Card border | `#E5D8DA` |
| Row divider (inside a card) | `#EFE4E5` |
| Button border, secondary | `#D9C8CB` |
| Proposal box border (dashed) | `#C98A12` |

### Action colour

| Role | Value |
|---|---|
| Primary action ground and border | `#B00D1C` |
| Primary action ink | `#FFFFFF` |
| Card heading, link hover | `#A30B19` |
| Link rest | `#5E5054` |

### Status tones

The template defines exactly four, as a lookup. A pill picks a pair; it never invents one.

```js
const T = {
  ok:   ["#256B0C", "#E6F3DC"],  // Fired · OK · Recovered · 2 repaired today
  bad:  ["#A30B19", "#FFE3E5"],  // Has not fired · Untriaged · Stopped · Silent 19 hours
  warn: ["#7A4E00", "#FFF0CC"],  // Needs a row · Waiting · Failing
  off:  ["#5E5054", "#EFE7E8"],  // Not running · Fix attempt running
};
```

Colour is never the only carrier: every pill prints its word.

### Type

| Role | Family | Size |
|---|---|---|
| Page question (`h1`) | `'Bricolage Grotesque', sans-serif` | 34px / 1.1 |
| Card heading (`h2`) | inherited sans | 17px, colour `#A30B19` |
| Body | `'IBM Plex Sans', system-ui, sans-serif` | 14px / 1.45 |
| Subtitle under `h1` | sans | 15px, `#5E5054` |
| Card description, table cells | sans | 13px |
| Card meta (top right), mono sub-lines, pills, chips | see below | 12px |
| Table column headers | sans, letter-spaced caps | 11px |
| Big numbers (rollup tiles) | `'Bricolage Grotesque'` | 24 / 26 / 40px |
| Schedules, ids, error classes, counts | `'IBM Plex Mono', monospace` | 12px |

**Mono is load-bearing.** Anything a machine produced or a person must copy exactly — a cron
expression, an error class, a trace id, a duration — is mono. Prose is sans. That contrast is
how a row reads at a glance.

---

## 2. Page frame

```
┌──────────────────────────────────────────────────────────────────┐
│ ▓ Platform Operations   [/admin/system/operations]    (Live) ▓   │  #2C2326, 12px 24px
├──────────────────────────────────────────────────────────────────┤
│ [Fleet] Controls  Failures  Authority  Safety  Release  Direction│  #F3EAEB, 10px 24px
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   What is running, and is it alive?                        34px  │  main, max-width 1320px
│   Every agent and timer the registry claims, checked ...   15px  │  padding 28px 24px 40px
│                                                                  │
│   ┌─ card ──────────────┐  ┌─ card ──────────────┐               │  flex wrap, gap 16px
│   │                     │  │                     │               │  each card flex 1 1 480px
└──────────────────────────────────────────────────────────────────┘
```

- Top bar: `display:flex`, `gap:12px`, title `strong` 15px, route chip mono 12px with
  `border-radius:6px; padding:3px 10px`, and a right-aligned pill (`margin-left:auto`,
  `border:1px solid #8C7B80; border-radius:999px; padding:2px 10px`). The template's pill
  reads **Sample data**; a shipped page must not say that unless it is true.
- Tab strip: `nav[aria-label="Tabs"]`, `border-bottom:1px solid #E5D8DA`, `gap:6px`. Each tab
  is `min-height:44px; padding:0 16px; border-radius:8px`. Active carries
  `aria-current="page"`, `background` and `border` `#B00D1C`, white ink, weight 600. Inactive
  is white on `#E5D8DA`, weight 500.
- `main`: `max-width:1320px; margin:0 auto; padding:28px 24px 40px`, column flex, `gap:20px`.
- Card grid: a single `display:flex; flex-wrap:wrap; gap:16px`. The template uses exactly
  three card widths and no media query at all — the flex basis does the reflow:

  | Basis | Reads as | Used on |
  |---|---|---|
  | `flex: 1 1 100%` | full-width hero, always first in the tab | Controls, Authority, Safety, Direction |
  | `flex: 1 1 480px` | two up at desktop, one up below ~1000px | Fleet, Failures, Release and data, and the non-hero cards of Controls and Authority |
  | `flex: 1 1 340px` | three up at desktop | Safety, Direction |

  Every card also carries `min-width: 0`, without which a long mono string forces the card
  past its share and the row overflows.

- The hero card is laid out differently inside: `flex-wrap:wrap; gap:20px;
  align-items:center`, with a left block (`flex:1 1 280px`) holding the `h2`, a 40px
  Bricolage verdict line in the status tone's foreground colour, a 13px basis line, and the
  action row, and a right block holding the row list it summarizes. The verdict word is the
  headline — "Needs attention" in `#7A4E00`, not a number.

---

## 3. The card

Every panel on every tab is the same object. Learn it once.

```
┌───────────────────────────────────────────────────────────┐
│ Live fleet                        registry vs last 24 hours│  h2 17px #A30B19  ·  meta 12px #5E5054
│ A row that claims to run and has not is red.               │  13px #5E5054
│ ───────────────────────────────────────────────────────── │  1px #EFE4E5 (border-top on each row)
│ Curriculum content health scan                   ( Fired ) │  500 weight · pill right
│ registry: every 5 min                                      │  mono 12px #5E5054
│ ───────────────────────────────────────────────────────── │
│ ...                                                        │
│                                                            │
│ [ Run check now ]  [ Export evidence ]                     │  margin-top:auto
└───────────────────────────────────────────────────────────┘
```

`section` style, exactly:
`flex:1 1 480px; min-width:0; background:#FFFFFF; border:1px solid #E5D8DA;
border-radius:12px; padding:18px 20px; display:flex; flex-direction:column; gap:10px`

Four parts, in order, and only the first and last are mandatory:

1. **Header.** `justify-content:space-between; align-items:baseline; gap:10px`. Left is the
   `h2`. Right is a 12px muted phrase naming the *measurement window or basis* — "last 24
   hours", "checked every 15 minutes", "default deny". It is not decoration; it tells the
   reader what the numbers are of.
2. **Description.** One sentence, 13px muted, saying what the panel is for or how to read
   it. Omitted on panels whose rows are self-evident (`Last run, per job`).
3. **Body.** Either a row list or a table or a bar list (section 4).
4. **Actions.** `margin-top:auto` so the button row sits on the card floor and cards in a
   row line up. `flex-wrap:wrap; gap:8px`. First button is primary, the rest secondary.
   Every button is `min-height:44px; padding:0 16px; border-radius:8px; font:inherit;
   font-weight:600; cursor:pointer`.

---

### The two hero variants

A full-width card is always the first card of its tab, and it comes in two shapes.

**Rollup hero** (Safety, Direction) — ordinary `1px solid #E5D8DA` border. Inside:
`flex-wrap:wrap; gap:20px; align-items:center`. Left block `flex:1 1 280px` carries the
`h2`, a 40px Bricolage verdict word in the status tone's foreground, a 13px basis line
("Rolled up every 10 minutes · last rollup 4 min ago"), then the action row. Right block
carries the row list the verdict was computed from, so the reader can see the working.

**Danger hero** (Controls' Emergency stop) — `2px solid #B00D1C` border, `gap:12px`, column
flex. Below the header sits a row of state tiles, each `flex:1 1 260px; background:#F3EAEB;
border-radius:10px; padding:14px 16px; justify-content:space-between; align-items:center`,
holding a 12px muted label, a 24px Bricolage state word, and its own button. The tile's
button is the action; this card has no footer action row.

---

## 4. The four body shapes

**Row list** — the default. Per row: `border-top:1px solid #EFE4E5; padding:9px 0;
display:flex; justify-content:space-between; align-items:center; gap:12px`. Left column is
`min-width:0` holding a 500-weight title and a mono 12px sub-line. Right is the status pill
(`font-size:12px; font-weight:600; padding:3px 10px; border-radius:999px; white-space:nowrap`).

**Row list with a proposal box** — as above, but the row is a column (`gap:8px`) and carries a
dashed box underneath: `border:1px dashed #C98A12; border-radius:8px; padding:8px 10px`, mono
12px. Used when the platform is offering a person something to accept or reject.

**Table** — wrapped in `overflow-x:auto`. Headers are 11px caps, letter-spaced, muted,
left-aligned. Cells are 13px, schedule/duration/error-class columns in mono.

**Bar list** — a label (mono 12px), a track, a value. The track is a full-width
`#EFE4E5` bar with a filled portion; the fill takes the status tone's foreground colour. The
numeric value sits to the right of the track, never inside it.

---

## 5. The seven tabs

Each tab opens with its question as the `h1` and a one-line subtitle. These are the exact
strings from the template.

### 1 · Fleet — *What is running, and is it alive?*
> Every agent and timer the registry claims, checked against what actually fired.

| Panel | Meta | Body | Actions |
|---|---|---|---|
| Live fleet | registry vs last 24 hours | 5 rows | Run check now · Export evidence |
| Untracked timers | firing under no registry row | 2 rows + proposal box | Propose row · Dismiss |
| Last run, per job | what the logs would have told you | table: name, schedule, last fire, duration, outcome, error class | Open trace |
| Silent since | the outage mode nobody currently sees | 2 rows | Raise with a person |

### 2 · Controls — *Turn it on, turn it off, stop it now.*
> Every switch a named person can throw without a deploy.

| Panel | Meta | Actions |
|---|---|---|
| Emergency stop | one action, no deploy | Stop all agents · Halt all output |
| Agents | enable, disable, pause, resume | Pause agent · Disable · Resume |
| Schedules | live reload, no restart | Change schedule · Disable schedule |
| Timer guards | default-on and overlap | Switch timer on · Keep off |
| Execution policy | default deny | Review refusals |

### 3 · Failures — *What broke, and what happens to it now?*
> Failed work a person can read, triage, and either recover or deliberately abandon.

| Panel | Meta | Actions |
|---|---|---|
| Dead letters | failed past the retry limit | Recover · Abandon, with reason |
| Stale actions | checked every 15 minutes | Return to queue |
| Errors by class | last 24 hours (bar list) | Open failures in class |
| Open alerts | jobs failing or stopped | Open trace · Close with diagnosis |
| Handled without a person | auto-repair and auto-resolution | Review what was done |
| Bug tickets | typed as bug, not yet picked up | Dispatch fix attempt |

### 4 · Authority — *Who may do what, and who approved it?*
> Authority is granted per capability, by a named person, against evidence.

| Panel | Meta | Actions |
|---|---|---|
| Effective authority, per capability | one capability's progress never widens another's | Show how it was worked out |
| Requests waiting for a decision | promotion and tool grants | Approve · Decline · Open evidence |
| Restrictions | can narrow, can never widen | Add restriction · Lift restriction |
| Who manages whom | admin access is not authority | Open agent · Talk to agent |
| Unattributed actions | no real identity behind them | Assign identity |

### 5 · Safety — *Is anything behaving in a way it should not?*
> One state a person can act on, so nobody reads six timers' outputs to know whether the platform is safe.

| Panel | Meta | Actions |
|---|---|---|
| Security rollup | hero: one verdict word + the three scanners behind it | Open what needs attention |
| Code and secrets | static scan | Open finding |
| Access and threats | runtime watch | Review access change |
| Agent behaviour | sub-hourly watch | Pause agent · Raise with a person |

### 6 · Release and data — *Did the change land, and can we get back?*
> Releases proven from the running system, and a recovery position that is a known fact.

| Panel | Meta | Actions |
|---|---|---|
| Waiting for approval | no automated bypass | Approve for production · Send back |
| Last deploy, verified live | not inferred from an exit code | Verify again · Export evidence |
| Backup and restore | with evidence | Run a restore test · Export evidence |
| Schema drift | development vs production, nightly | Open the difference |
| Housekeeping | retention sweeps and preview stacks | Run sweep now |
| Safe to run twice? | idempotency and replay audit | Record assessment |

### 7 · Direction — *What should change next, and who is told?*
> The briefing, the thresholds behind every alert, and the proposals waiting on a person.

| Panel | Meta | Actions |
|---|---|---|
| Reliability briefing | for Quincy · every line cites its evidence | Open full briefing · Send to Quincy |
| Alert thresholds | owner: Quincy | Change threshold |
| Proposals to decide | drafted for a person | Accept · Reject |
| One problem, several alerts | resilience, twice an hour | Raise with a person |

---

## 6. Rules the template is enforcing

These are not stylistic. Each one is a position the design takes, and a shipped page that
breaks one is not matching the template.

1. **Every card ends in an action.** No panel is read-only. If there is nothing a person can
   do about it, it does not earn a card.
2. **Every card header states its basis.** "last 24 hours", "checked every 15 minutes",
   "not inferred from an exit code". A number with no stated window is not reportable.
3. **Claim and reality are shown side by side.** Live fleet is not "the registry"; it is the
   registry *against what actually fired*. Untracked timers is the same comparison run the
   other way. That pairing is the whole point of the Fleet tab.
4. **A placeholder is printed as a placeholder.** The template writes `[untracked timer]`,
   `[action id]`, `[job name]`, `[ticket title]` in brackets rather than inventing a
   plausible name. A shipped page shows the real value or the bracketed placeholder — never
   a convincing fake.
5. **The banner states the data's standing.** The template's top-right pill reads
   "Sample data". A shipped page changes that to the truth or drops it.
6. **44px minimum on every interactive target**, tabs included.
7. **Nothing is colour-only.** Every pill prints its word; every bar prints its number.

---

## 7. Screens

Rendered at 1280 wide from the downloaded bundle:

| # | Tab | Height |
|---|---|---|
| 1 | Fleet | 1080 |
| 2 | Controls | 1500 |
| 3 | Failures | 1500 |
| 4 | Authority | 1500 |
| 5 | Safety | 1080 |
| 6 | Release and data | 1500 |
| 7 | Direction | 1080 |

No screen has horizontal overflow at 1280.

---

## 8. Where the built page departs from the template, and why

The template is a design, drawn before the data was known. Four places the Fleet build does
not match it, each because matching it would have meant printing something we cannot support.

### 1. Live fleet has three states, not two

The template draws **Fired** (green) and **Has not fired** (red). The data forces a third.

`ai_agent_activity_logs` only receives a row when a runner calls `instrumentCronJob`. A
registry entry with no log rows is ambiguous and cannot be resolved from data: either it has
genuinely never fired, or it fires faithfully and reports nothing. When this was measured,
23 of 142 enabled scheduled agents had zero execution rows ever.

Painting those red would put two dozen false outages on the card every day until nobody read
it. So they are amber and say **No report ever**, and the panel's own note says what amber
means. Red is reserved for a job that we know reports, and did not fire.

### 2. The coverage line above the cards

Not in the template. It states, in one sentence, how many agents the registry claims, how
many report at all, how many timers exist in the source and how many are watched by nothing.
Template rule 2 says every card states the basis of its numbers; this is the basis for the
whole tab, and without it "everything fired" reads as a much stronger claim than it is.

### 3. Error class says `unclassified` rather than going blank

`ai_agent_activity_logs` records a message and a stack trace but **no error class**. The only
`error_class` column in the schema is on `dead_letter_jobs`, which is written only after a
job fails past the retry limit, and only for `SCHEDULE_REGISTRY` entries.

So the column shows the dead-letter class where one exists and `unclassified` otherwise. An
unclassified count is a gap in the record and prints as one. The Failures tab's own copy
already takes this position: *"Unclassified failures are the coverage gap."*

### 4. Actions that are designed but not wired are disabled, not silent

Every card ends in an action (template rule 1), and the Fleet phase ships reads only. A
button whose endpoint does not exist renders disabled, with a `title` naming the phase that
wires it. **Run check now** and **Try again** are real; the rest are not yet. A button that
looks live and does nothing is worse than one that says it is not ready.

### 5. Schedules are written in words, with the expression kept

The template writes "every 5 min" and "nightly". Real data is a raw cron expression, which
wraps in the middle of a table cell and tells a reader nothing they did not already have to
decode. The contract therefore carries `schedule_label` beside `schedule`, and the page shows
the label with the expression on the element's `title`. Anything it cannot parse with
confidence falls through to the raw expression rather than a confident-sounding guess — a
six-field expression, whose first field is seconds, is one of those.

### 6. Three card widths became four, to fit inside the admin shell

The template was drawn full bleed at 1280. Inside `AdminLayout` the sidebar takes 248px and
the two containers another 96, leaving 936.

- **Card basis 440, not 480.** Two 480px cards plus the gap need 976, so at exactly 1280 all
  four cards stacked into a long scroll and the design lost the two-by-two it is built
  around. 440 keeps it.
- **A fourth width for tables, `flex-basis: min(760px, 100%)`.** Six columns do not fit a
  list-sized card: at 440 the error-class column fell off the right edge, and that column is
  the coverage gap the card exists to show.

### Everything else matches

Palette, type scale, spacing, card anatomy, the 44px targets, the four status tones, the
tab strip and the page frame are the template's measured values, unchanged. The one addition
is a `:focus-visible` ring, which inline styles cannot express and a keyboard user needs.

### One defect this found, worth knowing before the other six tabs

At 390px the page scrolled sideways to 586px while every other admin page stayed at 390.
`AdminLayout`'s content column is a flex item without `min-width: 0`, so it will not shrink
below its content's min-content width, and `overflow-x: auto` on a table wrapper does not
stop the table reporting that width upward. The fix is `width: 0; min-width: 100%` on the
scroll wrapper. Any tab that adds a table will hit the same thing.

### Contrast

Every foreground/background pair in the template was measured against WCAG 2.1 AA. The worst
is 5.72:1 (`pill ok`), against a 4.5:1 requirement. For comparison, the admin token
`--color-primary: #FB2832` on white is **3.85:1 and fails** — which is the reason this
surface keeps the template's own deeper cherry rather than substituting the admin palette.

---

## 9. Source

The template is `Platform Operations dashboard screens.html`, a seven-screen bundle. Every
value in this document was extracted from it mechanically rather than read off a screenshot.
`frontend/src/fonts/bricolage-grotesque-latin-700.woff2` is the display face, taken from that
bundle and self-hosted like every other font in this app — they were moved off
fonts.googleapis.com because it handed a visitor's IP to Google before the consent banner was
answered, and this one does not undo that.
