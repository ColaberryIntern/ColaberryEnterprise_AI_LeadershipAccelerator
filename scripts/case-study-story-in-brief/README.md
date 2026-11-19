# The story in brief, on every live case study

Each public case study opens with "The story in brief": three to five labeled beats (Before,
What we built, What happened, Why it matters, What's next) that tell the whole arc for a
reader who reads nothing else. The band prints only when the record carries
`identity.storyInBrief`; nothing is derived from other sections.

Ali, 2026-11-19: *"can we add 'The story in brief' to all the case study's."* This folder is
how the live catalog got its beats, and how they are changed later.

Ruled by `.claude/skills/build-case-study/SKILL.md`, section "The story in brief".

## Files

- `beats-2026-11-19.json`: the reviewed beats, keyed by case study id, with the slug (the
  applier refuses an id whose record has another slug) and the record's standfirst (only so
  the test can check no beat repeats it). Every figure is copied from the record's own
  metrics, closing, situation or roadmap.
- `beats.test.js`: holds every set to the server's limits (3 to 5 beats, label 32
  characters, text 240), the publish gate's claim vocabulary (no percentages, currency,
  quotation marks, return or production claims), no builder tool or code, and the audit's
  lint (a figure in What happened, no ticket text, no repeats).
- `apply-story-in-brief.js`: writes the beats onto the records in production and
  republishes them.

## Steps

1. Edit the beats file (or add a dated successor) and run
   `node --test scripts/case-study-story-in-brief/beats.test.js`.
2. Copy the applier and the beats file into the backend container (scp to the host, then
   `docker cp` into `accelerator-backend:/tmp/sib/`).
3. Dry run: `docker exec -w /app accelerator-backend node /tmp/sib/apply-story-in-brief.js /tmp/sib/beats-2026-11-19.json`.
   Every record should read `would write` or `unchanged`; a `REFUSED` line names the rule.
4. Apply with `--apply` (optionally `--only=<slug>`). Each changed record gets a new approved
   version through `applyHumanOverride` and is republished on every surface it is live on.
   The run exits 2 and prints the gate's blockers for any surface left on the old version.
5. Re-run the completeness audit for each record and look at the band on Enterprise and Hire,
   desktop and phone.

The applier is idempotent: unchanged beats are skipped, so a rerun writes nothing.
