# Marketing Integrity Report

**Date:** 2026-03-09
**Branch:** workstream/marketing
**Scope:** Marketing Stability & Conversion Integrity Upgrade

---

## 1. Schedule Consistency

**Status: RESOLVED**

All hardcoded schedule references across 7+ files have been centralized into `config/programSchedule.ts`.

| File | Before | After |
|------|--------|-------|
| ProgramPage.tsx | Hardcoded "5 Sessions", "3 Weeks", "2 Hours Each", day labels | Imports from PROGRAM_SCHEDULE |
| PricingPage.tsx | "5-Day Intensive... 2 weeks", "Mon/Wed/Fri", "6-hour", "30 hours" | Uses PROGRAM_SCHEDULE.pricingDescription |
| HomePage.tsx | "5-Day Executive AI Build Accelerator", "2 weeks" | Uses PROGRAM_SCHEDULE.heroTagline, totalSessions, totalWeeks |
| SponsorshipPage.tsx | "5 days, 2 weeks" | Uses PROGRAM_SCHEDULE.sponsorshipTimeline |
| CaseStudiesPage.tsx | "5-Day Executive Accelerator" | Updated to "Executive Accelerator" |
| EnrollPage.tsx | Hardcoded "$4,500" | Uses PROGRAM_SCHEDULE.price |
| StrategyCallModal.tsx | "March 31 Enterprise AI Cohort", "21 days" | Dynamic "next cohort", "3 weeks" |

**Canonical schedule:** 5 sessions, 3 weeks, 2 hours each, Tuesdays and Thursdays.

**Grep verification:** No remaining instances of "5-Day", "5 days", "2 weeks" (schedule context), "Mon/Wed/Fri", "6-hour", "30 hours", or "March 31" in marketing pages.

---

## 2. Cohort Loading

**Status: RESOLVED**

**EnrollPage.tsx changes:**
- Added `start_date >= today` filter (was missing — past cohorts could appear)
- Added error state display (`cohortError` flag)
- Added diagnostic logging when cohorts exist but none pass filters
- Added Link import for proper routing in empty/error states
- Uses `<Link to="/contact">` instead of `<a href="/contact">`

**Backend constraint:** Cohort model has `status: 'open'|'closed'|'completed'` only (no `isVisible` or `published` field). Backend `listOpenCohorts()` already filters by `status: 'open'`. Frontend adds date and seat filters.

---

## 3. Lead Schema & Enterprise Lead Model

**Status: IMPLEMENTED**

**New file:** `models/EnterpriseLead.ts`
- TypeScript interface with rich frontend fields
- `toLeadPayload()` transformer maps to flat backend schema
- Extra fields (industry, aiMaturityLevel, budgetOwner, timeline, intentScore) serialize into `message` field
- `primaryObjective[]` maps to `interest_area`
- `willSeekCorporateSponsorship` maps to `evaluating_90_days`
- `industry` maps to `role`
- UTM medium appended to `utm_source` with pipe separator

**No backend changes required.**

---

## 4. Form Schema Compliance

| Page | Form Type | Uses EnterpriseLead | Validation |
|------|-----------|-------------------|------------|
| ContactPage | enterprise_inquiry / enterprise_inquiry_with_briefing | Yes | validateForm() |
| HomePage | executive_overview_download | Yes | validateForm() |
| SponsorshipPage | sponsorship_kit_download | No (LeadCaptureForm) | LeadCaptureForm built-in |
| EnrollPage | enrollment | No (custom form) | Custom validate() |
| StrategyCallModal | calendar/book | No (separate API) | Custom validation |

---

## 5. UTM Tracking Coverage

**Status: ALL FORMS COVERED**

| Form | captureUtm | Method |
|------|-----------|--------|
| HomePage briefing form | Yes | Manual URLSearchParams capture |
| ContactPage enterprise form | Yes | Manual URLSearchParams capture |
| SponsorshipPage kit download | Yes | `captureUtm={true}` prop (was missing) |
| EnrollPage enrollment form | Yes | Manual URLSearchParams capture (was missing) |
| StrategyCallModal | N/A | Separate booking API, uses visitor_fingerprint |

---

## 6. Form Validation Layer

**New file:** `utils/formValidation.ts`
- `validateForm()` with required, conditionalRequired, email, phone rules
- Applied to ContactPage and HomePage forms
- Conditional: willSeekCorporateSponsorship triggers budgetOwner + timeline required

---

## 7. Campaign Routing

| formType Value | Page | Purpose |
|---------------|------|---------|
| executive_overview_download | HomePage | Executive briefing download |
| enterprise_inquiry | ContactPage | General enterprise inquiry |
| enterprise_inquiry_with_briefing | ContactPage | Inquiry + briefing opt-in |
| sponsorship_kit_download | SponsorshipPage | Sponsorship kit download |
| enrollment | EnrollPage | Cohort enrollment |
| contact | (removed) | Replaced by enterprise_inquiry |

---

## 8. Files Changed

### New Files (4)
- `frontend/src/config/programSchedule.ts`
- `frontend/src/models/EnterpriseLead.ts`
- `frontend/src/utils/formValidation.ts`
- `frontend/src/docs/marketingIntegrityReport.md`

### Modified Files (9)
- `frontend/src/pages/ProgramPage.tsx`
- `frontend/src/pages/PricingPage.tsx`
- `frontend/src/pages/HomePage.tsx`
- `frontend/src/pages/SponsorshipPage.tsx`
- `frontend/src/pages/CaseStudiesPage.tsx`
- `frontend/src/pages/EnrollPage.tsx`
- `frontend/src/pages/ContactPage.tsx`
- `frontend/src/components/StrategyCallModal.tsx`

---

## 9. Verification

- `npx tsc --noEmit` — **zero errors**
- Hardcoded schedule string grep — **zero matches** in marketing pages
- All forms send `form_type` tag
- All forms capture UTM params
- Cohort loading filters by date AND seats
- No backend changes required
