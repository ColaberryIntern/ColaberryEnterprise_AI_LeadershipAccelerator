# CAREER_EVIDENCE_MAP (Gate 0 / Gate 3)

## The finding that shaped this build

The plan (§8) asks for a Career Evidence Graph: person → claims → evidence, with provenance.
**One already exists.** CAPE's `student_skill_evidence` ledger is append-only, idempotency-keyed,
insert-only, and fully recomputed into `student_architecture_skill` on every read.

Building a parallel graph would have violated plan §8 ("do not create duplicate XP or duplicate
raw evidence") and §71 ("skills have no provenance" / duplicated truth stores). So Gate 3 is
implemented as **adapters over existing sources**, not new storage.

## Evidence level derivation

The plan's three levels (§9) are derived from CAPE bands at read time. No new column stores them.

| Plan level | Derivation | Public label discipline |
|---|---|---|
| `resume` | Only `claim`-band evidence present | Never rendered as Colaberry-verified (plan §9) |
| `colaberry_verified` | Any `knowledge` / `application` / `judgment` band evidence | The platform stands behind this |
| `delivery_verified` | Reserved. **No source on main** — see `REFACTORED_INTEGRATION_MAP.md` | Resolves to zero rows today |

Implemented in `careerEvidenceAdapters.ts::deriveEvidenceLevel()`, which reads the per-band
scores already returned by `capeProficiencyService.getLearnerSkillProfile()`.

## Adapter inventory (Gate 3)

Each adapter is read-only and returns a typed projection. None writes.

| Adapter | Reads | Produces |
|---|---|---|
| `identityAdapter` | `Enrollment`, `OnboardingProfile`, `portalSettingsService.getSettings` | name, email, title, company, LinkedIn, avatar, resume presence |
| `skillAdapter` | `capeProficiencyService.getLearnerSkillProfile` | capability list with per-band provenance + evidence level |
| `artifactAdapter` | `PortfolioArtifact` (`runtime_portfolio_artifacts`) | build artifacts w/ kind, competencies, created_at |
| `projectAdapter` | `Project` | person's projects (all of them — not one) |
| `githubAdapter` | `GitHubConnection`, `StudentGithubActivity` | connected repos + activity aggregate |
| `deliveryAdapter` | — | **empty by design**; documented deferral |

## Contribution awareness (plan §16)

The plan forbids full project credit for mere team membership, and forbids choosing
"Led / Architected / Built / Contributed to" stylistically.

**What is true today:** no team-composition or per-member contribution data exists on main.
There is no `team_size`, no role field, no per-member commit attribution.

**Therefore this build does not emit any of those verbs.** The Studio labels a project by what
the data actually supports — artifact counts, competencies evidenced, repo presence — and
nothing more. Inventing "Led" from an empty team model is exactly the failure mode §16 and §57
exist to prevent. When a contribution model lands, `projectAdapter` is the one place that
changes.

## Idempotency (plan §61)

This increment writes nothing, so the idempotency requirements are satisfied vacuously for
five of the six listed cases. The one that still applies — "same artifact event → one career
evidence link" — is already guaranteed upstream by `student_skill_evidence.idempotency_key`
(unique) and `capeEvidenceLedgerService`'s insert-only `findOrCreate`.
