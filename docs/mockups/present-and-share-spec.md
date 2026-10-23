# Task: Merge Steps 5 & 6 into a single "Present & Share" portfolio step

Repo: `ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator`
Page affected: the project task workspace, e.g. `/portal/projects/workspace/:projectId/PREP-4` ("Rehearse with one other person and take their notes").

A visual mockup of the target screen is in `showcase-step-mockup.html`. Copy it into the repo at `docs/mockups/showcase-step-mockup.html` and open it. Match its layout and behavior, but use the app's existing components, tokens and styles rather than copying its CSS.

---

## 1. Explore first (do not write code yet)

Find and summarize, with file paths:

1. **The stepper.** Where the 6 steps (Learn, Prepare, Build, Practice, Present, Reflect & Share) are defined and rendered. Is the list hardcoded, config-driven, or stored per task in the DB?
2. **The Learn step's presentation-type picker.** Find where the types are defined. The 7 types are:
   - Project introduction
   - AI visual presentation
   - Working-system demo
   - Final showcase
   - Architecture review
   - Stakeholder update
   - Client handoff

   Find their ids (e.g. `project_introduction`), timings and descriptions, and where the selected type is persisted.
3. **Recordings / takes.** Find where they are stored, using the Practice stage ("Take 1 of 3", "Project introduction · from your task setting", the Change button, the Private toggle). Report the model or table, its API endpoints, and how each recording is tagged with a presentation type. Does the tag come from the task setting, or from a per-recording field?
4. **The current Present and Reflect & Share steps.** What each step renders, and what data either one reads or writes. This includes reflection text, share state, and hand-in / completion logic.
5. **Step routing.** Is the current step held in the URL (query param or path), local state, or the store?
6. **The mentor panel ("Cory").** Does it receive step context? This step should give it portfolio context.

Post a short plan listing the files you'll touch before making changes. Flag any ambiguity, especially if recordings don't have a reliable per-recording type.

---

## 2. Changes

### 2a. Stepper: 6 steps → 5
- Replace **Step 5 Present** and **Step 6 Reflect & Share** with a single **Step 5 "Present & Share"**.
- Remove the old "Joining your live slot from this page is not wired up yet" placeholder.
- Keep backward compatibility. Any existing link, bookmark or saved progress that points to the old `present` or `reflect` step should resolve to the new step.
- If step definitions live in the DB or seed data, add a migration rather than only editing seeds.

### 2b. Recordings tagged by presentation type
- Every recording must carry a `presentationType` that is one of the 7 ids.
- If the type is currently inferred only from the task setting, add a per-recording field. Backfill existing recordings from the task's current setting at the time of migration.
- The existing "Change" control on a take should update that recording's type.

### 2c. New "Present & Share" step UI
Build it to match the mockup.

**Progress header**
- A ring and 7 pips showing **"N of 7 presentation types recorded"**.
- A type counts as done when there is at least one recording with that `presentationType`.

**Portfolio grid**
- Exactly 7 slots, always in the same order as the Learn list.
- **Filled slot:**
  - thumbnail of the latest (or best) take, with a play button
  - take count and duration
  - type name and timing
  - status badge: "Rehearsed with partner" or "N notes to address", if that data exists (otherwise omit)
  - the recording date
  - the existing Private/Shared toggle, wired to the existing privacy field
- **Empty slot ("the void"):**
  - dashed border, hatched background, a "+" circle, "N / 7" index, type name, timing and description
  - the CTA "Not recorded yet · Start this one →"
  - the whole slot is a button (keyboard-focusable, with an aria-label)
  - on hover, the border turns navy and the "+" fills in
- **Clicking an empty slot** navigates to the Learn step with that type pre-selected, e.g. `?step=learn&type=working_system_demo`.
- A **"Start the next one →"** link deep-links the same way to the first missing type.

**Learn step deep link**
- Read the `type` param on load.
- Pre-select that card and persist the selection the same way a manual click does, so the checklist, timings and deck prompt all update.
- Show a dismissible banner: "Getting ready to record: <Type>. Checklist, timings and deck prompt now follow this type", with a "← Back to portfolio" link.
- In the Learn picker, mark types that already have a recording with a small "✓ recorded".

**Reflect & share section** (below the grid)
- Move the existing reflection input here: "What did your rehearsal partner tell you?"
- Keep any existing save logic.
- Add a share button whose label reflects how many videos are currently shared. It is disabled when none are shared.

**Sidebar**
- Keep the THIS TASK and WHAT THIS ASKS FOR cards.
- Add a **Portfolio** card listing all 7 types, each with ✓ or —.
- Remove the stale "Reserve or join your practice room on the Practice stage" SESSION card from this step only.

**Mentor**
- If the mentor accepts context, pass `{ recordedTypes, missingTypes, nextType }` so it can suggest what to record next.

### 2d. Completion and points
- Do **not** change what's required to complete PREP-4 or its +40 pts unless the existing logic depended on the removed steps; if it did, preserve the same outcome.
- Recording all 7 types is portfolio progress, not a new hand-in requirement. If there's an obvious hook for tracking it (e.g. a project progress metric), expose `recordedTypeCount` but don't add new scoring without asking.

---

## 3. Constraints
- Reuse existing design tokens and components (cards, chips/pills, buttons, stepper). No new UI library.
- Responsive:
  - the grid collapses with `auto-fill, minmax(230px, 1fr)`
  - the sidebar stacks below the content on narrow screens
- Accessibility: void slots are real `<button>`s, toggles have labels, and there are visible focus states.
- Keep the PR focused. Don't refactor unrelated steps.

## 4. Verify before finishing
- Run the existing lint, typecheck and tests; add tests for:
  - the done/missing calculation per type (0, 1 and 7 recorded)
  - the Learn deep link pre-selecting and persisting the type
  - legacy `present` / `reflect` step links resolving to the new step
  - the migration/backfill, if added
- Run the app and check PREP-4 in the browser in these states:
  - no recordings
  - one Project introduction recording (should show 1 of 7)
  - several types recorded
- Click a void slot and confirm Learn opens with the correct card selected and the downstream checklist updated.
- Summarize what changed, any migrations, and anything you couldn't wire up (e.g. missing per-recording rehearsal-notes data).
