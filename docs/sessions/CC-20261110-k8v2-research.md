# Session CC-20261110-k8v2 — the research packet

Third and last piece of the intern-nudge workstream for 2026-11-10. The composer log is
`CC-20261110-k8v2-composer.md`; the copy log is `CC-20261110-k8v2-nudge-copy.md`.

## Why this exists

Ali pasted the Victoria message the console was about to send, next to the one a Claude Code
session had written for the same intern, and asked what the difference was made of. The answer was
not phrasing. Her message asked three questions of fact — is the Apollo agent actually scheduled,
why can a named colleague not open her agent page, who owns the lead model — and the composer had
no way to answer any of them, because it reads the portfolio sidecar and nothing else. The Claude
Code message was better because that session could read the source tree and query the database.

So the gap was **read access**, not prose. This change gives the nudge flow the same reach, in a
form that is presented as evidence rather than as an answer.

## What shipped

- [x] Research packet resolvers (PR #3843)
  - Date: 2026-11-10 · Session: CC-20261110-k8v2
  - PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3843
  - What changed: new `backend/src/services/internship/nudgeBrief/researchPacket.ts` — four
    resolvers (`findInSource`, `findAgent`, `findPerson`, `findDomainOwner`) plus `redact`, and a
    `GET /api/admin/intern-nudges/:enrollmentId/research` route behind
    `requireSection('internship')`. Every lead carries the evidence it came from; a question that
    resolves to nothing goes into `needsHuman` rather than being dropped.
  - Verification: 127 lines of new unit tests; `npx tsc --noEmit` clean in both workspaces;
    backend CI jest green; gitleaks clean. Then run against production from inside the container
    (`proveResolvers.js`), which returned three real findings:
    `ApolloWeeklyEnrollmentAgent is DISABLED in the registry. Schedule 0 14 * * 1`;
    `[AI Ops] SKIP ... (disabled in governance DB)` at `dist/services/aiOpsScheduler-Ali-AI.js:301`;
    and `Taiwo Oludimimu holds the management role "lead_intake" with extra section grants: agents`.
    Source search took 0.5s.
  - Notes: `findInSource` walks `/app/dist`, not a source tree — the container carries the build,
    and compiled JS keeps string literals, so a search for a log line or an env var name still
    finds it. Genuine container stdout is **not** reachable from inside the container, so
    "prod logs" is served here by the governance and registry rows rather than by log text. That
    substitution is deliberate and is the one part of Ali's instruction not met literally.
    `redact` runs on everything before it leaves the resolver: four patterns covering
    `name=value` secrets, known key prefixes, bearer tokens, and long base64 runs.

- [x] The panel on the card, and the person lookup that missed three people out of four (PR #3846)
  - Date: 2026-11-10 · Session: CC-20261110-k8v2
  - PR: https://github.com/ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator/pull/3846
  - What changed: `frontend/src/pages/admin/internship/researchPanel.tsx` renders the packet on a
    `blocked_waiting_on_ali` card only, fetched on demand; `needsHuman` is shown loudest. Plus the
    `findPerson` fix below.
  - Verification: 8 new panel cases; 203 frontend internship tests; 77 backend tests;
    `CI=true npm run build:frontend` exit 0 with zero warnings; `npx tsc --noEmit` clean both
    workspaces; `node scripts/checkTestTypecheck.js` baseline matched.

## The lookup bug, which only production could have found

Of the four names I tried against the live database, **three missed**, each for a different reason:

| Asked for | Stored as | Why the match failed |
|---|---|---|
| Kes | `Kes` | single word, so the old `% Kes%` pattern had no leading space to match |
| Aleem | `Mohammed Abdul Aleem` | the name people use is the **last** token, not the first |
| Roselyn | `Roselen Flores` | spelled differently in the record than in the question |
| Taiwo | `Taiwo Oludimimu` | matched |

`findPerson` now matches at the start of any word, with a five-character prefix fallback for the
spelling case. When the stored spelling differs from how the question spelled it, the finding says
so rather than quietly substituting — people write a colleague's name from memory, and a lookup
that silently corrects it is a lookup you cannot trust.

**Worth acting on separately:** Roselyn is filed as `Roselen Flores`. Her access looked broken to
the platform's own diagnostics, and a name mismatch in the user record is a plausible contributor.

## Two discrepancies this surfaced, both unresolved

1. The Apollo cron in `ai_agents` reads `0 14 * * 1` — **Monday only**. Ali's hand-written reply to
   Victoria described weekdays and twenty a day. The agent is disabled either way so nothing is
   going out, but the row and the reply disagree and one of them is wrong.
2. **No intern currently has an unanswered question**, so the panel has nothing live to chew on. It
   was proven against the resolvers directly rather than against a real card, which is weaker
   evidence than a real card would be.

## Failure-first notes

1. **What happens if this fails?** The panel shows its error and leaves its button usable. The
   packet is additive: the brief and the message are composed exactly as before whether the packet
   resolves anything or not, so a resolver fault cannot change what an intern receives.
2. **Will it retry?** No automatic retry. The fetch is user-initiated and idempotent, so the retry
   is the operator pressing the button again. Nothing is written, so a half-finished packet leaves
   no state behind.
3. **Recovery path if it keeps failing:** the leads are evidence an operator could gather by hand;
   the panel saves the gathering, it is not load-bearing. Revert is a frontend-only change plus one
   route.
4. **Handled vs not handled.** Handled: an unreadable source tree, a database that answers nothing,
   a question with no resolvable identifier, a secret appearing in a matched line, a name stored in
   a different form or spelling. **Not** handled: a question whose answer is not in the source
   tree, the registry or the auth tables at all — that is what `needsHuman` exists to say out loud
   rather than guess at. Also not handled: real container stdout, as above.

## Gitleaks, and the fix I refused

The pre-commit scanner blocked the research-packet commit twice, on test fixtures that had to look
like real credentials for `redact` to be worth testing. I built them from repeated characters at
runtime instead. I deliberately did **not** reach for `gitleaks:allow` or `.gitleaksignore`: either
would train the scanner to ignore the exact shape this module exists to catch, and the fixture
would have outlived the reason for the exemption.

## Not done

- **Not deployed at time of writing.** Both PRs merged; `33382877` was still building.
- **No Basecamp ticket for any of today's nudge work.** Bulk Basecamp writes as Ali are
  classifier-blocked in this session, so it is logged here and needs a ticket opening by hand.
- Thirteen prepared messages remain **prepared, not sent**.
