# PAYWALL_MAP (Gate 0 / Gate 1 · plan §2.5, §6, §39)

## Existing machinery (extended, never forked)

```
frontend                                  backend
────────                                  ───────
useEntitlement()                          resolveContentPageAccess(enrollmentId)
  └─ scheduleCache → /api/portal/            └─ Enrollment.payment_status
     onboarding/schedule                     └─ Cohort.cohort_type
     → { is_staff, has_full_access }         └─ isStaffEnrollment()
                                             └─ activeCompEnrollmentIds()
<PageGate feature="…">                    requireContentEntitlement(feature) → 402
  └─ PaywallScreen(GATED_FEATURES[k])         flag: CONTENT_PAGE_GATE_ENABLED (default OFF)
                                              behaviour: FAIL OPEN on lookup error
```

## Changes made by this build

| File | Change |
|---|---|
| `frontend/src/components/paywall/gatedFeatures.tsx` | `GatedFeatureKey` gains `'portfolio'`; one icon + one copy block added (plan §6.1 copy) |
| `backend/src/middlewares/requireContentEntitlement.ts` | `GatedFeature` union gains `'portfolio'` |
| `frontend/src/routes/portalRoutes.tsx` | `/portal/portfolio` wrapped in `<PageGate feature="portfolio">` |
| `backend/src/routes/careerPortfolioRoutes.ts` | every route: `requireParticipant` → `requireContentEntitlement('portfolio')` |

**No second subscription check was written.** That is plan §2.5's requirement and §71's stop
condition ("unpaid users can access private Portfolio APIs").

## Gate 1 access state machine (plan §39)

```
unpaid                 → PageGate renders PaywallScreen; API returns 402
paid + no resume       → Career Studio replaced by resume prerequisite; API returns
                         { state: 'needs_resume' } and NO career data
paid + resume          → Career Studio opens, state = 'ready', visibility PRIVATE
published              → not reachable in this increment (Gate 10 deferred)
```

The prerequisite state is enforced **server-side**, not by UI hiding: `careerProfileService`
returns `{ state: 'needs_resume' }` with an empty payload before assembling anything. A student
who calls the API directly without a resume gets no skills, no artifacts, no projects.

## Flag interaction — read this before testing

`CONTENT_PAGE_GATE_ENABLED` is **OFF by default**, and `resolveContentPageAccess` returns
`hasFullAccess: true` when the flag is off. So with default env:

- the paywall is **inert** — every authenticated participant reaches the Studio;
- the **resume prerequisite still applies**, because it is independent of the paywall flag.

This matches how `classroom` and `projects` already behave and is deliberate: the portfolio tab
ships dark with respect to the paywall, exactly like its siblings, and turning the flag on gates
all three together.
