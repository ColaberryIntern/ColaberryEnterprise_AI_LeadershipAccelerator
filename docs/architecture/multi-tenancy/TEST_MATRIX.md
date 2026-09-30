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

**Execution status: EXECUTED 2026-08-24 against the dev stack — 11/11 checks pass,
exit 0.** Command: `BASE_URL=http://95.216.199.47:9999 node
tests/systemV2/ecosystemIsolation.e2e.js`.

An earlier revision of this document claimed the specs were "authored" when no such file
existed. That was corrected by writing them. This revision closes the second half of the
same gap: written is not executed, and the first execution found three real defects that
196 passing unit tests could not:

1. **`cpn` and `ai-flotation` lead sources did not exist.** `ecosystemSeedData.ts`
   declares `lead_source_slugs: ['cpn']`, but that field only drives the backfill — it
   never creates the source row, and no seeder did. Both brands returned "Unknown or
   inactive source" and could not capture a lead at all. Added to `seedLeadSources.ts`.
2. **The spec posted to `/api/ingest`, which is not a route.** The real endpoint is
   `/api/leads/ingest`. The resulting 401s were the catch-all `/api/*` guard, not an
   auth defect — a false alarm that would have been read as one.
3. **The spoof check asserted the wrong thing.** It searched the entire response for the
   claimed `tenant_id`, which legitimately appears in `normalized.metadata` because the
   raw payload is captured verbatim. It failed while the system was behaving correctly.
   Now it excludes the verbatim echo and asserts the value is never *adopted*.

**Prerequisites are three steps, not two.** `seedEcosystem` → `seedLeadSources` →
`backfillTenancy`. The third is easy to miss and produces the most confusing failure: the
ingest path writes a brand relationship only when the SOURCE carries `tenant_id` and
`brand_id`, so an unclassified source still accepts the post and still creates the lead,
then silently logs `tenant_context_unresolved` and skips the relationship.

**Verified in the database, not just by exit code** — a green run is only evidence if the
rows exist. One canonical lead `24113` carrying **two** brand relationships:

| tenant / brand | consent | relationship |
|---|---|---|
| `cpn / cpn` | true | `scholarship_interest` |
| `ai-flotation / ai-flotation` | true | `workflow_intake` |

and `select count(*) from lead_tenant_contexts where tenant_id::text like '00000000%'`
returns **0** — the hostile body's claimed tenant was stored nowhere.

The spec is built so it cannot report a false pass:

- **exit 2** with an explicit message if the target is unreachable or a required lead
  source is not seeded — never a green run over checks that never executed;
- exit 0 only when every check ran and passed; exit 1 on a real failure.

Verified by pointing it at a dead port: it aborted cleanly rather than throwing a stack
trace or reporting success.

Running it against **production** is still deliberately **not** done: it writes real rows,
and the default `BASE_URL` is production precisely so that an accidental bare run is the
thing you notice. Dev is the correct target (`accelerator_dev1`, a separate database from
`accelerator_prod` despite both stacks resolving the hostname `postgres` to the same
container).

## Idempotency assertions (plan §55, root `CLAUDE.md`)

Every seed and backfill has a test that **runs it twice** and asserts the second run reports
zero `updated` and zero new rows. A seed that is only tested once is not tested.

## Gate exit criteria

A gate is complete when: its unit tests pass, `tsc --noEmit` is clean, the seven baseline
suites still pass, and its PROGRESS.md entry carries concrete verification evidence.
