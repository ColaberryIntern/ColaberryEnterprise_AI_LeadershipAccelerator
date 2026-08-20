# Secret scanning

**This repository is public.** Anything committed here is world-readable immediately and permanently. Deleting a secret in a later commit does not remove it — the blob stays in history and stays fetchable by anyone who clones the repo. Treat any credential that reaches a commit as compromised, and rotate it.

This document covers the gate that prevents that, and what to do when it fires.

---

## What runs, and where

| Layer | Runs | Scans | Blocking |
|---|---|---|---|
| `.githooks/pre-commit` | On every `git commit` | Staged changes only | Yes (locally) |
| `.github/workflows/secret-scan.yml` → `pull-request` | Every PR, every push to `main` | The commits the change adds | Yes |
| `.github/workflows/secret-scan.yml` → `full-history` | Weekly (Mon 06:00 UTC), on push to `main`, on demand | All ~4,600 commits on all refs | Yes |

All three use the **same scanner at the same pinned version** ([gitleaks](https://github.com/gitleaks/gitleaks) `8.30.1`) against the **same ruleset** (`.gitleaks.toml`). That is deliberate: a finding can never pass locally but fail in CI, or the reverse.

The binary is resolved by `scripts/ensure-gitleaks.js`, which checks `GITLEAKS_PATH`, then `PATH`, then a cache in `.git/tools/`, and only then downloads it from GitHub releases — verifying a pinned SHA-256 before use. Nothing new lands in `node_modules`, and `.git/tools/` is inside `.git`, so it is never committed.

### Why the hook fails closed

If gitleaks cannot be resolved (no network on a fresh clone, corrupted cache, unsupported platform), the hook **refuses the commit** rather than allowing it through unscanned. A gate that silently passes when its scanner is missing is worse than no gate at all, because it manufactures confidence that nothing got through.

---

## Setup

Nothing to do beyond a normal install:

```bash
npm install
```

The root `prepare` script points git at the tracked hooks directory (`git config core.hooksPath .githooks`). Because `prepare` runs automatically on `npm install`, every clone gets the hook without anyone remembering a setup step.

To confirm it is active:

```bash
git config core.hooksPath        # -> .githooks
npm run secrets:scan             # -> "no leaks found"
```

### Manual scans

```bash
npm run secrets:scan        # what is staged right now (identical to the hook)
npm run secrets:scan:tree   # every tracked file in the working tree
npm run secrets:history     # every commit on every ref — slow, several minutes
```

---

## When the gate blocks you

The scanner prints the **rule**, **file**, and **line**. It does **not** print the secret value — output is redacted at 100% everywhere, so a detection never becomes the second place the credential leaks.

Work through these in order.

### 1. It is a real secret

Do not commit it. Do not "just this once".

1. Remove the value from the file. Read it from an env var instead (`process.env.MY_TOKEN`), sourced from the production `.env` on the VPS or the CCPP rotation tables — see the Security Enforcement Layer in `CLAUDE.md`.
2. **Rotate the credential.** If it reached your working tree it may have reached a terminal buffer, a log, a screen share, or another machine. Rotation is the only reliable remedy; deletion is not.
3. If it was already pushed, rotation is not optional and not deferrable. Rewriting history does not help — forks, clones, and caches already have it.

### 2. It is a false positive on one line

Annotate the line:

```js
const example = "AKIAIOSFODNN7EXAMPLE"; // gitleaks:allow
```

This keeps the justification next to the code, which is why it is the preferred form.

### 3. It is a false positive you cannot annotate

Generated files, binary-ish fixtures, or a finding in an already-existing commit. Add its fingerprint to `.gitleaksignore`:

```
<commit-sha>:<file-path>:<rule-id>:<line-number>
```

Copy the fingerprint exactly as printed. **Write a comment above it explaining why it is not a secret.** Because `.gitleaksignore` is committed, every exception is code-reviewed — that is what separates an escape hatch from a hole.

---

## The escape hatches, stated plainly

A gate people route around is worse than no gate, so the bypasses are explicit, documented, and — importantly — none of them let a secret reach `main` unnoticed.

| Hatch | Command | Skips the hook | Skips CI |
|---|---|---|---|
| Inline allow | `// gitleaks:allow` | Yes (that line) | Yes (that line) |
| Fingerprint allow | entry in `.gitleaksignore` | Yes (that finding) | Yes (that finding) |
| Emergency commit | `git commit --no-verify` | Yes | **No** |
| Broken-hook bypass | `SKIP_SECRET_SCAN=1 git commit ...` | Yes | **No** |

The first two are reviewable: they live in the diff, and a reviewer sees exactly what is being permitted and why.

The last two are for unblocking yourself locally — a broken hook, a bad config, a commit that fixes the scanner itself. **They do not skip CI.** The `pull-request` job re-scans the same commits with the same rules, so a bypassed secret still fails the PR. That is the intended design: local friction is skippable, the branch gate is not.

`SKIP_SECRET_SCAN=1` prints a loud warning when used. If you find yourself setting it habitually, the rule is wrong — fix `.gitleaks.toml` rather than training the team to skip the gate.

---

## Rules

`.gitleaks.toml` extends the ~180 upstream gitleaks rules (AWS, GCP, OpenAI, Slack, Stripe, GitHub, JWTs, private key blocks, …) rather than replacing them. Replacing the default set is the most common way a gitleaks config quietly stops catching things.

On top of those, four repository-specific rules:

| Rule ID | Catches |
|---|---|
| `colaberry-db-connection-uri` | `postgres://`, `mysql://`, `mongodb://`, `redis://`, `amqp://` URIs with an inline password |
| `colaberry-mandrill-api-key` | Mandrill / Mailchimp Transactional keys |
| `colaberry-basecamp-token` | Basecamp OAuth access and refresh tokens |
| `colaberry-generic-assigned-secret` | A high-entropy literal assigned to a credential-named variable |

`colaberry-db-connection-uri` exists for a concrete reason: a live Postgres URI with an inline password was committed to a compose file, and neither the upstream rules nor the previous hand-rolled scanner caught that shape.

### What is deliberately not excluded

`docs/`, `*.md`, and test files are **scanned**. The previous scanner skipped them, and that is exactly where a pasted credential goes unnoticed — a runbook with a real token in the example, a test fixture someone filled in with production values.

Only machine-generated, vendored, or binary content is excluded: `node_modules/`, build output, lockfiles, images and fonts. A human does not paste a secret into a `.woff2`.

---

## Relationship to `scripts/secret-scan.js`

The older `scripts/secret-scan.js` (run by the `guards` job in `ci.yml`) still runs and is unchanged. It is five regexes over currently-tracked files. It is kept because it is dependency-free and instant, but it is **not** the gate:

- it scans only the current tree, never history;
- it skips `docs/`, `*.md`, and tests;
- it has no database-URI rule, so it did not catch the compose-file leak.

Gitleaks supersedes it in coverage. Treat `secret-scan.js` as a fast smoke test and this gate as the real control.

---

## Making the CI check required

The workflow blocks a PR by reporting failure, but until it is marked required in branch protection, a PR can still be merged over a red check. To close that:

**Settings → Branches → `main` → Require status checks to pass** → add:

- `Secret scan / Scan new commits`

Do this after the first green run on `main`, so the check name is registered with GitHub.
