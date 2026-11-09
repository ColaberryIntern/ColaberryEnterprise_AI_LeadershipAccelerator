# Session CC-20261109-h4m8

Agent Factory board (Basecamp list 10406233777) — deploy of the merged AF12.x work,
plus a defect found in the deploy script's own safety check while doing it.

---

## fix(deploy): registry guard could not detect an unpublished image

- **Date:** 2026-11-09
- **Session:** CC-20261109-h4m8
- **What changed:** `scripts/deploy-prod.sh` — the registry-mode preflight now proves a
  manifest exists before hashing it, instead of hashing first and testing the hash for
  emptiness.
- **Verification:** `bash -n scripts/deploy-prod.sh` parses; a differential harness ran
  the OLD and the NEW logic against stubbed absent/present manifests, 5/5 assertions —
  the old path **PASSES** when both tags are absent (the bug, reproduced), the new path
  refuses with `no-pinned`, refuses the pinned-only and moving-only cases, and still
  **PASSES** the healthy case.
- **Notes:** Found while deploying, not by reading the file. The guard piped
  `docker manifest inspect` straight into `sha256sum` and tested with `-z`. `sha256sum`
  always emits a hash, so an absent image produced
  `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` — the sha256 of
  empty input — not an empty string. `-z` therefore could never fire, and when **both**
  the moving and the pinned tag were missing the two empty-input hashes compared EQUAL,
  so the mismatch check passed too. The script logged `<svc>: :main matches sha-<sha>`
  for an image that does not exist. Observed in production against
  `accelerator-frontend`, whose `sha-` tag is genuinely absent.

  This is the failure class CLAUDE.md names explicitly: a check that passes with the
  value broken. The fix was therefore mutation-tested rather than reasoned about, and
  the harness asserts the old behaviour too — a test that passes before the fix would
  have proved nothing.

  Scope note: the bug does **not** affect a deploy where the pinned tag exists and the
  moving tag does not; that case already failed on the mismatch branch. It bites only
  when both are absent, which is also the most dangerous case, because nothing in the
  output looks wrong.

### Failure-first notes (CLAUDE.md requires these in writing)

1. **What happens if this fails?** The deploy refuses before pulling anything. No
   container is touched, so a false refusal costs a wait, never an outage.
2. **Will it retry?** No, and deliberately. An unpublished image is not a transient
   condition to back off from — it means CI has not finished. The operator either waits
   for the `Build images` workflow or uses `DEPLOY_MODE=build`.
3. **Recovery path if refused:** `DEPLOY_MODE=build ./scripts/deploy-prod.sh <svc>`
   builds on the host and bypasses the registry entirely.
4. **Failure modes handled vs not handled:** handled — pinned tag absent, moving tag
   absent, the two disagreeing. Not handled — a registry that serves a *stale but
   well-formed* manifest under both tags; that would still compare equal and pass. That
   is the same trust boundary as before this change and is not made worse by it.
