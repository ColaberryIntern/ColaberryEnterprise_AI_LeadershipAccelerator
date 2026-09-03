# Client Visibility Map — Gate 0

- Date: 2026-09-03 · Session: CC-20260902-m8q4 · Base: `e99fdb35`

§7 says the client-safe projection exists and must be preserved; §142 says a DOM-hidden
test is insufficient; §152 makes "client browser receives builder-only fields" a stop
condition.

## The mechanism

`backend/src/modules/delivery/clientVisibility.ts` holds
`CLIENT_FIELD_ALLOWLIST: Record<ClientObjectKind, readonly string[]>` across ten kinds:
`brand`, `engagement`, `project`, `decision`, `design`, `release`, `evidence_summary`,
`change_request`, `acceptance`, `document`.

It is an **allowlist**, and its own comment states the consequence: *"Anything not named
here does not reach a client, including fields that do not exist yet."* A new column is
therefore invisible by default rather than exposed by default — the correct direction for
this failure mode.

`toClientShape(kind, plainRow)` is the only path rows take to a client, and the delivery
client route builds payloads through it server-side.

## Why the allowlist reads the way it does

The comments are unusually explicit about *absence*, and it is worth preserving that habit
rather than treating the lists as arbitrary:

- `engagement` excludes `source_lead_id` — *"our funnel record and none of the client's business"*
- `project` excludes `workflow_summary` and `existing_system_summary` — *"our analysis of how they work today, not something they asked to be shown"*
- every kind excludes `metadata` — an open JSON bag where anything could end up
- `brand` carries a theme **key**, never colours

That last one changed today (PR #2037): `default_theme_key` was withheld precisely because
nothing consumed it, and *"projecting a theme key the client surface cannot honour would be
shipping a promise instead of a feature."* It was added only once a registry existed.

**That is the standard for every new field this build wants to expose.**

## Fail-closed behaviour

The route layer fails closed if a forbidden internal field appears, rather than filtering
and continuing. §7 calls this out and it should not be softened: a projection that quietly
strips a leaked field teaches nobody, while one that refuses surfaces the mistake in
development.

## What this build will want to add, and the discipline for it

The plan's client surfaces (§36, §50, §51, §64–§67) imply new client-visible material:

| Wanted | Kind | Note |
|---|---|---|
| Project AI messages | new kind | delivery-scoped conversation (see CURRENT_STATE §1.5) |
| Decision cards (§42) | `decision` | recommendation + rationale may be safe; internal risk commentary is not (§36) |
| Design directions (§47) | `design` | |
| Preview status (§49) | `project` or new | URL and state only, never preview credentials |
| Release readiness (§87) | `release` | `clientReleaseProjection.ts` already exists |
| Trust view (§64–§67) | new | INPACT/GOALS state — see `TBI_INTEGRATION_MAP.md` |
| Repo status (§30) | new | connected/required only — **never the encrypted token or webhook secret** |

§36's exclusion list must be honoured field by field: no hidden chain-of-thought, no
builder scratchpads, no mentor notes, no other-client context, no secrets, no raw tokens,
no private capacity economics, no internal risk commentary.

**Delivery cost is in that category.** The Delivery Economics Engine (see `BILLING_MAP.md`)
computes what a project costs to service; that number is internal by default under §91 and
must never enter this allowlist.

## Testing requirement

§142 requires canary internal fields asserted absent **from the HTTP payload**, not from
the DOM. `clientAllowlistContract.test.ts` already pins the allowlist shape per kind and
should be extended, not replaced, for every kind this build adds.
