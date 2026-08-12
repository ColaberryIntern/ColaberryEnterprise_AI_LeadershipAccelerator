# Resolve an Inbox Case

## Purpose

Let Ali resolve a business matter — everything involving a person, company, or initiative — as one workflow across email and Basecamp, instead of triaging each email individually. This is the operating procedure for the Inbox Intel — Case Resolution Engine, the "Resolve Work" tab at `/admin/inbox`.

## Inputs

- A person name/email ("Kes") or a topic/company/initiative phrase ("AI Flotation LLC").
- A discovery window: 7d / 30d / 90d (default) / 1y / all-time.
- Existing state: `InboxIdentityAlias` rows (known person identities), `OpsBcTodo` mirror (Basecamp active-work cache), live Gmail/Hotmail/Basecamp access.

## Steps

1. **Discover.** `POST /api/admin/inbox/cases/discover` with `{ mode, query, window }`. The system resolves identity/topic terms, searches Gmail (Colaberry + personal), Hotmail, and Basecamp, scores every candidate, and groups them into distinct cases. Success signal: one or more `InboxCase` rows created, each in state `ASSESSING`.
2. **Review the discovery result.** Each case shows its evidence items with match score, match reasons, and source link. Include/exclude any candidate manually via `PATCH /api/admin/inbox/cases/:caseId/items/:itemId`.
3. **Assess.** `POST /api/admin/inbox/cases/:caseId/assess` generates the structured assessment (facts/assumptions/contradictions/timeline) and the Teach Me brief. Success signal: case state moves to `NEEDS_ALI` (blocking questions exist) or `READY_TO_PLAN` (none do).
4. **Answer questions.** `POST /api/admin/inbox/cases/:caseId/questions/:questionId/answer`. Answering one question can unblock multiple proposed actions at once. A case cannot leave `NEEDS_ALI` until every blocking question is answered or explicitly skipped.
5. **Plan.** `POST /api/admin/inbox/cases/:caseId/plan` generates the proposed action bundle (email drafts, Basecamp writes, waiting/delegated markers) with previews, risk levels, and idempotency keys. Success signal: case state moves to `AWAITING_APPROVAL`.
6. **Approve.** Review each proposed action's preview. High/medium-risk actions and anything listed in "always individual approval" (email sends, Basecamp writes) require per-action approval; low-risk actions may be bundle-approved via `POST .../actions/approve-low-risk`.
7. **Execute.** `POST /api/admin/inbox/cases/:caseId/execute` runs approved actions in dependency order, archive/label actions last. A failed action blocks anything that depends on it; it does not silently skip to archiving.
8. **Verify.** `POST /api/admin/inbox/cases/:caseId/verify` confirms every succeeded action's external effect actually landed (e.g. the Basecamp comment is really there).
9. **Close.** `POST /api/admin/inbox/cases/:caseId/close`. Blocked unless every closure-guard condition is met (see Edge cases). On success, linked Gmail/Hotmail evidence is archived/labeled; sent-mail evidence is never archived (it was never an inbox item).

## Outputs

- `InboxCase` in state `RESOLVED`, `WAITING`, `DELEGATED`, or left in `NEEDS_ALI`/`FAILED` if incomplete.
- Every case item carries a final `disposition` (`RESOLVED`/`WAITING`/`DELEGATED`/`NEEDS_ALI`/`SILENT_HOLD`/`NO_ACTION`/`PROTECTED`/`FAILED`).
- A complete `InboxCaseEvent` audit trail from `case_discovery_started` through `case_resolved`.
- Gmail/Hotmail inbox items removed from the visible inbox only on a valid disposition.

## Verification

- `GET /api/admin/inbox/cases/:caseId` returns the case, items, questions, and actions with their current state.
- `GET /api/admin/inbox/cases/:caseId/audit` returns the full event chain — every closure must show a complete, unbroken chain from discovery to resolution.
- A specific Gmail message losing its `INBOX` label (or gaining an `Inbox Intel/*` state label) confirms archival actually happened, not just that the case record says "resolved."

## Edge cases / failure modes

- **Cold start (no known alias yet):** a person search with zero prior `InboxIdentityAlias` rows relies on participant-email/name matching in the discovered content itself; aliases are then persisted for future searches. First-run results may show more `CANDIDATE`-tier items than a repeat search.
- **Ambiguous first name:** a bare name mention with no participant/thread corroboration scores as a weak signal and stays excluded by default — visible for manual inclusion, never silently promoted.
- **Basecamp reference self-match:** a Basecamp URL is only treated as a positive match signal once a second independent source (another email, or the Basecamp record itself) corroborates it — an isolated single mention doesn't auto-qualify.
- **Closure blocked:** the API returns exactly what remains outstanding (unanswered question, unresolved item, unverified action) — never a generic failure.
- **Reopen:** a new inbound message on a linked thread, new Basecamp activity creating an obligation, or a previously-"successful" action later found incomplete reopens a `RESOLVED`/`WAITING`/`DELEGATED` case back into `ASSESSING`. A duplicate sync event does not reopen a case.

## Safety constraints

- Every email send, Basecamp comment/write, and archive of a `PROTECTED`/uncertain item requires explicit human approval — no autonomous outbound communication.
- Retries are idempotency-keyed; a duplicate Execute request can never re-send an email or double-post a Basecamp comment.
- Sent mail is never archived as an inbox item.
- Evidence content (email/Basecamp text) is treated as untrusted data during Assess — it is never interpreted as an instruction to the assessment model.
