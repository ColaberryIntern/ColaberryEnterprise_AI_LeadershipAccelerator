# Security Threat Model — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

§100 lists the boundaries to preserve and the things never to allow; §152 turns them into
stop conditions. This maps each to the control that exists today, so the build extends
controls rather than inventing them.

## Boundaries and their existing controls

| Boundary | Control | State |
|---|---|---|
| Tenant-first authorization | `modules/tenancy/tenantAuthorization.ts`, `tenantAccessGuards.ts`, `tenantAccessAudit.ts` | EXISTS |
| Project membership | `modules/delivery/deliveryAuthorization.ts`, `deliveryRoles.ts`, `DeliveryProjectMember` | EXISTS |
| Client-safe projection | `modules/delivery/clientVisibility.ts` — allowlist, fail-closed | EXISTS |
| Sign-in ≠ access | `modules/delivery/clientAuth.ts` — identity proves who, membership grants what | EXISTS |
| Customer repo custody | `docs/REPO_CONNECT_CONTRACT.md`, `GitHubConnection.access_token_encrypted` | EXISTS |
| Isolated execution | `services/delivery/execution/executionPolicy.ts`, `executionPromptEnvelope.ts` | EXISTS |
| Default-deny sensitive actions | `executionPolicy.ts`, `builderAuthority.ts` | EXISTS |

## The never-allow list (§100) against reality

| Must never happen | Guarded by | Residual risk |
|---|---|---|
| free visitor → paid delivery API | delivery client auth + membership | free-session surfaces are new; they must not share a token with the delivery API |
| client token → builder/admin API | `clientAuth` audience + `assertNotAdminShaped` | tested in `clientAuth.test.ts` |
| payment spoof → membership | server-authoritative price mapping (§27) | **no webhook path exists yet**; must be built with verification from the start |
| repo URL → arbitrary execution | repo verification (§31) + delivery-ready gate (§32) | **the gate does not exist yet** — highest new risk |
| Project AI → raw secrets | `clientVisibility` allowlist + §36 exclusions | new agent; must read through the projection, not around it |
| one tenant → another tenant's project | tenancy guards + 404-not-403 | `deliveryAuthorization` tests cover; extend per new surface |

## The three highest new risks

**1. Free code generation becoming an ungoverned execution service (§101).**
Free UI concepts run generated code. The rule is synthetic data only, no customer
production credentials or APIs, no arbitrary outbound network, temporary environment,
cleanup. `previewStackService` + `previewStackReaper` give a host and a TTL; the isolation
guarantees must be verified, not assumed, before Gate 5. A "free prototype" that can reach
the network is a hostile-code sandbox with a marketing label.

**2. Two new unauthenticated inbound surfaces.**
Billing webhooks (§28) and the Synthflow webhook (§58) are both attacker-reachable by
definition. Required for each: provider authenticity verification, replay protection,
idempotent processing, out-of-order tolerance, session correlation resolved
**server-side** — never trusting ids from the payload — and safe logging.
`controllers/synthflowWebhookController.ts` exists and **has not been audited against
§58 in this Gate 0**; that audit is a Gate 3 task and is recorded as owed, not done.

**3. The delivery-ready gate does not exist.**
§32's state (`billing_active`, `project_activated`, `repo_connected`,
`required_contract_ready`, `authority_ready`) is the thing standing between a paid project
and code execution. Nothing owns it today. Until it does, "paid + no repo → no execution"
(§130) is a claim with no enforcement point.

## Data handling (§102)

Never logged raw: payment secrets, access tokens, **voice transcripts**, full private
chat, repo secrets. Transcripts are the newest and least-guarded of these — they are long,
quotable, and land via a webhook, which is exactly the shape of thing that gets logged
wholesale during debugging.

Every workflow carries a correlation id, tenant, brand, and the visitor/lead/identity/
project it knows about. `callbackRequestService` is the local example already emitting in
this shape.

## Cost data is confidential

The Delivery Economics Engine (see `BILLING_MAP.md`) computes what each project and each
free prospect costs to service. Under §91 that is internal by default, and §36 excludes
"private capacity economics" from anything Project AI can see.

Because `clientVisibility` is an allowlist that fails closed, this is enforceable by simply
never adding those fields — but it must be a deliberate never, recorded here, because the
same numbers are exactly what a client-facing "value delivered" panel would be tempted to
quote.

## Testing obligations (§142)

Canary internal fields asserted absent from the **HTTP payload**, not the DOM. The
fail-closed tripwire preserved. `clientAllowlistContract.test.ts` extended per new kind.
