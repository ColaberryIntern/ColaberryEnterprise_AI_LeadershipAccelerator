# VALIDATION_CONTRACT.md
## Machine-readable validation evidence

**Version:** 1.0
**Status:** Active (Phase 3)
**Schema:** [`validation_result.schema.json`](../validations/validation_result.schema.json)

---

## 1. What a validation result is

A `ValidationResult` is the structured evidence Claude Code produces after
attempting to verify a build operation. It is a separable artifact from
`BuildManifest` so external test runs (CI, manual QA) can also emit it.

Validation results answer:
- **Was the build correct?** (tests passed/failed, types compiled)
- **Was the build complete?** (all expected outputs emitted)
- **What evidence was collected?** (test logs, screenshots, coverage reports)

---

## 2. Required structure

```json
{
  "validation_version": "1.0",
  "result_id": "uuid",
  "project_id": "uuid",
  "task_id": "uuid | null",
  "bp_id": "uuid | null",
  "manifest_id": "uuid | null",   // links back to the BuildManifest if present

  "executed_at": "ISO-8601",

  "executed_tasks": [
    { "task_id": "uuid", "title": "string", "outcome": "completed" | "partial" | "failed" }
  ],

  "verification_status": "verified" | "partial" | "failed" | "skipped",

  "test_evidence": [
    { "type": "tsc" | "jest" | "playwright" | "build" | "lint" | "manual",
      "command": "string | null",
      "outcome": "pass" | "fail" | "skipped",
      "passed": 0,
      "failed": 0,
      "duration_ms": 0,
      "log_excerpt": "string (last 2 KB max)" }
  ],

  "screenshots": [
    { "path": "path/to/screenshot.png", "description": "string" }
  ],

  "failures": [
    { "kind": "type_error" | "test_failure" | "build_error" | "runtime_error" | "missing_evidence",
      "message": "string",
      "location": "file:line | null" }
  ],

  "unresolved_issues": [
    { "issue_id": "string", "summary": "string", "severity": "info" | "warning" | "error" }
  ],

  "confidence_score": 0,           // 0-100
  "confidence_basis": "string"     // why this score
}
```

---

## 3. Required fields

`validation_version`, `result_id`, `project_id`, `executed_at`,
`verification_status`, `confidence_score`.

All arrays default to `[]`. `confidence_score` is required even when zero —
omit it and the validator rejects.

---

## 4. Confidence score guidance

| Score | Meaning |
|---|---|
| 90-100 | Tests pass, types compile, evidence is complete. Engine treats as authoritative. |
| 70-89 | Most checks pass, some evidence missing. Engine accepts but flags incomplete. |
| 40-69 | Mixed signal, manual review recommended. Engine surfaces a `low_confidence_validation` contradiction. |
| 0-39 | Probable failure or untested. Engine treats as a fallback only. |

`confidence_basis` is a short human-readable string (≤200 chars) that explains
the score. UI surfaces this verbatim.

---

## 5. Lifecycle

Validation results can be ingested:
- Bundled inside a `BuildManifest`'s `validation_results` field (most common).
- Standalone via `POST /api/portal/project/validation-result`.

Either way, the row lands in `validation_results` (table) and feeds into
`sync_health` and the explainability payload.

---

## 6. Conflict resolution

Multiple validation results for the same task:
- The latest `executed_at` wins for current state.
- Earlier results remain queryable for history.
- If a later result has a LOWER confidence than an earlier one, a
  `validation_regression` contradiction is raised.

---

## 7. Forbidden patterns

- Free-text validation in PROGRESS.md alone (no machine-readable result) — the
  engine cannot consume it. Always also emit a structured result.
- Posting a validation with `verification_status: "verified"` and zero
  `test_evidence` entries — validator rejects.
- Storing screenshots inline as base64 — use file paths.
