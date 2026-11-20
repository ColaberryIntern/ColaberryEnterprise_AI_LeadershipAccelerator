# Internal Quality Rubric — Version 1.0

Immutable versioned configuration (`qualityRubricV1.ts`). Overall score = `SUM(weight × dimension_score / 100)`, rounded to one decimal. Every dimension carries a confidence and source-cited evidence. **This is the internal rubric, not Herriman City's official scoring, and not a win probability.**

| Dimension | Weight | Excellent (90–100) requires |
|---|---:|---|
| Mandatory submission compliance | 20 | All forms, signatures, instructions, amendments, references, pricing files, page/file constraints and dates validated; none unknown |
| Technical responsiveness | 20 | Every substantive requirement answered with an actual method, mapping, workflow and verifiable support; zero significant contradictions |
| Implementation & delivery | 15 | Specific timeline, roles, milestones, integration/migration plan, training, testing, acceptance and realistic dependencies |
| Evidence & past performance | 15 | Appropriate approved government references, demonstrable product proof and verifiable claims mapped to requirements |
| Pricing & commercial completeness | 10 | Real authorized pricing, assumptions, totals, workbook consistency, technical/commercial alignment, risk allowances |
| Buyer differentiation | 10 | Buyer-specific problem/benefit/proof narrative, competitive distinctions where supported; little generic boilerplate |
| Risk, security & support | 5 | Applicable safeguards, security/data-handling commitments, support SLAs, operational and implementation risks, owners |
| Presentation & clarity | 5 | Correct format, coherent ordering, skimmable visuals, tables, diagrams, clean writing, navigation and readable PDFs |
| **TOTAL** | **100** | **Target ≥92 AND all hard gates pass** |

**Anchors:** 0 absent · 25 vague/bare assertions · 50 partly responsive, significant missing proof · 75 substantially responsive, material weaknesses · 90 convincing and well evidenced · 100 complete, verifiable, exception-free.

## Hard gates (regardless of numeric score)
`MANDATORY_BLOCKED` · `EVIDENCE_BLOCKED` · `PACKAGE_BLOCKED` · `APPROVAL_BLOCKED` · `REVIEW_BLOCKED`. If any blocks: the score is shown **provisional**, each blocker and its owner is listed, and **Export final submission package** is disabled. Draft previews stay available, watermarked.

## Honesty rules baked into the scorer
- An **UNKNOWN** dimension scores 0 and remains in the denominator — a score can never rise by skipping a dimension.
- A **provisional** score (any hard gate open) can never be reported as meeting the ≥92 target.
- No dimension earns points for section headings or bare compliance claims.

## Separate agency score
Parse the specific RFP's evaluation factors/weights and pass/fail terms separately. If agency weights are absent, mark `UNKNOWN` and ask for human validation. Never confuse the agency score with the internal rubric or with award probability.

## Versioning
`RUBRIC_VERSION = '1.0'` (the weights/anchors) and `CHECKER_VERSION` (the scoring code) are recorded on every quality-run record so a score is reproducible. Changing the weights is a new rubric version through a separately reviewed change.
