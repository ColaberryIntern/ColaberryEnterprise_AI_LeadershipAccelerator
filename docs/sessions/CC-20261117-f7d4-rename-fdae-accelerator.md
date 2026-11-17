# CC-20261117-f7d4: rename "AI Systems Architect Accelerator" to "Forward Deployed AI Engineer Accelerator"

Asked by Ali on 2026-11-17: "We need to change the name of the AI Systems Architect Accelerator to
Forward Deployed AI Engineer Accelerator ... replace everywhere", including training.colaberry.com.
Ali chose option C: rename the program, the role graduates earn, AND his own signature title
("Managing Director / Forward Deployed AI Engineer"). Run end to end with loop-architect
(run `20261117-rename-fdae`, plan audit 20/20 on cycle 2).

## What changed

- **Code text (347 files, 922 replacements).** One ordered, case-sensitive map, article forms
  first ("an AI Systems Architect" -> "a Forward Deployed AI Engineer"). The keys contain no `-`
  or `_`, so URLs, slugs and identifiers cannot change: `/ai-architect`,
  `ai-systems-architect-training-system`, `systems_architecture`, `architect_domains` are untouched.
- **"Architect Readiness" metric label -> "Engineer Readiness"** (35 labels, student portal,
  company dashboards, marketing). "Claude Certified Architect readiness" (Anthropic) is untouched.
- **Matchers accept BOTH names**, because history and older forms carry the old one:
  - signature detectors in `scripts/lib/mandrillPreflight.js` and `services/email/aliEmailStyle.ts`;
  - lead classification `INTEREST_AREA_RULES` gains `'forward deployed ai engineer'`;
  - the Composer, Timeline and Experience Studio tabs pick their default course with
    `/forward deployed|architect/i` (was `/architect/i`, which the new name would have missed);
  - `taskPromptWorker/promptBuilder.js` project hint matches either Basecamp project name.
- **Production data**, `db/ensureProgramRenameFdae.ts`, run at boot from `server.ts`:
  - It renames forward-facing rows only, from an explicit allow-list. Examples: the program
    blueprint (the Composer's course dropdown), Cora's course, timeline cards, curriculum
    prompts, admissions knowledge, landing pages, live session titles, room names, unsent
    emails, and the leads' `interest_area` category (20,919 rows).
  - Every old value is copied to `program_rename_fdae_backup` first. The module is idempotent
    and never throws into boot.
  - Rehearsed in `accelerator_dev1` inside BEGIN/ROLLBACK. Every allow-list column went to 0.
    Every guard column was unchanged (sent emails 11,036, inbox subjects 2,163, student
    portfolio text), and the backup table was gone after the rollback.

## Caught by the independent verifier (fixed before the PR)

- **The first map had no word boundary.** It turned "AI Systems Architecture" into "Forward
  Deployed AI Engineer**ure**". That broke the YouTube intel search query and a default prompt,
  and at boot it would have done the same to production prompts.
  - Fixed: every key is now word-bounded (`\m...\M` in Postgres, lookarounds in JS), and the
    guard pattern is built from the map, so mixed casings are never re-"renamed" on every boot.
  - The second dev1 rehearsal added guards proving that rows containing "AI Systems Architecture"
    are unchanged.
- **Names split across a line break were missed by the first pass.** They are now fixed,
  including Cory's mentor prompt, the presentation prompts and the roadmap SVG.
- **The signature block counter was greedy.** `mandrillPreflight` counted two nearby signature
  blocks as one. It now uses a lazy `.{0,80}?`; the new regression test exposed this.

## Needs Ali (claim)

The page copy and `claimsRegistry.ts` `credential.cca` now say "Certified Anthropic Forward
Deployed AI Engineer". Anthropic's actual credential is "Claude Certified Architect - Foundations"
(CCA-F). The old wording, "Certified Anthropic AI Systems Architect", was equally not an Anthropic
title. The claim is still `DO_NOT_PUBLISH`.

## Deliberately kept

- History: `docs/sessions`, `PROGRESS.md`, screenshots, sent mail, the inbox mirror, logs,
  tickets, and the Basecamp mirror.
- Other people's job titles (Kes's staff role, student headlines and profile roles).
- Case studies: editing a live one republishes it.
- "Systems Architecture" (curriculum topic), "AI Architects" (level 4 of the enterprise
  capability model), the Composer's "AI Architect" assistant panel, "Architect domains" (the
  official certification domains), and the Claim Registry text (`c38Data.js`).

## Data rollback (per column; restores the ORIGINAL value)

```sql
UPDATE <table> t SET <column> = b.old_value::<type>
FROM (SELECT DISTINCT ON (row_id) row_id, old_value FROM program_rename_fdae_backup
      WHERE table_name='<table>' AND column_name='<column>' ORDER BY row_id, id) b
WHERE t.id::text = b.row_id;
```

## Companion PR

training.colaberry.com: colaberry/colaberry-training-migration#102 (37 files). The site never
sends the program name to enterprise: `program_interest` is one of three fixed program slugs.
