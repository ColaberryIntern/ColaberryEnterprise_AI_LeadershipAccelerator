# Case Study OS — Proof Integration

**Gate 0 deliverable.** How the Case Study proof model aligns with the proof model this
repository already ships. Observed against `origin/main` = `cfd016d9`, 2026-08-22.

The one-sentence version: **there are two existing verification vocabularies, they are not
interchangeable, Case Study OS adopts the lowercase UI one for per-record data, and adds a new
orthogonal axis (`verification_method`) that neither vocabulary currently has.**

---

## 1. Vocabulary A — `EvidenceClass`, the UI badge taxonomy

**Location:** `frontend/src/components/publicV2/Claim.tsx:23`

```ts
export type EvidenceClass = 'verified' | 'anonymized' | 'illustrative' | 'pending';
```

Lowercase. Four values. **This is per-artifact data**: it labels one figure, one badge, one
record on screen.

Rendered labels (`Claim.tsx:25-30`):

| Value | Label |
|---|---|
| `verified` | "Verified" |
| `anonymized` | "Anonymized" |
| `illustrative` | "Illustrative demo" |
| `pending` | "Pending approval" |

Glyphs (`Claim.tsx:33-38`): `✔` / `◐` / `◆` / `◷` — deliberately text **plus** glyph, never
colour alone.

**The components that consume it:**

| Export | Line | Behaviour |
|---|---|---|
| `EvidenceBadge` | `Claim.tsx:45` | `({ evidence: EvidenceClass, className? })` → `<span class="cbv2-evidence cbv2-evidence--{evidence}" data-evidence="{evidence}">` glyph + label |
| `SampleBadge` | `Claim.tsx:63` | `<span class="cbv2-sample" data-sample="true">◆ Sample data</span>` |
| `Metric` | `Claim.tsx:139` | `({ value, label, delta?, evidence: EvidenceClass /* REQUIRED, no default */, badgeHidden?, className? })` → `<div class="cbv2-metric" data-metric="true" data-evidence="{evidence}">`. `illustrative` auto-renders a `SampleBadge`, everything else an `EvidenceBadge` (`:156-157`) |
| `CapabilityNotice` | `Claim.tsx:173` | Renders *"In development. This is not available yet, so it is not shown here."* **only** when `claim.capability === 'unbuilt'` |

**`Metric.evidence` is required with no default** (`Claim.tsx:122-125`) precisely so that an
unlabelled figure is a **compile error**, not a review finding. Every Case Study number rendered
publicly must go through `<Metric>`.

**Minor duplication to be aware of:** `frontend/src/config/v2Proof.ts:29-34` re-declares the same
four keys inline as `EvidenceClassDoc` rather than importing `EvidenceClass`. If the union ever
changes, both need editing. `EVIDENCE_CLASSES` at `v2Proof.ts:37` documents each class's
`meaning` and `rule` on the `/proof` page.

---

## 2. Vocabulary B — `VerificationStatus`, the claims-registry governance taxonomy

**Location:** `frontend/src/config/claimsRegistry.ts:26-46`

```ts
export type VerificationStatus =
  /** Evidenced, and the evidence is named in `evidenceSource`. */
  | 'VERIFIED'
  /** Rests on the business owner's direct, first-hand knowledge rather than on a
   *  query anyone can re-run. Publishable, because the owner is a real and
   *  accountable source — but deliberately NOT labelled VERIFIED. */
  | 'OWNER_ATTESTED'
  /** Plausible but unevidenced. Never renders publicly until someone verifies it. */
  | 'NEEDS_VERIFICATION'
  /** Legitimately hypothetical. Renders ONLY with a visible illustrative label. */
  | 'ILLUSTRATIVE'
  /** Unverifiable, misattributed, legally risky, or fabricated. Hard block. */
  | 'DO_NOT_PUBLISH';
```

SCREAMING_SNAKE. Five values. **This governs hand-written marketing sentences**, not data records.

It carries a **second, orthogonal gate** — `CapabilityStatus` (`claimsRegistry.ts:48-56`):

```ts
export type CapabilityStatus = 'live' | 'partial' | 'unbuilt' | 'n/a';
```

The two are deliberately independent. `claimsRegistry.ts:14-20` states why:

> *"a perfectly true sentence about an unbuilt feature is still a false impression."*

The record shape (`claimsRegistry.ts:58-77`) is the field discipline a Case Study record should
mirror:

```ts
export interface Claim {
  readonly key: string;                        // stable; never rename, retire instead
  readonly publicWording: string;              // the exact words that may appear publicly
  readonly verification: VerificationStatus;
  readonly capability: CapabilityStatus;
  readonly evidenceSource: string;             // where the proof lives — REQUIRED for VERIFIED
  readonly owner: string;                      // person accountable
  readonly lastVerifiedAt: string;             // ISO date
  readonly approvedRoutes: readonly string[];  // ['*'] = anywhere public
  readonly requiresSampleLabel: boolean;
  readonly note?: string;
}
```

Enforcement (`claimsRegistry.ts:641-713`):

- `PUBLISHABLE_VERIFICATION` (`:655-659`) = `['VERIFIED', 'OWNER_ATTESTED', 'ILLUSTRATIVE']`
- `isPublishable(claim)` (`:662-666`) additionally requires
  `capability !== 'unbuilt' && approvedRoutes.length > 0`
- `publicClaim(key, route?)` (`:679`) returns `string | null`; dev-mode `console.warn` explains
  the block, production fails silently
- `<Claim>` (`Claim.tsx:98`) **renders nothing** when a claim may not ship, and `Claim.tsx:92-97`
  is explicit: *"There is deliberately no way to pass raw copy through this component."*

---

## 3. Which one Case Study OS adopts, and why

### Decision

**Per-record Case Study data adopts Vocabulary A — the lowercase `EvidenceClass` union.**

```ts
verification_class: 'verified' | 'anonymized' | 'illustrative' | 'pending'
```

This is exactly what spec §14 prescribes ("Keep the current public evidence classes") and it is
what `case_study_metrics.verification_class` and `case_study_evidence.verification_class` carry
(spec §7.6, §7.7).

### Why A and not B

| Reason | Detail |
|---|---|
| **It is the union the renderer already requires.** | `Metric` takes `evidence: EvidenceClass` as a required prop (`Claim.tsx:139`). Adopting B would mean a translation layer at every render site — the exact place a mapping bug becomes a public mislabel. |
| **B has no `pending` and no `anonymized`.** | Both are first-class Case Study states. `anonymized` is how a consented-but-unnamed client is represented (spec §16); `pending` is what the publish gate blocks on (spec §15). B's nearest equivalents (`NEEDS_VERIFICATION`, and nothing) are not the same concepts. |
| **A is about a record; B is about a sentence.** | A `Claim` has `publicWording` — the exact words that may appear. A Case Study metric has a `value_display`, a `baseline`, a `sample`, a `methodology`. Different shape, different lifecycle, different owner. |
| **B's `OWNER_ATTESTED` has no Case Study analogue at the class level.** | Owner attestation is a *method*, not a *class*. In the Case Study model it is expressed as `verification_class: 'verified'` + `verification_method: 'internal'` or `'self'` — which is more informative, not less. |
| **A already has data attributes tests assert on.** | `data-evidence="{class}"` and `data-metric="true"` (`Claim.tsx`) are what `ProofV2.test.tsx:131`/`:144` assert against. New tests inherit that idiom for free. |

### Where B still applies

Vocabulary B continues to govern **marketing copy about the Case Study system itself**. Any
sentence on `/proof`, `/platform` or `/stories` that makes a claim about what the Case Study OS
*is* or *does* must be a registry claim rendered through `<Claim>` — not free text. Two live
entries already sit in that space (§5 and §6 below).

**The two vocabularies must never be mapped onto each other in code.** They coexist; they do not
convert. A helper named anything like `toVerificationStatus(evidenceClass)` is a design smell and
should not exist.

---

## 4. The new orthogonal axis — `verification_method`

Spec §14 adds an axis that neither existing vocabulary has:

```ts
verification_method: 'client' | 'repo' | 'platform' | 'internal' | 'self' | 'manual'
```

**Class answers *how much may be shown*. Method answers *who or what did the verifying*.** They
are independent, exactly as `VerificationStatus` and `CapabilityStatus` are independent in the
claims registry — and for the same underlying reason: one dimension cannot carry two questions
without losing information.

The spec's own examples:

```text
class: verified     method: repo
class: anonymized   method: client
```

The full matrix is meaningful, not sparse:

| class ↓ / method → | `client` | `repo` | `platform` | `internal` | `self` | `manual` |
|---|---|---|---|---|---|---|
| `verified` | client confirmed and named | commit/CI/test evidence in a repo we read | platform records (EvidenceRecord, student_tasks) | our own measurement, documented | — (self-report is not `verified`) | a human checked and signed off |
| `anonymized` | client confirmed, identity withheld | repo evidence, repo identity withheld | platform records, learner identity withheld | internal measurement, party withheld | — | reviewed and identity withheld |
| `illustrative` | worked example in a client shape | worked example over a sample repo | — | — | — | hand-authored example |
| `pending` | awaiting client confirmation | awaiting a sync | awaiting a platform read | awaiting internal measurement | self-reported, unverified | awaiting review |

Two rules fall straight out of the matrix:

1. **`method: 'self'` may never carry `class: 'verified'`.** A self-report is `pending` until
   something or someone else confirms it. This is the same distinction `student_tasks` already
   draws between `status = 'complete'` (the student's claim) and `verified_at` (the platform's
   confirmation) — `backend/src/db/ensureSbpSchema.ts:62-95`.
2. **A `verified` class requires a non-null evidence pointer.** Mirrors the registry rule that
   `evidenceSource` is required for `VERIFIED` (`claimsRegistry.ts:224`). In the Case Study model
   that is `case_study_metrics.evidence_id` or a `case_study_evidence` row.

### Why the method axis is worth the extra column

Without it, `verified` is a single undifferentiated word covering "the client signed a letter"
and "our test suite passes". Those carry very different weight to an enterprise reader, and
collapsing them is precisely the kind of flattening that produced the fabricated case studies
this build is replacing. The public surface can then say *Verified · client-confirmed* or
*Verified · repository evidence* and mean two different, true things.

---

## 5. What this build unblocks — `surface.proof.room`

`frontend/src/config/claimsRegistry.ts:585`:

```ts
{
  key: 'surface.proof.room',
  publicWording: 'Every proof record carries its evidence class and the evidence behind it.',
  verification: 'VERIFIED',
  capability: 'unbuilt',
  evidenceSource: 'No evidence_class taxonomy in backend/src.',
  owner: 'Eng',
  lastVerifiedAt: '2026-08-07',
  approvedRoutes: ['*'],
  requiresSampleLabel: true,
}
```

Read the two gates carefully. The claim is **`VERIFIED`** — the sentence is true as an
architectural intention — but **`capability: 'unbuilt'`**, because the thing it describes does
not exist. `isPublishable()` (`:662-666`) therefore returns `false`, and `<Claim>` renders
nothing. Instead, `/proof` renders the future-tense roadmap sentence `PLANNED_PROOF_ROOM`
(`frontend/src/config/v2Proof.ts:133`) at `ProofV2.tsx:170`, followed by
`<CapabilityNotice claimKey="surface.proof.room" />` at `:172`.

**`evidenceSource` names exactly what this build ships:** *"No evidence_class taxonomy in
backend/src."* Once `case_study_metrics.verification_class` and
`case_study_evidence.verification_class` exist and are populated, that sentence is false and the
claim becomes renderable.

### The registry edit this build owes

When the store ships and Enterprise publication is live:

1. Flip `capability` from `'unbuilt'` to `'live'` (or `'partial'`, if only metrics carry a class
   at first — `'partial'` is an honest intermediate and is a legitimate value).
2. Rewrite `evidenceSource` to name the real evidence, e.g.
   `'case_study_metrics.verification_class + case_study_evidence.verification_class; backend/src/db/ensureCaseStudySchema.ts'`.
3. Update `lastVerifiedAt`.
4. **Do not rename the key.** `claimsRegistry.ts:58-77` — keys are stable; retire, never rename.

### Two side effects to expect, both correct

- **The derived counts on `/proof` will move.** `ProofV2.tsx:28-36` computes
  `forCapability = blockedClaims().filter(c => c.capability === 'unbuilt').length` at render
  time. Removing one `unbuilt` claim decrements it. `ProofV2.test.tsx:72-107` asserts these
  counts track the registry rather than being typed in, so the test keeps passing — that is the
  mechanism working, not a regression.
- **`PLANNED_PROOF_ROOM` becomes stale.** `v2Proof.ts:133` is a future-tense sentence rendered at
  `ProofV2.tsx:169-172`. Once the capability is `live`, the `CapabilityNotice` stops rendering
  and the roadmap prose describes a shipped thing in the future tense. Revisit it in the same PR.

---

## 6. What this build must clean up — `casestudy.fabricated`

`frontend/src/config/claimsRegistry.ts:598`:

```ts
{
  key: 'casestudy.fabricated',
  publicWording: '(three case studies with invented client quotations)',
  verification: 'DO_NOT_PUBLISH',
  capability: 'n/a',
  evidenceSource:
    'CaseStudiesPage.tsx — the file header concedes entries are illustrative, but nothing ' +
    'on the rendered page says so. Still listed in sitemap.xml and still ingested by ' +
    'admissionsKnowledgeSyncAgent.ts:25 as fact.',
  owner: 'Ali',
  lastVerifiedAt: '2026-08-07',
  approvedRoutes: [],
  requiresSampleLabel: false,
  note: 'Delete the component, purge the sitemap entry, remove it from the agent knowledge source.',
}
```

`DO_NOT_PUBLISH` with `approvedRoutes: []` — a double hard block. **The `note` at `:610` is a
prescription, not a suggestion.** Three actions:

| # | Prescribed action | Current state in this worktree |
|---|---|---|
| 1 | **Delete the component** | `frontend/src/pages/CaseStudiesPage.tsx` still exists (35 KB) and still contains the fabricated Priya Nair / Marcus Bell studies. No route renders it, but `frontend/src/routes/publicRoutes.tsx:8` still imports it — dead code behind an unused import. **Delete both.** |
| 2 | **Purge the sitemap entry** | `frontend/public/sitemap.xml` — verify no `/case-studies` `<url>` block survives. The header policy at `:2-14` already excludes redirect sources, so this may already be satisfied; confirm rather than assume. |
| 3 | **Remove it from the agent knowledge source** | `evidenceSource` names `admissionsKnowledgeSyncAgent.ts:25` — the real path is `backend/src/services/agents/admissions/admissionsKnowledgeSyncAgent.ts:25`, verified to contain `{ route: '/case-studies', file: 'CaseStudiesPage.tsx' }` in its route→file ingest table — as **still ingesting the fabricated studies as fact**. This is the one that actually matters — a deleted page that an agent still quotes is worse than the page, because there is no longer any surface where a reader can see the disclaimer. |

Only after all three land may the claim be **retired** (not deleted, not renamed — `:58-77`).

### The rule this cleanup exists to protect

`frontend/src/config/v2Proof.ts:18-24` states it: **withdrawn claims are described by category
and reason, never restated.** `ProofV2.test.tsx:29-35` enforces it mechanically by iterating
`blockedClaims()` and asserting no `publicWording` string appears anywhere in the rendered text.

**This constrains the new `/stories` page too.** A Case Study index must never render a blocked
claim's wording — including in an empty state, a filter chip, or an example. Adding `StoriesV2`
to the `PAGES` array in `linkIntegrity.test.tsx:58-70` and writing the missing
`StoriesV2.test.tsx` with the `ProofV2.test.tsx` banned-string pattern (`:37-57`) is how that
gets guarded.

Related registry entry: `testimonial.undisclosed` (`claimsRegistry.ts:613`), `DO_NOT_PUBLISH` for
dollar figures published without consent. Same lesson, different surface. Also
`surface.storybuild` (`:522`), `VERIFIED`/`live`, whose `note` at `:540-545` lists barred
rewordings — a reminder that even a publishable claim has an exact permitted form.

---

## 7. The publish gate

Spec §15. The gate **fails closed** and returns actionable, field-naming errors.

### Conditions

| # | Condition | Data that answers it |
|---|---|---|
| 1 | Case Study `status` is `approved` | `case_studies.status` |
| 2 | An approved snapshot exists | `case_study_snapshots.status = 'approved'` with `approved_by` + `approved_at` |
| 3 | The Enterprise publication row is valid | `case_study_publications` with `surface_key = 'enterprise'`, unique on `(case_study_id, surface_key)` |
| 4 | **No visible metric is `pending`** | every `case_study_metrics` row where `publishable = true` has `verification_class != 'pending'` |
| 5 | Organization identity consent is satisfied | `organization_is_anonymized` + the recorded consent state agree with what would render |
| 6 | Builder identity consent is satisfied | the recorded `named \| role_only \| anonymous` state |
| 7 | Private repos are not exposed | for every rendered repo: repo is public **AND** `allow_public_repo_link = true` **AND** the snapshot approves it |
| 8 | Required proof metadata exists | every `verified` metric has an evidence pointer (§4 rule 2) |
| 9 | **No AI-generated quote exists** | provenance tier 7 must not appear on any quoted field |
| 10 | No unverified production / ROI / outcome claim exists | provenance + `verification_class` on every such field |

### Error shape

Spec §15's own example, and the shape to implement:

```text
Cannot publish:
- headline metric "41% fewer stockouts" has no verified evidence
- organization name is visible but naming consent is not approved
```

Each line names the **specific field**, not the rule. This matches the repo's existing house
standard, stated in `docs/REPO_CONNECT_CONTRACT.md`: *"There is no generic 400 in this flow —
every rejection carries an `error_class` and a sentence saying what to do."*

### Default visibility rule

Spec §14: **the production Case Study list hides `pending` and `illustrative` by default.**

This is a *list filter default*, not a permission. An `illustrative` record can still be
addressable and rendered with its `SampleBadge` — `Metric` already auto-renders one for
`illustrative` (`Claim.tsx:156-157`). What must never happen is an `illustrative` record sitting
unlabelled among `verified` ones in the default view. That is precisely the shape of the
`casestudy.fabricated` failure: the file header conceded the entries were illustrative, but
**nothing on the rendered page said so**.

### Fixture safety

Spec §45 permits the claims-triage design/content shape as an **illustrative test fixture in
development and Playwright only**. Two guards:

- It must never become production verified content.
- **Production with zero published records shows a truthful zero-data state**, not fake case
  studies. That empty state is a first-class deliverable (spec §22), and it must not restate any
  blocked claim's wording (§6 above).

---

## 8. Rendering rules for the public surface

| Rule | Mechanism | Source |
|---|---|---|
| Every public figure carries a class | `<Metric evidence={...}>` — required prop, no default | `Claim.tsx:122-125`, `:139` |
| Never colour alone | text label + glyph on every badge | `Claim.tsx:25-38` |
| `illustrative` reads as a sample | `Metric` auto-renders `SampleBadge` | `Claim.tsx:156-157` |
| Unbuilt capability is described, never depicted | `<CapabilityNotice>` | `Claim.tsx:173` |
| Blocked wording is never restated | `blockedClaims()` + the `ProofV2.test.tsx:29-35` assertion pattern | `v2Proof.ts:18-24` |
| Badges are assertable | `data-evidence="{class}"`, `data-metric="true"` | `ProofV2.test.tsx:131`, `:144` |

**The single most important line change on the existing page:**
`frontend/src/pages/publicV2/StoriesV2.tsx:52` is literally

```tsx
<EvidenceBadge evidence="illustrative" />
```

The string is typed into the JSX. It is **not** read from the story object — every card gets the
same badge regardless of data, and a verified story cannot be expressed today without editing
that line. It must become `evidence={story.verification_class}`. The companion change is
`StoriesV2.tsx:71-73`, the *"To publish this for real: …"* footer, which must become conditional:
a `verified` Case Study has no remaining evidence gap to declare, and printing one would be
nonsense.

There is a matching inconsistency in the data file worth fixing while in the area:
`frontend/src/config/v2Stories.ts:6` claims in a header comment that *"every entry carries
`evidence: 'illustrative'`"*, but the `Story` interface (`:25-38`) has **no `evidence` field at
all**. The comment describes an intent the data shape never implemented.

---

## 9. Summary of decisions

1. **`verification_class` uses Vocabulary A** — the lowercase `EvidenceClass` union from
   `Claim.tsx:23`. Four values. No translation layer to Vocabulary B, ever.
2. **`verification_method` is a new, orthogonal axis** — `client | repo | platform | internal |
   self | manual`. Class = how much may be shown. Method = who verified. `self` never pairs with
   `verified`; `verified` always carries an evidence pointer.
3. **`VerificationStatus` / `CapabilityStatus` remain the governance layer for marketing
   sentences** about the Case Study system, rendered through `<Claim>`.
4. **`surface.proof.room` (`claimsRegistry.ts:585`) is the claim this build unblocks.** Flip
   `capability` to `live`/`partial`, rewrite `evidenceSource`, expect the `/proof` derived counts
   to move, and revisit `PLANNED_PROOF_ROOM`.
5. **`casestudy.fabricated` (`claimsRegistry.ts:598`) carries a three-part prescribed cleanup**
   (`:610`): delete `frontend/src/pages/CaseStudiesPage.tsx` and its unused import at
   `publicRoutes.tsx:8`, confirm the sitemap is clean, and **remove it from
   `backend/src/services/agents/admissions/admissionsKnowledgeSyncAgent.ts:25`**, which still ingests it as fact. Retire the claim only
   after all three.
6. **The publish gate fails closed**, hides `pending` and `illustrative` from the default list,
   and returns errors that name the offending field.
