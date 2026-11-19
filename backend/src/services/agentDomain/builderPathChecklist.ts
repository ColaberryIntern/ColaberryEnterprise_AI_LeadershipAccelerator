/**
 * `docs/agent/README.md` — the builder's entry point, and a checklist that cannot be talked into
 * ticking itself.
 *
 * ## The one rule this module exists to enforce
 *
 * A tick comes from a FILE BEING THERE. There is no boolean parameter, anywhere, and a test reads
 * this file's own source to assert that: the moment a caller can pass `done: true`, the checklist
 * stops being evidence and becomes a second place to record a claim. The old board's measured
 * failure was 853 tasks above R0 with zero completions and 964 story bodies byte-identical to
 * their titles — nothing it asked for left a trace, so nothing could tell a worked rung from an
 * untouched one.
 *
 * ## Absent is not zero
 *
 * When the platform does not know what is in the repo, every stage renders as **not recorded**,
 * with the reason, rather than as unticked. "I have not looked" and "you have not done it" are
 * different statements and only one of them is about the builder.
 *
 * ## Why `docs/agent/README.md`
 *
 * It already satisfies `PATH_ALLOWLIST` in `renderDocs.ts` via `/^docs\/.+/`, so `renderDocs`
 * cannot throw on it and no allowlist change is needed. `.claude/skills/...` would have thrown a
 * `RenderError` and broken document sync for all seven builders on the first run after deploy.
 *
 * And `ownershipOf()` DEFAULTS TO `platform` for any unlisted path, so this file is overwrite-safe
 * with no action at all. Adding it to the `OWNERSHIP` map is what would make it unsafe. That
 * polarity is the opposite of the obvious guess, so a test pins it rather than trusting this
 * paragraph.
 */

import { BUILDER_STAGES, GATE_SIZE_BY_RUNG } from './builderPath';
import { AUTONOMY_LEVELS } from './autonomyLadder';
import type { CandidateStage } from './candidateStages';

/** Where the checklist lands in a builder's repository. Allowlisted, platform-owned by default. */
export const BUILDER_PATH_CHECKLIST_PATH = 'docs/agent/README.md';

/** Three states, because two would force "not looked" to render as "not done". */
export type ChecklistMark = 'done' | 'not_done' | 'not_recorded';

export interface ChecklistRow {
  readonly stage: CandidateStage;
  readonly title: string;
  readonly owned_by: 'builder' | 'owner';
  /** The stage's artifact path, with `{slug}` still in it: it is a pattern, not one file. */
  readonly artifact_pattern: string;
  readonly mark: ChecklistMark;
  /** The repo paths that satisfied this stage, sorted. Empty unless `mark` is `done`. */
  readonly evidence: ReadonlyArray<string>;
}

/**
 * Does any path in the repository satisfy this stage?
 *
 * The stage's path carries `{slug}`, so it describes a FAMILY of files — one per candidate. The
 * match is anchored at both ends and `{slug}` stands for one path segment only, so
 * `artifacts/capability/x/40-doing-it-by-hand.md` matches and
 * `artifacts/capability/x/notes/40-doing-it-by-hand.md` does not. A looser match would let a file
 * in the wrong place tick a stage.
 */
function satisfiedBy(pattern: string, paths: ReadonlyArray<string>): string[] {
  const escaped = pattern
    .split('{slug}')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^/]+');
  const rx = new RegExp(`^${escaped}$`);
  return paths.filter((p) => rx.test(p)).slice().sort();
}

/**
 * The checklist rows.
 *
 * `existingPaths` of `null` means the platform does not know, which is a different answer from an
 * empty repository and renders differently. There is NO boolean parameter and never will be.
 */
export function checklistRows(
  existingPaths: ReadonlyArray<string> | null,
): ChecklistRow[] {
  return BUILDER_STAGES.map((s) => {
    if (existingPaths === null) {
      return {
        stage: s.stage,
        title: s.title,
        owned_by: s.owned_by,
        artifact_pattern: s.artifact_path,
        mark: 'not_recorded' as const,
        evidence: [],
      };
    }
    const evidence = satisfiedBy(s.artifact_path, existingPaths);
    return {
      stage: s.stage,
      title: s.title,
      owned_by: s.owned_by,
      artifact_pattern: s.artifact_path,
      mark: evidence.length > 0 ? ('done' as const) : ('not_done' as const),
      evidence,
    };
  });
}

const BOX: Readonly<Record<ChecklistMark, string>> = Object.freeze({
  done: '[x]',
  not_done: '[ ]',
  // Deliberately not an empty box. An empty box reads as "you have not done this", and this mark
  // means "the platform did not look".
  not_recorded: '[?]',
});

/** The rung ladder as a table, so the gate target is visible rather than folklore. */
function gateTable(): string {
  return [
    '| Rung | Capabilities the agent must do, watched |',
    '|---|---|',
    ...AUTONOMY_LEVELS.map((r) => `| \`${r}\` | ${GATE_SIZE_BY_RUNG[r]} |`),
  ].join('\n');
}

/**
 * The file.
 *
 * Pure: same input, same bytes. No clock, because a timestamp here would make every document sync
 * commit a file whose only change is the time — the rule `renderDocs` states about its own
 * manifest, for the same reason.
 */
export function builderPathChecklist(
  existingPaths: ReadonlyArray<string> | null,
): string {
  const rows = checklistRows(existingPaths);
  const known = existingPaths !== null;
  const done = rows.filter((r) => r.mark === 'done').length;

  return [
    '# Your capability path',
    '',
    'One capability at a time, eight stages, and an artifact at every stage. This file is',
    'REGENERATED by the platform on every document sync, so do not edit it: it reflects what is in',
    'this repository, and the way to change it is to write the artifact.',
    '',
    '## The checklist',
    '',
    known
      ? `**${done} of ${rows.length} stages have an artifact in this repository.**`
      : '**The platform did not supply a file list for this repository**, so every stage below '
        + 'reads `[?]` — not recorded. That is the platform not having looked, NOT a statement '
        + 'that you have not done the work.',
    '',
    'A tick here means a FILE IS PRESENT at the path named. Nothing else can produce one: there is',
    'no flag, no field and no API call that marks a stage done. If you did the work and the box is',
    'empty, the artifact is missing or it is in the wrong place.',
    '',
    '| | Stage | Whose move | The artifact |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${BOX[r.mark]} | ${r.title} (\`${r.stage}\`) | ${r.owned_by} `
      + `| \`${r.artifact_pattern}\` |`),
    '',
    '`{slug}` is the candidate, lower-cased with dashes. One capability produces one set of these.',
    '',
    '## What each stage is for',
    '',
    ...BUILDER_STAGES.flatMap((s) => [
      `### ${s.title}`,
      '',
      s.meaning,
      '',
      `**Produces** \`${s.artifact_path}\`, and it counts when: ${s.artifact_is_done_when}`,
      '',
    ]),
    '## Two stages are not yours',
    '',
    ...BUILDER_STAGES.filter((s) => s.owned_by === 'owner').map(
      (s) => `- **${s.title}** (\`${s.stage}\`) — ${s.meaning}`,
    ),
    '',
    'When you are at one of those, start another candidate. Four run in parallel for exactly this',
    'reason, so nobody waits on a decision that is not theirs to make.',
    '',
    '## The gate for each rung',
    '',
    'A rung is cleared when this many capabilities in your domain are being done by the agent,',
    'watched. Doing a capability by hand is real progress and it is not this.',
    '',
    gateTable(),
    '',
    '## You are never asked what you do by hand',
    '',
    'You do not hold the job. Four candidates arrive from four places — your own research, the',
    'person who actually holds the job, Ali, and suggestions scored against your rung — and you',
    'choose one. The list says where each came from, because that is how much weight it deserves.',
    '',
  ].join('\n');
}
