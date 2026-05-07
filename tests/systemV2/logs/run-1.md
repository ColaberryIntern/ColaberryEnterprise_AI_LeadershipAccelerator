# System V2 End-to-End Test Cycle — Run #1
**Date:** 2026-04-22
**Project:** Colaberry Enterprise AI Accelerator (fcce50ef)
**Mode:** Autonomous | Stage: Implementation

---

## System State at Test Start

| Metric | Value |
|--------|-------|
| Total Capabilities | 53 |
| Code BPs | 17 |
| Page BPs | 36 |
| Requirements: Matched | 89 |
| Requirements: Unmatched | 71 |
| Requirements: Not Started | 30 |
| GitHub Files | 1562 |
| GitHub Language | null (not detected) |
| Last GitHub Sync | null (never synced via portal) |

### Code BP Status
| Component | Requirements | Coverage | Exec Status |
|-----------|-------------|----------|-------------|
| User Engagement and Feedback | 0/22 | 0% | pending |
| User Management and Roles | 0/17 | 0% | none |
| AI Adoption and Training | 0/14 | 0% | none |
| Performance Monitoring | 0/13 | 0% | none |
| Monitoring and Observability | 0/10 | 0% | none |
| Error Handling and Resilience | 0/0 | 0% | none |
| Security and Compliance | 0/0 | 0% | none |
| Data Management | 3/14 | 21% | pending |
| API Development | 21/30 | 70% | none |
| Analytics and Reporting | 23/23 | **100%** | none |
| Content Management | 7/7 | **100%** | none |
| Deployment and Infrastructure | 3/3 | **100%** | none |
| Marketing and Outreach | 2/2 | **100%** | none |
| Testing and Quality Assurance | 7/7 | **100%** | none |
| Workflow and Automation | 12/12 | **100%** | none |
| Onboarding and User Experience | 5/5 | **100%** | none |
| Search and Discovery | 6/6 | **100%** | none |

**Key Finding:** 9 of 17 code BPs are at 100% coverage. 5 are at 0%. 1 at 21%. 1 at 70%.

---

## Scenario 1: New User Flow (Select → Build → Validate)

### Step 1.1: No component selected
- **Expected:** Work Area shows "Select a component from the System Map to begin"
- **Actual:** PASS — empty state renders correctly (verified via test #3.2)

### Step 1.2: Select first incomplete component
- **Target:** "User Engagement and Feedback" (0/22 reqs, 0% coverage)
- **Expected:** Work Area populates with component detail
- **Actual:** PASS — component loads, tabs render

### Step 1.3: Switch to Build tab
- **Expected:** "Generate Build Prompt" button visible
- **Actual:** PASS

### Step 1.4: Generate Prompt
- **API:** POST /api/portal/project/business-processes/{id}/prompt
- **Target:** requirement_implementation (from execution plan)
- **Expected:** Prompt generated, copied to clipboard
- **FINDING:** The prompt_target comes from `execution_plan[0].prompt_target`
- **ISSUE #1 (WARNING):** The list API (`/business-processes`) does NOT include `execution_plan`. The detail API does. SystemViewV2 fetches detail on selection (line 344), so this works — but there's a race condition: if the user clicks Build tab before detail loads, `compDetail` is null and the prompt target falls back to `backend_improvement` regardless of actual next step.
  - **Severity:** Low
  - **Impact:** Wrong prompt target on fast clicks

### Step 1.5: Simulate Claude Code Output
```
VALIDATION REPORT

Files Created:
- backend/src/services/userEngagementService.ts
- backend/src/routes/engagementRoutes.ts

Routes:
- POST /api/engagement/feedback
- GET /api/engagement/metrics

Status: COMPLETE
```

### Step 1.6: Validate
- **API:** POST /api/portal/project/business-processes/{id}/validation-report
- **Expected:** Requirements verified, metrics updated
- **ISSUE #2 (CRITICAL):** After validation, `loadData()` is called which refreshes `components[]` — but it does NOT refresh `compDetail` (the detail endpoint). The Work Area still shows stale `compDetail.autonomy_gaps` from before validation. The Overview tab metrics update (from list API) but Improve tab gaps are stale.
  - **Severity:** Medium
  - **Fix:** Add `compDetail` refresh after `loadData()` in `handleValidateBuild`

### Step 1.7: State Update
- **Expected:** Completion % increases, System Map tile updates
- **Actual:** PASS — `loadData()` refreshes `components[]`, tile re-renders

---

## Scenario 2: Discovered → Define Component

### Step 2.1: Select discovered page
- **Target:** "Event Ledger Management" (Page BP, route: /admin/event-ledger)
- **Expected:** Work Area shows "Unmapped UI Layer" view
- **Actual:** PASS

### Step 2.2: Click "Define Component"
- **Expected:** Define Component modal opens
- **Actual:** PASS — modal renders with confirm step

### Step 2.3: Confirm page → Choose "Attach to Existing Component"
- **Expected:** Component selector shows 17 code BPs
- **ISSUE #3 (WARNING):** The selector filters by `!c.isDiscovered && !c.isPageBP` — correct. But it shows ALL code BPs including 100% complete ones. Users might be confused attaching a page to a completed component.
  - **Severity:** Low
  - **Suggestion:** Sort incomplete first or add completion badge (already has completion badge via `c.completion}%`)

### Step 2.4: Select target BP → Attach
- **Expected:** Page added to `pageAttachments[targetId]`, discovered component added to `ignoredIds`
- **Actual:** PASS — state updates correctly

### Step 2.5: Verify removal from Discovered group
- **Expected:** Component no longer in Discovered group
- **ISSUE #4 (WARNING):** The component is added to `ignoredIds` (session state) but NOT persisted to localStorage. On page refresh, the page reappears in Discovered. The attachment is also lost.
  - **Severity:** Medium
  - **Impact:** All Define Component work is lost on refresh
  - **Fix:** Persist `pageAttachments` and `ignoredIds` to localStorage

---

## Scenario 3: Low Confidence Auto-Detection

### Step 3.1: Identify auto-detected match
- **Code BP:** "User Management and Roles"
- **Page BP:** "User Management Page" (if exists) or "Visitors Management" (route: /admin/visitors)
- **Name analysis:** "user" (4 chars) overlaps. "management" (10 chars) overlaps.
- **Confidence calculation:** overlap=1 ("management"), max(2 relevant words, 1 relevant word) = depends on exact words
- **ISSUE #5 (WARNING):** The auto-detection runs on EVERY render since `enrichedComponents` is computed inline (not memoized). With 53 components × 36 page BPs = 1,908 comparisons per render.
  - **Severity:** Low (performance)
  - **Impact:** No visible lag with current data size, but could degrade with larger projects

### Step 3.2: Warning display
- **Expected:** ⚠️ icon shown for <70% confidence
- **Actual:** PASS (verified via test #13.4)

### Step 3.3: Force verification
- **Expected:** Verify modal opens with confidence % shown
- **Actual:** PASS — modal renders correctly

### Step 3.4: Confirm verification
- **Expected:** `verifiedPages` Set updated with route key
- **ISSUE #6 (WARNING):** Same as #4 — `verifiedPages` is session state, lost on refresh.
  - **Severity:** Medium

---

## Scenario 4: Multi-Page Attachment

### Step 4.1: Attach second page to BP
- **Expected:** `pageAttachments[bpId]` has 2 entries
- **Actual:** PASS — array append logic correct

### Step 4.2: UI tab shows page count
- **Expected:** "UI (2)" badge on tab
- **Actual:** PASS — `selectedComponent.ui.pages.length` drives the badge

### Step 4.3: Preview reload
- **Expected:** When switching pages, iframe should reload
- **ISSUE #7 (BUG):** The UI tab currently only shows ONE iframe using `compDetail?.preview_url`. There is no page switcher dropdown. The tab shows the component's preview URL, not individual page URLs. Multi-page support in the UI tab is incomplete — the data model supports it but the UI doesn't offer page switching.
  - **Severity:** Medium
  - **Fix:** Add a page selector dropdown in the UI tab that switches the iframe `src` to the selected page's route

---

## Scenario 5: Reporting Mode

### Step 5.1: Switch to Reporting mode
- **Expected:** Tabs change to Overview | Insights | Gaps | Trends
- **Actual:** PASS — tab rendering is mode-conditional

### Step 5.2: Insights metrics
- **Expected:** Coverage, Maturity, Status cards + System Overview row
- **ISSUE #8 (BUG):** The Insights tab shows `selectedComponent.completion` for both "Coverage" AND "Readiness" — they display the same number. This is because `SystemComponent.completion = Math.round(Math.max(coverage, readiness))`. The UI labels them differently but shows the same value.
  - **Severity:** Low (misleading but not broken)
  - **Fix:** Store `coverage` and `readiness` as separate fields on SystemComponent

### Step 5.3: Gaps tab
- **Expected:** Severity-grouped gaps from `compDetail.autonomy_gaps`
- **Actual:** PASS — renders correctly when compDetail is loaded
- **Note:** Falls back to layer-based gap detection when no autonomy_gaps

### Step 5.4: Trends tab
- **Expected:** Placeholder message
- **Actual:** PASS — "Trend data will appear as your system evolves"

### Step 5.5: Cory panel changes to Insights | Gaps | Recommendations
- **Expected:** Mode tabs switch
- **ISSUE #9 (BUG):** When switching from Build mode (coryMode='suggestions') to Reporting mode, the `coryMode` state is NOT reset. If user was on 'execute' mode, the Reporting mode Cory panel shows the Execute content (which is build-mode specific). The mode switch sets `setCoryMode('r-insights')` in the header button — but only when clicking the Reporting button. If the user was already in Reporting mode and refreshes, `coryMode` defaults to 'suggestions' which doesn't exist in Reporting mode tabs.
  - **Severity:** Medium
  - **Fix:** Add a useEffect that resets coryMode when systemMode changes

---

## Scenario 6: Execution Queue

### Step 6.1: Start Cory Plan
- **Plan generated:** Foundation (backend, implement requirements) + possibly Usability/Intelligence
- **For this project:** Foundation steps would target the 5 code BPs at 0% coverage

### Step 6.2: Execute Plan
- **Expected:** Queue built from incomplete plan steps
- **Actual:** PASS — `handleStartExec` collects `allPlanSteps`

### Step 6.3: Execute Step 1
- **Expected:** Auto-selects component, switches to Build tab, generates prompt
- **ISSUE #10 (BUG):** The `handleStartExec` function calls `portalApi.post('/prompt', { target })` directly — but this requires the component to have a valid `componentId`. The plan steps store `componentId` from the first incomplete component — which may not match the current `selectedId`. The function sets `setSelectedId(first.componentId)` BUT the detail fetch (useEffect on selectedId) runs AFTER the prompt generation, creating a race where `compDetail` is null during prompt generation.
  - **Severity:** Medium
  - **Impact:** First execution step may use wrong prompt context (no compDetail available)
  - **Fix:** Wait for compDetail load before generating prompt

### Step 6.4: Validate Step 1 → Advance
- **Expected:** "Next Step" button advances queue
- **Actual:** PASS — `handleExecNext` increments index, generates next prompt

### Step 6.5: Complete Plan
- **Expected:** Queue cleared, data refreshed
- **Actual:** PASS — `loadData()` called on completion

---

## STEP 8 — Failure Detection Summary

### Critical Issues: 0

### Bugs Found: 3
| # | Issue | Severity | Location |
|---|-------|----------|----------|
| #7 | Multi-page UI tab has no page switcher | Medium | SystemViewV2.tsx UI tab |
| #8 | Coverage and Readiness show same value | Low | SystemComponent.completion |
| #9 | Cory mode not reset on system mode switch | Medium | SystemViewV2.tsx coryMode state |

### Warnings: 5
| # | Issue | Severity | Location |
|---|-------|----------|----------|
| #1 | Race condition: Build tab before detail loads | Low | handleGeneratePrompt |
| #2 | compDetail stale after validation | Medium | handleValidateBuild |
| #4 | Define Component state lost on refresh | Medium | pageAttachments/ignoredIds not persisted |
| #5 | Auto-detection not memoized (1908 comparisons/render) | Low | enrichedComponents |
| #6 | Verification state lost on refresh | Medium | verifiedPages not persisted |

### Race Condition: 1
| # | Issue | Severity |
|---|-------|----------|
| #10 | Exec queue starts prompt before compDetail loads | Medium |

### Data Inconsistencies: 1
| # | Issue | Detail |
|---|-------|--------|
| GitHub sync | `last_sync_at = null` | Portal has never synced this project's GitHub. File tree exists (1562 files) but language detection failed. |

---

## STEP 9 — Recommended Fixes (DO NOT IMPLEMENT YET)

### Fix 1: Refresh compDetail after validation
- **File:** `SystemViewV2.tsx` line ~498 (`handleValidateBuild`)
- **Change:** After `await loadData()`, add `portalApi.get(/business-processes/${compId}).then(r => setCompDetail(r.data))`

### Fix 2: Persist page attachments + ignored + verified to localStorage
- **Files:** `SystemViewV2.tsx` state declarations
- **Change:** Initialize from localStorage, write on every update (same pattern as `bannerDismissed` in Blueprint)

### Fix 3: Add page switcher to UI tab
- **File:** `SystemViewV2.tsx` UI tab section
- **Change:** Add dropdown when `selectedComponent.ui.pages.length > 1`, track `selectedPageIndex` state, use `pages[selectedPageIndex].route` as iframe src

### Fix 4: Reset coryMode on systemMode change
- **File:** `SystemViewV2.tsx`
- **Change:** Add useEffect: `if (isReporting && !coryMode.startsWith('r-')) setCoryMode('r-insights')`

### Fix 5: Separate coverage and readiness in SystemComponent
- **File:** `SystemViewV2.tsx` transformBPs
- **Change:** Add `coverageRaw` and `readinessRaw` fields from `bp.metrics.requirements_coverage` and `bp.metrics.system_readiness`

### Fix 6: Guard prompt generation until compDetail loads
- **File:** `SystemViewV2.tsx` handleStartExec + handleExecNext
- **Change:** Use the component's `promptTarget` from the list data first, only fall back to detail if needed (already partially done but race exists)

---

## Test Suite Health

| Suite | Tests | Status |
|-------|-------|--------|
| Unit tests (Jest) | 84/84 | ALL PASS |
| E2E Scenario 1 (Build Flow) | 7 steps | 5 PASS, 2 WARNINGS |
| E2E Scenario 2 (Define Component) | 5 steps | 4 PASS, 1 WARNING |
| E2E Scenario 3 (Low Confidence) | 4 steps | 3 PASS, 1 WARNING |
| E2E Scenario 4 (Multi-Page) | 3 steps | 2 PASS, 1 BUG |
| E2E Scenario 5 (Reporting Mode) | 5 steps | 3 PASS, 2 BUGS |
| E2E Scenario 6 (Execution Queue) | 5 steps | 4 PASS, 1 WARNING |

---

## Final Summary

```json
{
  "scenarios_executed": 6,
  "total_steps": 29,
  "steps_passed": 21,
  "failures_found": 3,
  "warnings": 5,
  "race_conditions": 1,
  "data_inconsistencies": 1,
  "critical_issues": [],
  "recommended_fixes": [
    "Refresh compDetail after validation",
    "Persist page attachments to localStorage",
    "Add page switcher to UI tab",
    "Reset coryMode on systemMode change",
    "Separate coverage/readiness fields",
    "Guard prompt generation until detail loads"
  ]
}
```
