# The intern development environment

**Who this is for:** the seven Agent Factory interns, anyone reviewing a change they
submit, and whoever onboards the eighth.

**Status:** contract. The parts that are enforced by a mechanism say so. The parts that
are currently only a rule also say so, because a contract that cannot tell you which is
which is worth very little.

---

## The one-paragraph version

You develop in **your own public repository, under your own GitHub account**. You do not
fork this repository and you are never given write access to it. To get a change in here,
you submit it and somebody else approves it. Everything below is the detail of those
three sentences, and the list of things you must never put in your repository — which
matters more than the list of things you may do, because **your repository is public**.

---

## Why "your own repo" and not a fork

Ali settled the own-account question on 2026-10-19: intern repositories live under the
intern's own GitHub account. On 2026-10-31 he settled the second half: **extract, not
fork.** You receive the parts of the platform you need; you do not take a copy of the
whole thing.

That choice has a mechanical consequence worth stating plainly, because it shapes
everything below:

> A GitHub pull request can only be opened between repositories that share commit
> history — the same "network", which in practice means a fork. Two repositories with
> unrelated histories cannot open a pull request between them at all.

So **the path for your change is not a pull request from your repository.** It cannot be.
It is a submitted patch that an automated, reviewed import turns into a pull request
here. That is not a workaround; it is the direct result of not having a fork, and it is
also the safer shape, because the thing that pushes to this repository is auditable code
rather than a person's credential.

---

## Measured current state

Everything in this section was read from settings and the database on **2026-10-31**, not
assumed.

| Fact | Value |
|---|---|
| Collaborators on this repository | 5 — none of them an intern |
| `main` branch protection | 1 approving review + 6 required status checks |
| Required checks | Backend typecheck · Backend unit tests · Secret scan + route-auth lint · Frontend build · Frontend typecheck · Test-file typecheck |
| Conversation resolution required | yes |
| Force push / branch deletion | blocked |
| `enforce_admins` | **false** — see Known gaps |
| Repositories connected to the platform | 54, across roughly 30 people |
| The seven interns' repositories | 11, all under their own accounts, none a fork of this one |

The seven interns' agent-build repositories, as the platform has them connected:

| Agent | Domain | Intern | Repository |
|---|---|---|---|
| Ellis | platform | Quincy Nkwain Ninying | `qninying/platform-reliability-agent` |
| Maru | product experience | Mihret Netsereab | `MihretColaberry1/ColaberryInternship` |
| Vic | sales | Victoria Spencer-Auber | `vessette/Simple` |
| Maya | admissions | Kalkidan Bezabeh | `Kalkidan2129/admissions` |
| Pip | internship | Tashima Diah | `tashdiah-Data/ai-project` |
| Dara | curriculum | Ruth Kumera | `rtkumera/AI-Agent-Project` |
| Ava | marketing | Sarbjit Kaur | `sainisarbjit83-ai/Colaberry_Marketing_Agent` |

---

## Audit result, 2026-10-31

All 11 repositories were scanned over **every commit on every ref** with the pinned
gitleaks and this repository's own `.gitleaks.toml`. The detector was verified against
planted secrets first.

**8 clean · 3 with findings · 0 unscanned · 0 confirmed disclosures.**

Every finding was triaged by reading the surrounding code, not the value:

| Repository | Finding | Verdict |
|---|---|---|
| `qninying/ai-operations-center` | 4, all in `mcp-server/src/evidenceRedaction.test.ts` | **Deliberate fixtures.** Each one sits inside an `it("redacts …")` case asserting that a redaction function strips it. This is the correct way to test redaction. |
| `qninying/ambit` | 1, `src/totpLoginWiring.test.ts` | **Deliberate fixture.** A throwaway `PASSWORD` next to a TOTP secret generated at runtime. |
| `qninying/HosPulse` | 1, `command-center/systems.html` | **A publishable key, documented.** The surrounding comment correctly notes it already ships in the deployed frontend bundle and that `service_role` and `DATABASE_URL` are never referenced. See the caveat in Known gaps. |

Nobody has leaked a credential. The three repositories with findings all belong to the
same intern and all three are a consequence of writing security tests, which is the
opposite of the problem this audit looks for.

Two things this result does **not** say:

- It does not say the repositories are clean *today* in any lasting sense. It is a
  measurement of 2026-10-31, and nothing currently stops a secret landing tomorrow.
- It does not cover the other 43 connected repositories.

---

## What you may never hold

**This is the important half of the contract.** Your repository is public. Anything that
travels with a clone is published to the world, and stays published: a value you commit
and then delete in the next commit is still in the repository's history, still fetchable,
and must be treated as compromised.

You must never commit, paste, or otherwise place in your repository:

1. **Any credential of any kind.** API keys, access tokens, passwords, OAuth client
   secrets, webhook signing secrets, session cookies, JWTs — including expired ones and
   including ones you believe are read-only.
2. **A database connection string**, for any environment. The host name alone is an
   attack surface.
3. **A `.env` file with real values.** Commit `.env.example` with empty keys instead.
   Writing the real file is what `.gitignore` is for.
4. **A private key or certificate** — `.pem`, `.key`, `.p12`, `id_rsa`, a service-account
   JSON.
5. **Production or customer data.** No student names, emails, phone numbers, payment
   records, or exports of any table that holds them. Not in a fixture, not in a test, not
   in a screenshot, not in a notebook output cell.
6. **Internal infrastructure detail** — server addresses, deployment hosts, internal
   hostnames, container names, or the contents of a production configuration file.
7. **Anything you were given to look at rather than to keep.** If you are not sure which
   it is, it is the former.

### The two shapes that actually cause this

Not malice. These two:

```js
// Shape 1: the fallback you meant to remove.
const key = process.env.OPENAI_API_KEY || 'sk-<a real key>';

// Shape 2: the line you meant to come back to.
OPENAI_API_KEY=<a real key>   # TODO move to env before pushing
```

Both have happened to competent engineers on this team. Write the env read with no
fallback and let it throw:

```js
const key = process.env.OPENAI_API_KEY;
if (!key) throw new Error('OPENAI_API_KEY is not set');
```

### If it already happened

Say so immediately — to Kes, or to Ali. Do not quietly delete it and push.

1. **Assume it is compromised.** It is public; deleting it does not unpublish it.
2. **Rotate the credential.** This is the only step that actually fixes anything.
3. Then clean the history, with help.

Reporting this has never been held against anyone. Not reporting it is the problem,
because an unrotated published key stays usable.

---

## The path a change takes

```
  your repo                     the import                      this repo
  ─────────                     ──────────                      ─────────
  1. you build and          2. you submit it as a           3. the importer applies
     commit on a      ──▶      change request         ──▶      it to a fresh branch
     branch                    (AF4.2 is the                   here and opens a PR
                               request channel)
                                                                        │
  5. it is merged, and          4. the 6 required checks run,           │
     you pull it back    ◀──       and a human who is not you    ◀──────┘
     into your repo               approves it
```

**You cannot approve your own change.** Not as a rule — as a mechanism. `main` requires
an approving review and you have no write access, so there is nothing for you to click.

**Nothing of yours is pushed here by you.** The importer holds the write access, not an
intern credential, and it is code in this repository that you can read.

The importer is `scripts/importInternChange.js`. It is dry-run by default, it keeps you
as the commit's author via `git am`, it applies the patch in a throwaway worktree so it
can never touch somebody's working branch, and it is idempotent on the source commit — a
re-run after a timeout finds the existing branch and pull request instead of opening a
second one.

**It refuses some changes outright**, regardless of who would approve them. The rules are
in `scripts/lib/internChangePolicy.js`, they are named, and they are unit tested:

| Refused | Why |
|---|---|
| Anything under `.github/` | A workflow runs with this repository's secrets, so a change there is arbitrary code execution with credentials, not a code change. The whole directory is refused rather than particular keys inside a YAML file, because that is the only version of the rule that cannot be worked around. |
| `docker-compose*.yml`, `Dockerfile*`, `nginx/`, `preview-db-init/` | Production infrastructure. Escalation-tier in `CLAUDE.md`. |
| `.gitleaks.toml`, `.gitleaksignore`, `.husky/`, `scripts/secret-scan.js`, `scripts/ensure-gitleaks.js` | Weakening the secret gate is how the next secret gets through, so the gate is not reachable from the path it guards. |
| `scripts/ci/`, `CODEOWNERS`, `scripts/deploy-prod.sh` | These decide who may approve what. A change here edits the review itself. |
| `CLAUDE.md`, `directives/` | The rules the review is conducted under. |
| `.env` (but **not** `.env.example`), `*.pem`, `*.key`, `*.p12`, `id_rsa` | A credential-bearing file must never travel in a patch. |
| An absolute path, or any `..` segment | It writes outside the repository when the patch is applied. |
| More than 40 files | Not reviewable. That is a merge, not a change request. |
| A patch the secret scan flags | Checked **before** the branch is pushed, because pushing is what publishes it. |

A refusal names every rule that fired and every offending path at once, so a rejected
change costs one round trip rather than one per problem.

---

## Verification, not intent

Each claim above is checked by something that fails loudly, or it is marked as a gap.

| Claim | How it is verified |
|---|---|
| No intern has write access to `main` | Read from the collaborator list and branch protection on 2026-10-31, and re-readable at any time. Not inferred from "we did not grant it". |
| No intern repository contains a credential | `node scripts/internRepoSecretScan.js --file <list>` — the pinned gitleaks over **every commit on every ref**, because a deleted secret survives in the blob. |
| The scanner actually works | `scripts/lib/gitleaksSelfTest.js` plants four classes of real-shaped secret and the audit **refuses to run** unless it finds all four. A report of green rows is what a broken detector produces, so the detector is tested first. |
| Your own commits are scanned before they leave your machine | The same pinned gitleaks and the same `.gitleaks.toml`, as a pre-commit hook. See `docs/SECRET_SCANNING.md`. |

---

## Known gaps

Stated rather than smoothed over.

1. **`enforce_admins` is false on `main`.** The admin account can bypass branch
   protection and push directly. No intern holds that account, so it is not an intern
   risk — but the sentence "every change is reviewed" is not literally true today, and
   it should be. Closing it is a repository-settings change and Ali's call.
2. **The secret gate has a pre-commit hook here, and nothing in an intern repo yet.**
   Until the hook is installed in their repositories, the scan is a periodic audit rather
   than a gate, and a secret can sit published between runs.
3. **The importer is built, and no change has actually travelled it yet.** Both outcomes
   are verified against real intern commits: it refused `qninying/platform-reliability-agent@3ffe3ceb`
   by name because the commit touches `.github/workflows/ci.yml`, and it cleared
   `tashdiah-Data/ai-project@832955b3`. What has **not** happened is a change pushed,
   reviewed and merged through it end to end, which is what AF4.5 criterion 3 actually
   asks for. Until that run exists this is a verified mechanism, not an exercised path.
4. **The contract covers the 7 interns; 54 repositories are connected.** The other
   repositories belong to staff and students, are equally public, and are not governed by
   anything written here.
5. **The one publishable key found is safe only if row-level security is on.** A Supabase
   anon/publishable key is designed to be public, but it is only harmless when RLS is
   enabled on every table it can reach; without RLS it grants read and write. This audit
   read the repository, not the Supabase project, so that was **not verified**. It is one
   check on one dashboard and it is worth doing.
