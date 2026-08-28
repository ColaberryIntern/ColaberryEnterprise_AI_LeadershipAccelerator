# `case-study.json` — the optional repository manifest

**Status:** live for JSON. YAML deferred (see [Why YAML is not supported yet](#why-yaml-is-not-supported-yet)).
**Machine-readable schema:** [`case-study.schema.json`](./case-study.schema.json) (JSON Schema draft 2020-12).
**Implementation:** `backend/src/services/caseStudy/caseStudyManifestReader.ts`.
**Spec:** Case Study OS build plan §8 (manifest), §9 (source priority), §29 (failure classes), §37 (security).

A repository can describe its own Case Study by committing a `case-study.json` at its
root. It is entirely optional. Every part of the Case Study OS works without one — a
repository with no manifest is analysed by deterministic inference exactly as before,
and so is a repository whose manifest is missing, empty, unreadable or unsupported.

---

## Two things a manifest can never do

> ### 1. It cannot verify an outcome
>
> Every entry under `outcomes` is recorded with **`verification_class: 'pending'`**,
> always, no matter what the file says. A repository author can *state* that triage time
> fell from 40 minutes to 12; they cannot *certify* it. `verification_method: "client"`
> does not change this — that field records **who the author says established the
> figure**, which is a claim about provenance, not evidence of it. A human verifier must
> approve the metric before it can be published, and only that approval moves the class
> to `verified`. This is enforced in the type system, not by convention:
> `CaseStudyManifestOutcome.verificationClass` has the literal type `'pending'`, so no
> code path in the reader can produce anything else.

> ### 2. It cannot publish anything
>
> `publication.requested_surfaces` is a **request, never an authorisation**. The reader
> returns `authorizesPublication: false` on every successfully parsed manifest — again a
> literal type, so `true` is unrepresentable. Publication happens only through the publish
> gate, which checks consent, evidence and surface eligibility independently. In Phase 1
> only the `enterprise` surface is publishable at all; requesting `training`,
> `ai-flotation` or `refactored` is recorded and refused.

A third rule follows from the first two: **a manifest is authoritative only for the
fields it declares.** Undeclared fields come back absent, never as defaults. The reader
applies no `.default()` anywhere, so a value you did not write cannot quietly outrank
real evidence extracted from your repository.

"Authoritative" is also relative, not absolute. Spec §9 places a structured repository
manifest at **tier 5** of seven:

1. human-approved Case Study override
2. approved metric / evidence record
3. existing Refactored Project facts
4. existing EvidenceRecord / PortfolioArtifact
5. **structured repo manifest** ← you are here
6. deterministic repository extraction
7. AI-generated draft from extracted facts only

So a declared field beats repository inference and AI drafting. It does not beat a human
override, an approved metric, or platform data.

---

## Worked example

The example from spec §8, converted to JSON. Save as `case-study.json` in the repository
root.

```json
{
  "schema_version": 1,
  "project": {
    "slug": "claims-triage-copilot",
    "title": "Claims triage copilot for first-notice-of-loss"
  },
  "classification": {
    "industry": "Insurance",
    "capabilities": ["rag", "document-ai"],
    "stack": ["Claude", "Python", "FastAPI"],
    "method": "AADM"
  },
  "built_by": {
    "type": "client_team",
    "program": "Enterprise Accelerator"
  },
  "publication": {
    "requested_surfaces": ["enterprise", "training", "ai-flotation"]
  },
  "consent": {
    "organization_named": false,
    "builders_named": false,
    "public_repo_link": false
  },
  "repos": [
    { "role": "primary", "url": "https://github.com/example/claims-triage" }
  ],
  "outcomes": [
    {
      "key": "triage_time",
      "label": "Triage time per claim",
      "value_display": "40 → 12 min",
      "verification_method": "client",
      "evidence_ref": "client-ops-report-2026-06"
    }
  ]
}
```

Reading that file yields `status: 'parsed'`, `authorizesPublication: false`, one outcome
at `verification_class: 'pending'`, and a `declaredFields` list naming exactly these
**twenty** paths — nothing more:

```
schema_version
project                 project.slug           project.title
classification          classification.industry
                        classification.capabilities
                        classification.stack   classification.method
built_by                built_by.type          built_by.program
publication             publication.requested_surfaces
consent                 consent.organization_named
                        consent.builders_named
                        consent.public_repo_link
repos
outcomes
```

Both container paths and their leaves are listed, which is why the count is twenty
rather than the fifteen leaves alone: a reader deciding whether a manifest is
authoritative for `consent` as a whole needs the container to be present in the set,
not merely its children.

That list is pinned by test — see the `parses the spec §8 worked example end to end`
case in `backend/src/services/caseStudy/__tests__/caseStudyManifestReader.test.ts`,
which asserts this exact array element-for-element. It is written out here rather than
summarised as a count so the documentation cannot drift from the behaviour.

---

## Field reference

Nothing is required. `schema_version` is the only field with a fixed value.
"Authoritative" below means "overrides repository inference for this field, if declared".

### Top level

| Field | Type | Authoritative | Bounds | Notes |
|---|---|---|---|---|
| `schema_version` | integer | n/a | must be exactly `1` | Any other value rejects the whole manifest rather than guessing. |
| `project` | object | — | — | See below. |
| `classification` | object | — | — | See below. |
| `built_by` | object | — | — | See below. |
| `publication` | object | **No — a request only** | — | See below. |
| `consent` | object | Restricting only | — | See below. |
| `repos` | array | Yes | max **20** items | Spec §37's repo bound. |
| `outcomes` | array | **Claim only, never verified** | max **50** items | See below. |

### `project`

| Field | Type | Authoritative | Bounds | Notes |
|---|---|---|---|---|
| `project.slug` | string | Suggestion only | 1–120 chars, `^[a-z0-9]+(?:-[a-z0-9]+)*$` | The platform still owns slug allocation and collision handling. |
| `project.title` | string | Yes | 1–200 chars | |

### `classification`

| Field | Type | Authoritative | Bounds | Notes |
|---|---|---|---|---|
| `classification.industry` | string | Yes | 1–120 chars | |
| `classification.capabilities` | string[] | Yes | max 40 items, 1–80 chars each | e.g. `rag`, `document-ai`, `agents`. |
| `classification.stack` | string[] | Yes | max 40 items, 1–80 chars each | Repository inference derives these too; a declared list wins over inference. |
| `classification.method` | string | Yes | 1–80 chars | Delivery method label, e.g. `AADM`. |

### `built_by`

| Field | Type | Authoritative | Bounds | Notes |
|---|---|---|---|---|
| `built_by.type` | enum | Yes | `learner` · `intern` · `client_team` · `colaberry_team` · `ai_flotation_team` · `joint_team` | Same vocabulary as `CaseStudyBuiltByType`. |
| `built_by.program` | string | Yes | 1–160 chars | |

### `publication`

| Field | Type | Authoritative | Bounds | Notes |
|---|---|---|---|---|
| `publication.requested_surfaces` | enum[] | **No** | max 4 items; `enterprise` · `training` · `ai-flotation` · `refactored` | **A request, never an authorisation.** Recorded for an admin to consider. Phase 1 publishes `enterprise` only. |

### `consent`

Consent flags can only ever *remove* permission relative to the platform's own consent
record. Setting `organization_named: true` in a repository does not grant naming rights
the platform does not already hold; setting it `false` withholds them.

| Field | Type | Bounds |
|---|---|---|
| `consent.organization_named` | boolean | — |
| `consent.builders_named` | boolean | — |
| `consent.public_repo_link` | boolean | — |

### `repos[]`

| Field | Type | Required | Bounds | Notes |
|---|---|---|---|---|
| `repos[].url` | string | **yes** | 1–2048 chars | `https://` URL or `owner/repo` shorthand. `http://`, `javascript:`, `file:` and any value containing whitespace, `<`, `>`, `"`, `'`, a backtick or a backslash are rejected. **Never fetched** — see [No URL is ever fetched](#no-url-is-ever-fetched). |
| `repos[].role` | enum | no | `primary` · `frontend` · `backend` · `agents` · `data` · `infra` · `docs` · `evals` · `demo` · `other` | |

### `outcomes[]`

| Field | Type | Required | Bounds | Notes |
|---|---|---|---|---|
| `outcomes[].key` | string | **yes** | 1–80 chars, `^[a-z0-9]+(?:_[a-z0-9]+)*$` | Stable identifier, e.g. `triage_time`. |
| `outcomes[].label` | string | **yes** | 1–160 chars | |
| `outcomes[].value_display` | string | **yes** | 1–120 chars | Renders exactly as written, e.g. `40 → 12 min`. |
| `outcomes[].verification_method` | enum | no | `client` · `repo` · `platform` · `internal` · `self` · `manual` | Who the author says established it. **Does not verify anything.** |
| `outcomes[].evidence_ref` | string | no | 1–200 chars | Free-text pointer for a human verifier. Never fetched. |

There is no `verification_class` field, deliberately. Writing one has no effect: it is
treated as an unknown property, stripped, and reported back to the admin, while the
outcome still lands `pending`.

---

## What the reader returns

`readCaseStudyManifest(filename, contents)` returns a discriminated result and **never
throws for anything a repository can contain**. Only `parsed` contributes facts; every
other status means "continue with repository inference".

| `status` | `reason` values | What the sync does |
|---|---|---|
| `absent` | `no_manifest_file`, `unrecognized_filename`, `empty_manifest` | Repository inference, silently. Normal. |
| `unsupported_format` | `unsupported_manifest_format` | Repository inference. Logged as `partial` with `error_class: UnsupportedManifestFormat`. |
| `malformed` | `manifest_too_large`, `invalid_json`, `not_an_object`, `too_deeply_nested`, `schema_violation` | Repository inference. Logged as `failure` with `error_class: MalformedManifest` (spec §29). The admin sees the classified reason and the failing field paths. |
| `parsed` | — | Manifest facts apply, for `declaredFields` only. |

A `parsed` result also carries:

- **`declaredFields`** — the wire (snake_case) paths the file actually declared, e.g.
  `["project", "project.title", "outcomes"]`. This set *is* the manifest's authority.
- **`unknownFields`** — properties that were stripped, e.g. `["project.tagline"]`. Useful
  for spotting a typo (`outcome` instead of `outcomes`) that would otherwise be silent.
- **`authorizesPublication: false`** — always.

An empty file is reported as `absent`, not `malformed`: zero bytes declares zero fields,
which is indistinguishable from having no manifest. `{}` is different — it parses, and
declares nothing.

`null` is not a declaration. `{"project": {"slug": null}}` declares `project` but not
`project.slug`, so the slug still comes from repository inference.

---

## Bounds

A hostile `case-study.json` must not be able to exhaust memory or CPU. Every bound is
checked before the value is used.

| Bound | Value | Constant |
|---|---|---|
| Whole file | 64 KiB (measured in UTF-8 bytes, before parsing) | `MAX_MANIFEST_BYTES` |
| Nesting depth | 8 levels | `MAX_MANIFEST_DEPTH` |
| `repos` | 20 | `MAX_MANIFEST_REPOS` (spec §37) |
| `outcomes` | 50 | `MAX_MANIFEST_OUTCOMES` |
| `classification.capabilities`, `classification.stack` | 40 items each | `MAX_MANIFEST_LIST_ITEMS` |
| Reported issues / unknown fields | 25 each | internal |

Per-string maximums are in the field tables above. Strings are trimmed before their
length is checked, and a field that trims to empty is rejected rather than stored as `""`
— the published JSON Schema cannot express trimming, so the reader is authoritative there.

`__proto__`, `constructor` and `prototype` keys are dropped during normalisation.
`JSON.parse` makes `__proto__` an own enumerable property, so this is a real prototype
pollution vector rather than a theoretical one.

---

## No URL is ever fetched

Spec §37: *"no arbitrary URL fetch from manifests"*. The reader satisfies this
structurally rather than by policy — **it has no fetch capability at all**. It imports
exactly two modules, `zod` and `backend/src/types/caseStudy.ts` (itself a leaf type module
that imports nothing). There is no HTTP client, no `fetch`, no Octokit, no `child_process`
in its import graph, so there is no vector to close. `caseStudyManifestReader.test.ts`
asserts the import list is exactly those two, and separately asserts that reading a
manifest full of URLs — including an AWS metadata-service redirect — calls `fetch` zero
times.

The same purity means the reader imports no model, no Sequelize and no database config.
It cannot read or write publication state even by accident, and its tests run with no
Postgres.

---

## Why YAML is not supported yet

Spec §8 recognises three filenames, in this precedence order:

```text
case-study.yml
case-study.yaml
case-study.json
```

All three are **recognised**. Only `case-study.json` is **parsed**. A `.yml` or `.yaml`
manifest returns `status: 'unsupported_format'`, `reason: 'unsupported_manifest_format'`
— a clean, logged, documented outcome. It never throws, never blocks, and never degrades
the sync; the repository is analysed by inference exactly as if it had no manifest.

The reason is a governance boundary, not an oversight:

- **No approved YAML parser is a declared dependency.** `grep -i yaml backend/package.json`
  returns nothing, and a test asserts the same thing so this document cannot go stale.
- **Adding a dependency is a DRI decision.** Root `CLAUDE.md`: *"New dependencies require
  a deliberate add. Drive-by `npm install` is not allowed."*
- **Hand-writing a parser is explicitly forbidden.** Spec §8: *"Do not hand-write a
  general YAML parser."* It is also a bad idea — YAML's anchors, aliases and merge keys
  are a well-known denial-of-service and deserialisation surface, and a partial
  implementation would accept files it then misreads.

So YAML is a **bounded deferred adapter**: when a YAML dependency is approved, the only
change is to swap the parse step behind `PARSEABLE_MANIFEST_FILENAME`. Nothing else in
the reader, the schema or the caller changes.

Two consequences worth knowing:

1. A `.yml` file whose bytes happen to be valid JSON is still `unsupported_format`. YAML
   is a JSON superset, so it *would* parse — reading it anyway would mean the platform
   silently chose a file the author did not designate as the manifest.
2. If a repository ships **both** `case-study.yml` and `case-study.json`, precedence
   selects the `.yml`, and the read is `unsupported_format`. The `.json` is not used as a
   fallback, for the same reason. **Today, ship JSON only.**

---

## Failure-first design

The four questions root `CLAUDE.md` requires every shipped system to answer in writing:

1. **What happens if this fails?** Nothing is blocked and nothing is destroyed. Every
   expected condition — absent, unrecognised, empty, oversized, invalid, unsupported — is
   a value the caller switches on, not an exception. The sync continues on repository
   inference. Exceptions are reserved for programmer error: passing a non-string throws
   `TypeError`, because that is a bug in the caller, not a property of the repository.
2. **Will it retry?** No, and it must not. There is no I/O to retry. The reader is a pure
   function of `(filename, contents)`: identical bytes always produce an identical result,
   which is what lets the snapshot content hash stay stable across syncs.
3. **Recovery path if retries are exhausted?** Not applicable — instead, the classified
   `reason` plus the failing field paths surface to the admin, who fixes the file in the
   repository. There is no queue, no dead letter and no side effect to unwind, because the
   reader has no side effects.
4. **What is handled, and what is not?** Handled: absent file, unrecognised filename,
   empty file, oversized file, invalid JSON, non-object JSON, hostile nesting depth,
   `__proto__` pollution, over-long arrays and strings, out-of-vocabulary enum values,
   unknown keys, nulls, unsafe URL schemes, and a manifest attempting to declare itself
   verified or published. Not handled, deliberately: YAML syntax (above), and fetching the
   file at all — retrieving repository content belongs to the analyzer, not here.

## Logging and privacy

The reader emits one structured JSON line per read, to stdout, in the shape the rest of
the backend uses (`timestamp`, `level`, `service`, `event`, `correlation_id`, `outcome`,
plus context). It carries **shape only**: filename, byte count, declared/unknown field
counts, repo and outcome counts, `error_class`, `reason`, and failing field paths with
their issue codes.

Manifest contents are **never logged** — not the body, not a fragment, and not a parser
message. Node's `JSON.parse` error text quotes the offending source, so it is discarded
and replaced with a byte offset computed from it (`invalid JSON at byte 42`). Zod's
validation messages name types and bounds rather than received values; they are returned
to the authenticated admin caller, who is already authorised to read the repository, but
they are still kept out of the log line.
