export const meta = {
  name: 'pr-approval-review',
  description: 'Multi-agent validate + verify of open GitHub PRs against CLAUDE.md governance and merge-readiness. Recommend-only: it never approves or merges.',
  whenToUse: 'Before approving/merging PRs. args: omit to review all open non-draft PRs, or pass {prs:[51,48]} / [51,48] to target specific ones. Returns a verdict per PR; the caller renders the report and decides.',
  phases: [
    { title: 'Discover', detail: 'resolve target PR numbers' },
    { title: 'Review', detail: '5 parallel reviewers per PR (merge/correctness/governance/tests/security)' },
    { title: 'Verify', detail: 'adversarially refute each consequential finding against the real diff' },
    { title: 'Verdict', detail: 'synthesize one recommend-only verdict per PR' },
  ],
}

const REPO = 'ColaberryIntern/ColaberryEnterprise_AI_LeadershipAccelerator'

// ---- schemas -------------------------------------------------------------
const FINDINGS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['dimension', 'summary', 'findings'],
  properties: {
    dimension: { type: 'string' },
    summary: { type: 'string', description: 'one-paragraph overall read of this dimension' },
    facts: { type: 'object', additionalProperties: true, description: 'merge-readiness only: raw gh facts' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'detail'],
        properties: {
          severity: { enum: ['blocker', 'major', 'minor', 'info'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          file: { type: 'string' },
          evidence: { type: 'string', description: 'concrete proof: a diff hunk, a gh field value, a line ref' },
        },
      },
    },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verified', 'reason'],
  properties: {
    verified: { type: 'boolean', description: 'true only if the finding survives adversarial scrutiny against the actual diff' },
    reason: { type: 'string' },
    correctedSeverity: { enum: ['blocker', 'major', 'minor', 'info'] },
  },
}

const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pr', 'recommendation', 'confidence', 'mergeReady', 'rationale', 'suggestedAction'],
  properties: {
    pr: { type: 'integer' },
    title: { type: 'string' },
    author: { type: 'string' },
    recommendation: { enum: ['APPROVE', 'APPROVE_WITH_NITS', 'REQUEST_CHANGES', 'BLOCK'] },
    confidence: { type: 'number', description: '0..1' },
    mergeReady: { type: 'boolean', description: 'true only if mergeable, no conflicts, base=main, not draft, and the approval rule can be satisfied' },
    blockers: { type: 'array', items: { type: 'string' } },
    majors: { type: 'array', items: { type: 'string' } },
    nits: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string', description: 'one paragraph tying the verdict to the verified evidence' },
    suggestedAction: { type: 'string', description: 'exact next step for the human reviewer (Ali)' },
  },
}

// ---- reviewer prompts ----------------------------------------------------
const GOV_DIGEST = `CLAUDE.md governance gates that apply to this repo:
- PROGRESS.md HARD GATE: any commit touching /backend /frontend /scripts /nginx /directives MUST also update PROGRESS.md with an entry carrying a Session ID (CC-YYYYMMDD-xxxx), a "Verification:" line with concrete evidence (test name | deploy | "tsc passes" | "user confirmed"), and only [x] when that evidence exists.
- Idempotency (NON-NEGOTIABLE): every new script/worker/webhook/side-effecting service must be safe to run twice. Mandrill sends dedup on (recipient,subject,business_event_id); Basecamp todo create checks existing first; webhook writes use unique constraint + ON CONFLICT; lead capture dedups on (email,source).
- Secrets: none in source/history/logs. No hardcoded hostnames/tokens/keys.
- Tests: new business logic in services/intelligence ships with at least a happy-path unit test.
- Contracts: new inbound HTTP routes validate body/query/params with Zod (note: Zod v4 -> use err.issues not err.errors). No 'any' without a justification comment.
- Module size: file soft 300 / hard 500 lines; function soft 50 / hard 100.
- Content style: outbound email/social uses no em-dashes; branded signature on 1:1 email.
- Failure-first: external calls need explicit timeout + capped retries; no silent catch {}.`

function mergePrompt(pr) {
  return `You are the MERGE-READINESS reviewer for GitHub PR #${pr} in ${REPO}. Recommend-only: do not approve or merge anything.
Run these and report the raw facts in 'facts':
  gh pr view ${pr} -R ${REPO} --json number,title,author,baseRefName,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,reviewDecision,reviewRequests,statusCheckRollup,commits,additions,deletions,changedFiles
If mergeable is UNKNOWN, wait briefly and re-run once (GitHub computes it lazily).
Context: main requires 1 approving review, dismiss_stale_reviews=true, NO CI checks are configured (empty statusCheckRollup is normal here), admins (Ali) can bypass, and GitHub blocks self-approval so PRs authored by 'ColaberryIntern' cannot be approved by that same account.
Put into facts: {mergeable, mergeStateStatus, baseRefName, isDraft, reviewDecision, author, headRefOid, additions, deletions, changedFiles, commitCount, selfApprovalOnly:(author is ColaberryIntern)}.
Raise findings ONLY for real merge risks: blocker = merge conflict / base != main / draft / mergeable=CONFLICTING; major = stale-base risk or many commits that should be squashed; info = self-approval-only (needs Ali's admin merge or a second reviewer). Do NOT invent CI findings — there is no CI.`
}

function correctnessPrompt(pr) {
  return `You are the CORRECTNESS reviewer for GitHub PR #${pr} in ${REPO}. Recommend-only.
Fetch: gh pr view ${pr} -R ${REPO} --json title,body,files  and  gh pr diff ${pr} -R ${REPO}
If the diff is very large (>1500 lines), focus on the highest-risk files (logic, data writes, money, auth, scripts) and say so in your summary.
Find REAL defects introduced by THIS diff: logic errors, off-by-one, null/undefined hazards, wrong async/await, broken control flow, regressions, incorrect SQL/queries, race conditions, wrong types. For each, cite the file and the exact hunk in 'evidence'. Do not report style or speculative issues as major. severity: blocker = will break prod or corrupt data; major = wrong behavior in a real path; minor = edge case; info = observation.`
}

function governancePrompt(pr) {
  return `You are the GOVERNANCE (CLAUDE.md) reviewer for GitHub PR #${pr} in ${REPO}. Recommend-only.
Fetch: gh pr view ${pr} -R ${REPO} --json files,title  and  gh pr diff ${pr} -R ${REPO}
${GOV_DIGEST}
Check THIS PR against those gates. Concretely:
- Does the PR touch /backend /frontend /scripts /nginx /directives? If yes, does the diff also update PROGRESS.md with a Session-ID-tagged entry that has a Verification line? (Look for PROGRESS.md in the changed files and inspect the added lines.) If it touches those dirs and does NOT update PROGRESS.md, that is a 'major' governance finding.
- Any new script/worker/webhook/email-send that is not idempotent? cite it.
- Any secret/token/hostname hardcoded in the diff? that is a 'blocker'.
- New service/intelligence logic without an accompanying test? 'major'.
- New inbound route without Zod validation? 'major'.
- Files pushed past the 500-line hard ceiling by this diff? 'minor'.
- Outbound email/social content with em-dashes? 'minor'.
Cite evidence (filename + added line) for every finding.`
}

function testsPrompt(pr) {
  return `You are the TEST-COVERAGE reviewer for GitHub PR #${pr} in ${REPO}. Recommend-only.
Fetch: gh pr view ${pr} -R ${REPO} --json files  and  gh pr diff ${pr} -R ${REPO}
The repo's standard: every shipped feature needs happy-path + failure-path + boundary + idempotency coverage; new business logic in services/intelligence ships with at least one unit test. Tests live in __tests__ folders and /tests.
Assess: does this PR add or modify the tests its changes require? List the specific untested new logic as findings. severity: major = new side-effecting/business logic with zero tests; minor = missing failure/boundary case on otherwise-tested code; info = pure config/docs/seed changes that legitimately need no test (say so, don't flag).`
}

function securityPrompt(pr) {
  return `You are the SECURITY reviewer for GitHub PR #${pr} in ${REPO}. Recommend-only.
Fetch: gh pr view ${pr} -R ${REPO} --json files  and  gh pr diff ${pr} -R ${REPO}
Look for, in THIS diff: secrets/tokens/keys committed (blocker); untrusted input flowing into SQL/shell/regex/HTML without validation or parameterization (blocker/major); new/changed routes missing auth + role + ownership checks (major); outbound external calls with no timeout or unbounded retries (major); dangerouslySetInnerHTML without justification (major); PII handling regressions (major). Cite file + hunk in evidence. Do not flag pre-existing issues the diff does not touch.`
}

const REVIEWERS = [
  { key: 'merge', label: 'merge-readiness', prompt: mergePrompt },
  { key: 'correctness', label: 'correctness', prompt: correctnessPrompt },
  { key: 'governance', label: 'governance', prompt: governancePrompt },
  { key: 'tests', label: 'tests', prompt: testsPrompt },
  { key: 'security', label: 'security', prompt: securityPrompt },
]

// ---- orchestration -------------------------------------------------------
phase('Discover')
// args can arrive as a parsed value OR as a JSON string (the Workflow tool
// passes it verbatim, and via the tool call it often serializes to a string).
let a = args
if (typeof a === 'string') {
  const t = a.trim()
  try { a = JSON.parse(t) } catch { a = t ? t.split(/[\s,]+/).map(Number).filter((n) => !isNaN(n)) : null }
}
let prNumbers = null
if (a) prNumbers = Array.isArray(a) ? a : a.prs
if (!prNumbers || !prNumbers.length) {
  const disc = await agent(
    `Run: gh pr list -R ${REPO} --state open --limit 50 --json number,isDraft --jq '[.[] | select(.isDraft==false) | .number]'. Return the array of open non-draft PR numbers.`,
    { label: 'discover-open-prs', phase: 'Discover', schema: { type: 'object', additionalProperties: false, required: ['numbers'], properties: { numbers: { type: 'array', items: { type: 'integer' } } } } }
  )
  prNumbers = (disc && disc.numbers) || []
}
log(`Reviewing ${prNumbers.length} PR(s): ${prNumbers.join(', ')}`)

const verdicts = await pipeline(
  prNumbers,

  // Stage 1: five reviewers in parallel for this PR
  (pr) => parallel(
    REVIEWERS.map((r) => () =>
      agent(r.prompt(pr), { label: `pr#${pr}:${r.label}`, phase: 'Review', schema: FINDINGS_SCHEMA })
        .then((res) => ({ key: r.key, res }))
    )
  ),

  // Stage 2: adversarially verify each blocker/major finding against the real diff
  async (reviews, pr) => {
    const clean = (reviews || []).filter((x) => x && x.res)
    const facts = (clean.find((x) => x.key === 'merge') || {}).res?.facts || {}
    const findings = []
    for (const { key, res } of clean) {
      for (const f of res.findings || []) findings.push({ ...f, dimension: key })
    }
    const consequential = findings.filter((f) => f.severity === 'blocker' || f.severity === 'major')
    const minor = findings.filter((f) => f.severity === 'minor' || f.severity === 'info')

    const checked = await parallel(
      consequential.map((f) => () =>
        agent(
          `Adversarially verify this finding on PR #${pr} in ${REPO}. Try to REFUTE it. Pull the real diff (gh pr diff ${pr} -R ${REPO}) and the cited file. Default to verified=false if the evidence does not clearly support it.\nFINDING [${f.severity}] (${f.dimension}): ${f.title}\nDETAIL: ${f.detail}\nEVIDENCE CLAIMED: ${f.evidence || '(none given)'}`,
          { label: `pr#${pr}:verify`, phase: 'Verify', schema: VERIFY_SCHEMA }
        ).then((v) => ({ ...f, verify: v }))
      )
    )
    const survived = checked
      .filter(Boolean)
      .filter((f) => f.verify && f.verify.verified)
      .map((f) => ({ ...f, severity: f.verify.correctedSeverity || f.severity }))

    return { pr, facts, verifiedFindings: survived, minorFindings: minor, summaries: clean.map((c) => ({ key: c.key, summary: c.res.summary })) }
  },

  // Stage 3: synthesize the recommend-only verdict
  (data, pr) =>
    agent(
      `You are the SYNTHESIS reviewer producing a recommend-only verdict for PR #${pr} in ${REPO}. You do NOT approve or merge — you advise the human reviewer (Ali).
MERGE FACTS: ${JSON.stringify(data.facts)}
VERIFIED blocker/major FINDINGS: ${JSON.stringify(data.verifiedFindings)}
MINOR/INFO FINDINGS (not adversarially verified): ${JSON.stringify(data.minorFindings)}
DIMENSION SUMMARIES: ${JSON.stringify(data.summaries)}
Rules for the verdict:
- recommendation = BLOCK if any verified blocker exists OR merge facts show a hard merge stopper (conflict, base != main, draft, mergeable=CONFLICTING).
- REQUEST_CHANGES if verified majors exist but no blockers.
- APPROVE_WITH_NITS if only minor/info findings remain and merge facts are clean.
- APPROVE if essentially nothing actionable and merge-ready.
- mergeReady = true ONLY if mergeable && not draft && base is main && no conflict. If the PR is self-approval-only (author is ColaberryIntern), note in suggestedAction that Ali must admin-merge or get a second reviewer.
- suggestedAction must be the concrete next step for Ali (e.g., "Safe to admin-merge", "Ask author to add PROGRESS.md entry then re-review", "Resolve conflict with main first").
Set pr=${pr}. Be calibrated; do not inflate confidence when findings were sparse.`,
      { label: `pr#${pr}:verdict`, phase: 'Verdict', schema: VERDICT_SCHEMA }
    )
)

return { reviewedAt: (a && a.now) || null, prs: prNumbers, verdicts: verdicts.filter(Boolean) }
