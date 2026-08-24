# RESUME_PROFILE_MAP (Gate 0 / plan §2.1, §12)

## Source of truth

| Datum | Owner | Column / field |
|---|---|---|
| Resume file bytes | `OnboardingProfile` | `resume_data` (base64), `resume_file_name`, `resume_mime`, `resume_uploaded_at` |
| Resume plain text | `OnboardingProfile` | `resume_text` |
| Structured extraction | `OnboardingProfile` | `extracted`, `prefill` |
| Parser provenance | `OnboardingProfile` | `resume_version` (int), `extractor_version` (string) |
| Parsed skill claims | `ResumeSkillClaim` | written by `capeResumeClaimService.persistResumeSkillClaims` |
| LinkedIn URL | `OnboardingProfile` | `linkedin_url` |
| Name / email / title / company / phone | `Enrollment` | via `portalSettingsService.SettingsView` |
| Avatar | `Enrollment` | `avatar_data_url` |

## Existing endpoints (reused unchanged)

```
POST   /api/portal/settings/resume     handleSetResume
GET    /api/portal/settings/resume     handleGetResume    (streams decoded bytes to owner)
DELETE /api/portal/settings/resume     handleClearResume
GET    /api/portal/settings            getSettings → SettingsView
```

`SettingsView.resume` is `{ file_name, mime, size_bytes, uploaded_at } | null`. **Non-null is
the canonical "resume exists" predicate** and is exactly what Gate 1's access state machine
keys on. No new "does a resume exist" flag was introduced.

## What this build does and does not do

**Does:** read resume presence + LinkedIn + identity through the existing service, and route the
"paid but no resume" state to the *existing* Settings resume uploader rather than shipping a
second upload control.

**Does not:** re-parse resumes, store a second copy, or convert AI extraction into asserted
truth. Plan §12's "never fabricate missing employers, dates, skills, titles, education or
certifications" is honoured by not generating any of them: the Studio surfaces resume-sourced
skill claims strictly as evidence level `resume`, visually and semantically distinct from
Colaberry-verified capability.

## Deferred (documented, not silently dropped)

- **LinkedIn PDF ingest** (plan §29 / Kes `POST /:id/linkedin-pdf`). Enterprise accepts a resume
  file today; a LinkedIn-PDF-specific extraction path is Gate 4 work.
- **Reparse-and-diff on resume change** (plan §12 "when resume changes → reparse → compare →
  show changes → preserve platform-verified evidence"). `resume_version` already exists to key
  this; the diff UI is Gate 4.
