# Intern GitHub guardrails — the checks and balances

**Takeaway.** We do **not** need to build new guardrails to keep interns from harming the
system — the core protection already exists by design: **interns work in their own public
repos, never ours.** The platform only *reads* their repo to verify progress and keeps the
record in our database — it never runs their code and never lets their repo change our
production, our `main` branch, or our secrets. This doc states the model, what is enforced
today, what is a Monday config task, and what is deliberately deferred. Decision of record:
`docs/REPO_CONNECT_CONTRACT.md` §1 (Ali, 2026-08-14) — *student-owned repos; the platform
stores pointers and evidence, never the code.*

---

## The model in one paragraph

An intern connects **their own** GitHub repo (paste-your-own, or we provision an empty public
one for them under the workspace org). They build in that repo. On each push, GitHub calls our
webhook; we read `.colaberry/progress.json` and recent commit messages, match them to the
build stories, and write the **verification verdict + evidence into our own database**. The
repo is where verification *happens*; our database is where the record *lives*. There is no
pull request into a Colaberry repo, and nothing an intern pushes can reach anything we run.

## What an intern CAN and CANNOT do

| Can | Cannot |
|---|---|
| Build freely in their own public repo | Write to our real repo or its `main` branch |
| Trigger verification by pushing (webhook reads commits + `progress.json`) | See or touch production secrets, keys, or the prod database |
| Get their build progress reflected in the portal | Deploy, or merge anything into our codebase |
| Keep the repo as their portfolio | Obtain a copy of the production codebase (their repo is their own, seeded only with their plan/requirements/progress docs) |

The guardrail is **isolation by construction**: there is no bridge from an intern's repo to our
running system other than a read-only webhook that produces evidence rows. Harm is not
"prevented by a check" — it is **not reachable**.

## How approval actually works (it is not a GitHub PR)

Approval is **in-app and verification-based**, not GitHub-native:
- A push → automatic story verification (`webhookRoutes.ts` → `handlePushForVerification`); the
  verdict and evidence land in our DB.
- An admin reviews **plans and progress** in the intern console / project review and the
  (dark-shipped) blueprint review — not raw code diffs.
- For a gov bid, the intern's build is tied to them via the monitored project created by
  "Create the monitored project" on the Build step (see the assignment work), and they see it
  at `/portal/gov-projects/:id`.

## Why our real system stays safe (the main-repo guardrails)

Our production repo — the one interns never write to — is protected independently:
- `.github/CODEOWNERS`, required CI (the 8 checks), secret-scan, and `MERGE_WORKFLOW.md`.
- `main` is protected: one review + passing checks; **no intern has merge or deploy rights.**
- Production changes **only** through `scripts/deploy-prod.sh`, on Ali's word.

## Monday operational checklist (config, not code)

These are setup steps for the rollout, not a feature to build:
1. Each gov intern creates (or we provision) their **own public** repo.
2. Add each intern as a **builder-role `DeliveryProjectMember`** of their assigned gov delivery
   project — this is what makes them assignable (see assignment work) **and** able to see the
   contract in their portal.
3. Confirm `GITHUB_WORKSPACE_ORG` is set for the provision-a-repo path.
4. Point interns at the connect flow in their project workspace ("connect your repo").

## Known limitation (truthful)

The **OAuth activity sync is dormant**: `github_connections.access_token_encrypted` is an empty
string for ~41 of 44 rows, so the per-person aggregate activity feed (`student_github_activity`)
has never populated (`PROGRESS.md` 2026-10-02, memory
`reference_github_tokens_are_empty_strings_not_null`). The **webhook verification path is the
live one** and does not depend on that token. Per-person activity graphs will stay empty until a
token path is completed — not a blocker for the isolation guarantee above, but do not promise
"live GitHub activity dashboards" for Monday.

## Deliberately deferred (weeks, not this week)

Platform-*enforced*, per-repo, revocable guardrails — a GitHub App with short-lived installation
tokens, user-auth repo creation, true scoped access, and a **human push-approval / code-review
surface** — are scoped but not built (`docs/REPO_CONNECT_CONTRACT.md` §8). We do not need them
for Monday because isolation-by-construction already prevents harm; we would want them later to
*enforce* and *audit* repo access from our side rather than relying on the student-owned-repo
boundary.
