# Test Matrix

**Session:** CC-20260821-m6t4 · **Base:** `bb152ded`

Follows root `CLAUDE.md`: ~70% unit, ~20% integration, ~10% E2E, with test investment scaled
to blast radius.

---

## Risk tiering

| Surface | Blast radius | Reversible? | Required coverage |
|---|---|---|---|
| Tenant authorization / isolation | **High** | no (data leak is permanent) | unit + integration + negative IDOR |
| Sender profile resolution | **High** | no (a wrong-brand send cannot be unsent) | unit + integration + negative cross-brand |
| Lead context creation | High | yes | unit + integration + idempotency |
| Tracking context stamping | Medium | yes | unit + fail-soft |
| Domain/host resolution | Medium | yes | unit + cache behavior |
| Journey reporting | Low | yes | unit |
| Admin ecosystem UI | Low | yes | typecheck |

## Unit tests

| Test | Asserts |
|---|---|
| `tenantResolver.test` | slug → tenant; unknown slug → null, never throw |
| `brandDomainResolver.test` | hostname+purpose → brand/tenant; legacy host-map fallback fires and logs; cache hit does not re-query; TTL expiry re-queries |
| `leadContextService.test` | creates context when absent; reuses when present; **never overwrites first-touch**; updates last-touch; second identical call changes nothing |
| `senderProfileResolver.test` | prefers `sender_profile_id`; falls back to brand default with deprecation log; falls back to legacy JSONB with deprecation log; **cross-brand profile rejected before send** |
| `senderPreflight.test` | blocks live send on unverified domain / inactive profile / missing unsubscribe / missing physical address; permits test-mode |
| `communicationPreference.test` | per-brand allow/deny; global suppression overrides brand allow |
| `journeyLinkService.test` | signs and verifies; rejects expired; rejects tampered payload; **contains no email** |
| `trackingContextResolver.test` | resolves from `site_slug`; falls back to host; unknown → null context and event still recorded |
| `tenantAuthorization.test` | membership grants; absent membership denies; platform superadmin crosses; **role string never compared inline** |

## Integration tests

| Test | Asserts |
|---|---|
| lead ingestion → lead context | `/api/ingest` creates `Lead` + `LeadTenantContext` with correct tenant/brand from source |
| visitor → identity → backfill | `resolveIdentity` links visitor, backfills session + page-event `lead_id`, preserves tenant/brand |
| same lead → two brands | second brand's form does **not** duplicate the canonical `Lead`; creates a second context; first context untouched |
| campaign → sender profile | live send resolves profile, passes preflight, attaches Mandrill metadata |
| campaign click → session → conversion | `campaign_id` survives from click through session to `LeadTenantContext` |
| organization → membership → tenant context | org creation stamps tenant; member links platform identity |
| Mandrill webhook → correct tenant | webhook metadata restores tenant/brand/campaign/lead before writing activity |

## Negative / isolation tests (plan §19.1, §53)

Every one of these must return **404** (cross-tenant resource) or **403** (unauthorized tenant
scope), with **no foreign tenant data in the response body**:

| Attempt | Expected |
|---|---|
| CPN admin GET AI Flotation campaign by UUID | 404 |
| AI Flotation user GET CPN lead context | 404 |
| Enterprise manager GET another org's private member data | 404 |
| CPN admin lists campaigns | only CPN campaigns, count excludes others |
| CPN campaign + AI Flotation sender profile | rejected in resolver, `ContractViolation`, **no provider call** |
| public track event with `tenant_id` in body | body value ignored; server-resolved value used |
| public ingest with `brand_id` in body | body value ignored |
| expired journey token | rejected, no context association |
| tampered journey token | rejected, signature failure logged |

The "public body carries `tenant_id`" pair is the most important test in this matrix. It is the
difference between a tenancy model and tenancy-shaped decoration.

## E2E (Playwright, `/tests/systemV2`)

| Spec | Covers |
|---|---|
| CPN skeleton journey | pageview → CTA → form start → submit → lead + context + journey visible |
| AI Flotation skeleton journey | workflow intake end to end |
| Refactored skeleton journey | platform interest intake |
| cross-brand journey | one person, two brands, one canonical lead |
| admin context switch | only authorized tenants appear in the switcher |
| tenant isolation | UI-level confirmation of the negative tests above |

**Execution status:** `tests/systemV2/ecosystemIsolation.e2e.js` is **written and
committed**. It is **not executed** in this environment, which has no running stack and no
staging credentials.

An earlier revision of this document claimed the specs were "authored" when no such file
existed. That was false when written, and it is corrected by writing them rather than by
softening the wording — a test matrix that overstates its own coverage is worse than one
that admits a gap.

The spec is built so it cannot report a false pass:

- **exit 2** with an explicit message if the target is unreachable or a required lead
  source is not seeded — never a green run over checks that never executed;
- exit 0 only when every check ran and passed; exit 1 on a real failure.

Verified locally by pointing it at a dead port: it aborted cleanly rather than throwing a
stack trace or reporting success.

Running it against production is deliberately **not** done. The tenancy code is merged but
not deployed, so a run would both write test rows into the live CRM and fail on behaviour
that is not live yet.

## Idempotency assertions (plan §55, root `CLAUDE.md`)

Every seed and backfill has a test that **runs it twice** and asserts the second run reports
zero `updated` and zero new rows. A seed that is only tested once is not tested.

## Gate exit criteria

A gate is complete when: its unit tests pass, `tsc --noEmit` is clean, the seven baseline
suites still pass, and its PROGRESS.md entry carries concrete verification evidence.
