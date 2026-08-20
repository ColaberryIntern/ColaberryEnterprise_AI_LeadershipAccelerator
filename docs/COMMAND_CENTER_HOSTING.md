# Where the Command Center Lives

**Status:** DECIDED — Ali Muwwakkil, 2026-08-14
**Decision:** *"All students create their own free personal repo. We keep the updates in our database. They own the build."*

---

## The decision in one paragraph

Every student creates a **free personal GitHub repo they own**, makes it **public**, and publishes their Command Center to **GitHub Pages** from that repo. The canonical URL is `https://<owner>.github.io/<repo>/`, which the portal derives from the `repo_owner` and `repo_name` we already store — so the button maps automatically, for every project, with no human step and nothing new to remember. Colaberry hosts none of it. What Colaberry keeps is the **evidence**: the plan, the story verdicts, the commit shas, the XP. A corporate learner whose employer will not permit a public repo self-hosts wherever their employer says, and we store the URL they give us.

---

## Why this is the right shape

### Custody is the cost, not storage

Static dashboards are a rounding error in disk and bandwidth. Thirty of them would cost effectively nothing to serve. That is exactly why "we could just host it" is the wrong instinct: **the expensive part of hosting other people's code is not storage, it is custody.**

The moment a student's build lives on Colaberry infrastructure, Colaberry acquires:

- a **security boundary** — their code is now in our blast radius, and ours is in theirs
- an **availability promise** — their portfolio breaks when our VPS reboots
- a **retention question** — what happens to their work when they graduate, or churn, or ask for deletion
- a **liability surface** — we are now the host of record for code we did not write and cannot audit

None of that shows up on a bill. All of it shows up in a procurement review, an incident, or an offboarding.

This is the same reasoning already recorded in `docs/REPO_CONNECT_CONTRACT.md` §1:

> **STUDENT-OWNED REPOS.** The platform stores pointers and evidence, never the code.

Hosting the Command Center on our infrastructure would have quietly reversed that ruling through the back door. The Command Center is not a special case; it is the most visible part of the build.

### The corporate learner is the deciding case

"Your engineers' work lives on our servers" does not survive a security review. It is the sentence that ends an enterprise deal, and it is unanswerable, because it is true.

Student-owned repos invert it: **their code never leaves infrastructure they already control.** For a corporate learner, the honest answer becomes "your work stays in your GitHub, or your employer's — we store a link and a record of what you finished." That is a sentence procurement can approve.

### The student keeps a portfolio

A capstone hosted on `colaberry.ai` is a demo that dies when the cohort ends. A capstone on the student's own GitHub, on their own account, at a URL that has their name in it, is a **portfolio artifact they keep forever** — linkable in a résumé, reviewable in an interview, extendable after graduation.

The program's promise is that students leave as AI Systems Architects with proof. Proof they do not own is not proof.

---

## What we chose against, and why

Recorded so nobody relitigates this in three months.

| Option | Verdict | Reason |
|---|---|---|
| **GitHub Pages, student's own public repo** | **CHOSEN** | $0. URL fully derivable from data we already store. Student owns it. No Colaberry custody. |
| **Vercel, per student** | Rejected | Free tier **forbids commercial use** in language that explicitly names "a paid employee or consultant writing the code" — which is precisely a corporate learner. URLs are **not derivable** (account slug plus a collision suffix), so the portal could never map the button automatically. 30 students in one org is **$20/seat/mo = $600/mo**. |
| **Netlify, per student** | Rejected | New free tier is credit-based: a production deploy costs 15 of 300 monthly credits, so roughly **20 deploys/month, after which the site goes dark** — a brutal failure mode for a student pushing daily. A workable tier is ~$9/student/mo. URLs are derivable if named by convention. Costs money for no gain over Pages. |
| **Wildcard `*.preview.colaberry.ai` on our VPS** | **Retire** | Cloudflare Universal SSL covers only one subdomain level, so this needs **Advanced Certificate Manager at $10/mo/zone** plus a server we run, a deploy pipeline that does not exist, and per-framework nginx rewrites. It pays money for a problem Pages solves free, and it puts us back in custody. |
| **A path on `colaberry.ai`** | Rejected | Same custody failure as the wildcard, with the added problem that we become the host of record for code we deliberately chose not to hold. |

---

## How the URL maps automatically

This is the property that makes the button work, and it is why Pages wins on mechanics and not just on principle.

```
https://<owner>.github.io/<repo>/
         │                │
         │                └── github_connections.repo_name
         └─────────────────── github_connections.repo_owner
```

Both columns already exist on `backend/src/models/GitHubConnection.ts` (`repo_owner`, `repo_name`, `repo_url`), keyed one row per `project_id`. The lookup helper `repoForProject(projectId)` already exists at `backend/src/services/sbp/workspaceRepo.ts:41`.

So the Command Center URL is a **string concatenation over data we already have**. No new column, no reservation step, no name registry, no student pasting anything, no admin step. GitHub does not require any claim or setup for the URL to be predictable — it is a deterministic function of `(owner, repo)`.

Contrast with Vercel, where the production URL embeds the student's personal account slug and can gain a random suffix on collision, and can only be discovered by an authenticated API call the school is not entitled to make.

### The override path already exists

`project_variables.command_center_url` is already built end to end and validated https-only:

| Layer | Path |
|---|---|
| Write | `backend/src/services/projects/projectWriteService.ts:354` (`setCommandCenterUrl`) |
| Route | `backend/src/routes/projectsPortalRoutes.ts:172` — `PATCH /api/portal/projects/:projectId/command-center` |
| Read / validate | `backend/src/services/projects/projectTreeDto.ts:400,410` |
| Render | `frontend/src/pages/portal/projects/ProjectWorkspacePage.tsx:212` |

It has **no caller in the frontend** — which is why it is `null` for all ~31 projects and the button never renders.

The correct wiring is therefore: **derive the Pages URL by default, let the stored value win when set.** A corporate learner self-hosting on their employer's infrastructure gets their URL stored here, and everything downstream is identical.

---

## What this costs

| Item | Cost |
|---|---|
| GitHub Pages on a public repo | **$0**, unlimited project sites |
| GitHub Actions minutes | **$0** — unlimited on public repos, and "deploy from branch" needs no workflow at all |
| Bandwidth | 100 GB/month soft limit — a rounding error for ~30 static dashboards |
| Site size | 1 GB per site |
| Builds | 10/hour soft limit, waived with a custom Actions workflow |
| Colaberry infrastructure | **$0 marginal** — we host nothing |

None of these limits are reachable at this scale, or at ten times this scale.

---

## The visibility constraint, stated plainly

This is the one real trade-off, and it should not be buried.

- On a **free** GitHub account, Pages publishes **only from a public repo**.
- **Pro/Team** allows Pages from a private repo — but **the published site is still public**. Paying buys *source* secrecy, not *site* secrecy.
- A genuinely **private site** (access-controlled viewing) requires an organization on **Enterprise Cloud**.

So for a student on the default path: **their source and their Command Center are both world-readable.** For most learners this is a feature — it is the portfolio. For a corporate learner it may be disqualifying, which is exactly why they take the self-host path and we store their URL.

`GitHub Student Developer Pack` grants Pro (private-repo Pages) free, but eligibility requires a degree- or diploma-granting institution and a professional accelerator may not qualify. **Worth one email to GitHub Education; not a blocker either way**, since it would only buy source secrecy.

### Design constraint: a static dashboard cannot hold a secret

**This is a rule, not a footnote.**

The Command Center is served as static files from a public URL. The JavaScript is downloadable, the URL is guessable, and there is no server-side execution to hide anything behind. Therefore:

- **Never embed an API key, token, or credential in the Command Center.** Anything shipped to the browser is published.
- When the Command Center pulls live data from the Colaberry API, it must use a **short-lived, per-student token** scoped to that student's own data, minted on demand — never a long-lived or shared key.
- Treat every value the page can read as public. If a datum cannot be public, it does not belong in a static dashboard.

This constraint should be written into STORY-000 itself, not left for students to discover. It is a genuinely useful architecture lesson: *the trust boundary is the browser*.

---

## What a corporate learner does

1. Builds the Command Center in a repo their employer controls (private, on the employer's org, or entirely internal).
2. Publishes it wherever their employer permits — internal static host, their own Pages on an Enterprise Cloud org, or nowhere at all.
3. Either supplies the URL, which we store in `project_variables.command_center_url` via the existing PATCH route, or supplies nothing and the portal shows a "not published" state.

**Their evidence is unaffected.** The plan, the story verdicts, the commit shas, the XP and the verification record all live in the Colaberry database and are keyed on `project_id`, not on a hosted URL. A corporate learner with no public Command Center at all still earns the full 800 Builder XP for their capstone, still shows a complete build record, and still graduates with proof — proof that lives in our database and in their repo, which is exactly the split the decision describes.

---

## Follow-ups this decision creates

These are consequences to schedule, not part of this decision. **None have been built.**

### 1. The portal shows a dead URL on every project (bug, user-visible)

`frontend/src/pages/portal/projects/ProjectInterior.tsx:268-270` renders, unconditionally, for every project:

```jsx
href={`https://${project.slug}.preview.colaberry.ai`}
```

That host does not resolve — **NXDOMAIN, no wildcard record**. Every student currently sees a link that goes nowhere.

Worse, `project.slug` is **not a database column**. It is derived client-side (`projectHydrate.ts:143`, `projectsStore.ts:334`) by slugifying the project name, truncated to 40 characters, non-unique, and **it changes when the student renames the project**. It was never a stable identity.

**Fix:** delete the hardcoded anchor and render the derived Command Center URL, with an honest "not published yet" empty state. The same hostname is also baked into sample prompt text at `projectsStore.ts:386` and a backlog description at `backend/src/scripts/setupStudentPlatformBacklog.js:105`.

### 2. STORY-000 never tells the student to publish

`backend/src/services/sbp/commandCenterStory.ts` contains **no mention of deploying, hosting, or Pages** — its acceptance criteria (`:319`, `:350`) never require the page to be reachable at a URL. Students are asked to build a Command Center and never asked to put it anywhere.

That is the actual curriculum gap behind "students have nowhere to point the button." Publishing to Pages should become a step in the story and "reachable at your Pages URL" an acceptance criterion — plus the no-secrets-in-static rule above.

### 3. Derive the URL server-side

`buildTree()` (`backend/src/services/projects/projectReadService.ts:22`) loads only `Project`. It needs the repo pointer via the existing `repoForProject()` so `commandCenterUrl()` (`projectTreeDto.ts:410`) can fall back to `https://<owner>.github.io/<repo>/` when no explicit URL is stored. Keep the https-only guard; keep the stored value winning.

### 4. Wire the override input

`PATCH /api/portal/projects/:projectId/command-center` has no frontend caller. A corporate learner needs a field to paste their self-hosted URL into — likely on `WorkspaceRepoPanel.tsx`.

### 5. Retire the `preview.colaberry.ai` plan

`directives/per-user-project-previews.md:36,38` deferred subdomains to a Phase 4 that this decision cancels. The directive should record that `*.preview.colaberry.ai` is retired and why (ACM cost, custody), so it is not revived.

---

## The platform provisioning path

**Visibility: DECIDED and SHIPPED — Ali Muwwakkil, 2026-08-19.** Provisioned repos
are now created **public**, matching what the rest of the product already told the
student. The custody half of this section (repos under Colaberry's org rather than
the student's account) is **still an open recommendation** and is unchanged.

`POST /api/portal/workspace/repo/provision` (`backend/src/routes/workspaceRoutes.ts:171`) creates the student's repo by calling:

```
POST /orgs/${GITHUB_WORKSPACE_ORG}/repos     # defaults to 'ColaberryIntern'
     body: { private: false, ... }   # public since 2026-08-19
```
`backend/src/services/studentWorkspaceService.ts:240`

This was **doubly wrong under the 2026-08-14 decision**. One half is now fixed:

1. It creates the repo **under Colaberry's org**, not the student's account — the exact custody shape Ali just rejected. `docs/REPO_CONNECT_CONTRACT.md` §5 already flags this as the one place the implementation violates its own ruling.
2. ~~It creates the repo **private**, which makes GitHub Pages unavailable on a free account — so a repo provisioned this way *cannot* host a Command Center on the chosen path.~~ **FIXED 2026-08-19:** `private: false`. This was the contradiction that mattered most to a student: the webhook panel warned in bold that "your repo is public", STORY-000's prompt asserted "This repo is public", and then STORY-000's final step — publishing the Command Center to Pages — hit a paywall that only provisioned students ever saw. Most students create their own repo and make it public, so the cohort was split and behaving differently on identical instructions.

**It is also already broken.** The org create call returns 404 (GitHub returns 404 rather than 403 when a token lacks org visibility or repo-create permission, so as not to leak org existence).

**What a student sees today if they press it:** the thrown `GitHub repo create failed (404): …` carries no `student_message` and no `http_status`, so `statusFor()` falls through to **500** and `messageFor()` returns the generic fallback. The student gets:

> **Failed to create your workspace repo**

No cause, no next step, no way to self-serve. They are stuck, and nothing tells them the other door exists.

### Recommendation: hide it in the UI, disable it at the route, keep the code

Ranked against the alternatives:

- **Remove it entirely** — rejected for now. It is a working implementation of collaborator-adding and connection-upsert that the connect flow shares; ripping it out is a larger diff than the decision requires, and the decision is one day old.
- **Leave it as is** — rejected. It is a live button that 500s, and if the token were ever fixed it would silently start creating repos under our org, re-introducing custody by accident. A broken path that heals into the wrong behaviour is worse than one that stays broken. (As of 2026-08-19 those repos would at least be public, so the Pages dead end is gone; the custody problem is not.)
- **Hide + disable + keep** — **recommended.** Three small changes:
  1. **Remove the provision affordance from the UI** so no student can reach a dead end.
  2. **Return a deliberate 410 Gone** from the route with a real `student_message` pointing at the connect flow ("Create a free repo on your own GitHub account and connect it here"), so any cached client or direct call gets a truthful answer instead of a 500.
  3. **Leave the service code in place**, with a header comment recording that platform-org provisioning is retired by the 2026-08-14 custody decision and must not be re-enabled without reversing it.

This makes the failure honest immediately, removes the wrong-shape path from the product, and leaves the shared helpers intact for the connect flow — without a large refactor made in the same week as the decision.

**One thing to confirm before wiring anything automated:** whether the platform token holds `admin` on a student-owned repo. If it does not — and on a Door-A repo where we are at most a push collaborator, it will not — then `POST /repos/{owner}/{repo}/pages` is a **student action, not an automated one**. Pages *can* be enabled entirely over the REST API, so automation is possible in principle; it is permission, not API surface, that decides. Worth checking against a real connected repo before anyone designs the flow.

---

## Already-provisioned private repos: what happens to them

**Recommendation: the flip is forward-only. Do NOT mass-convert existing private
repos, and do not convert any of them silently.**

The change above affects repos created from 2026-08-19 onward. Repos already
provisioned private stay private until someone decides otherwise, deliberately.

Why not just flip them:

- **Flipping publishes their work.** A student was told, by this platform, that the
  repo was private on the provisioning screen. Some will have taken that at face
  value and committed things they would not publish — a `.env`, a key, a client
  name. Making the repo public retroactively publishes all of it, including the
  entire git history, where a later `git rm` does not remove it.
- **A secret in git history is not fixed by deleting the file.** Anyone flipping a
  repo must rotate what leaked, not just delete it.
- **No code path exists to do it.** There is no `PATCH /repos/{owner}/{repo}` and no
  `visibility` payload anywhere in this codebase; it would be net-new. It is also
  not certain the platform token holds `admin` on these repos, which such a call
  requires.

**If Ali decides to convert them, the order is: tell them first, then convert.**

1. Identify the affected students (`github_connections` rows with
   `status_json.connect.method = 'provisioned'`).
2. Email each one, before anything changes, saying plainly: your build repo is
   currently private, we are making it public on <date>, here is why, here is the
   URL, and **check it for passwords, API keys and `.env` files first — if you
   find one, rotate the key, because deleting the file does not remove it from the
   history.**
3. Give a real window to act, and a way to say no.
4. Only then convert, and only for those who did not opt out.

A student who opts out keeps a private repo and loses only the free Pages hosting
of their Command Center, which STORY-000 already treats as optional and never
gates the story on.

---

## Summary

| Question | Answer |
|---|---|
| Where does it live? | The student's own free, public GitHub repo, published via GitHub Pages |
| What is the URL? | `https://<owner>.github.io/<repo>/` — derived from columns we already store |
| What does it cost? | $0 to Colaberry, $0 to the student |
| What do we host? | Nothing. We hold the plan, the verdicts, the commit shas and the XP |
| What about corporate learners? | They self-host; we store their URL; their evidence and XP are identical |
| What is the catch? | On a free account the repo and the site are public. That is the portfolio for most, and the reason corporate learners take the other path |
| Hard design rule | A static dashboard cannot hold a secret. Short-lived per-student tokens only, never an embedded key |
