/**
 * visualPromptGenerator — turns a set of accepted critiques + suggestions
 * into a Claude Code-ready implementation prompt package.
 *
 * Pure: takes structured inputs, returns a string. The endpoint that
 * loads the session and calls this lives separately.
 *
 * Phase 5 §11.
 */
import type { SuggestionKind } from '../../../models/VisualAISuggestion';

export interface CritiqueForPrompt {
  readonly id: string;
  readonly kind: string;
  readonly severity: string;
  readonly description: string;
  readonly target_selector?: string | null;
  readonly expected_outcome?: string | null;
}

export interface SuggestionForPrompt {
  readonly id: string;
  readonly kind: SuggestionKind;
  readonly title: string;
  readonly body: string;
  readonly rationale?: string | null;
  readonly expected_ux_impact: number;
}

export interface VisualChangePackage {
  readonly session_id: string;
  readonly project_id: string;
  readonly bp_id: string | null;
  readonly page_route: string;
  readonly critiques: ReadonlyArray<CritiqueForPrompt>;
  readonly accepted_suggestions: ReadonlyArray<SuggestionForPrompt>;
  readonly affected_components?: ReadonlyArray<string>;
  readonly screenshot_path?: string | null;
  readonly expected_outcomes: ReadonlyArray<string>;
  readonly projected_ux_gain: number;
  readonly generated_prompt: string;
}

export function generateVisualChangePackage(input: {
  session_id: string;
  project_id: string;
  bp_id: string | null;
  page_route: string;
  critiques: ReadonlyArray<CritiqueForPrompt>;
  accepted_suggestions: ReadonlyArray<SuggestionForPrompt>;
  affected_components?: ReadonlyArray<string>;
  screenshot_path?: string | null;
}): VisualChangePackage {
  const expected_outcomes = input.accepted_suggestions
    .filter(s => s.expected_ux_impact >= 15)
    .map(s => s.title);

  const projected_ux_gain = Math.min(
    100,
    Math.round(
      input.accepted_suggestions.reduce((sum, s) => sum + s.expected_ux_impact, 0)
        / Math.max(1, input.accepted_suggestions.length),
    ),
  );

  const lines: string[] = [];
  lines.push('# Visual Improvement Build Package');
  lines.push('');
  lines.push(`**Page:** \`${input.page_route}\``);
  if (input.bp_id) lines.push(`**Business Process:** \`${input.bp_id}\``);
  lines.push(`**Session:** \`${input.session_id}\``);
  lines.push('');

  lines.push('## Context');
  lines.push('');
  lines.push('A user reviewed the page above and identified specific UX issues. Below is the curated set of accepted improvements. Implement each change below, then emit a `BuildManifest` declaring the changed files. The build is not complete until the manifest is posted.');
  lines.push('');

  if (input.critiques.length > 0) {
    lines.push('## Critique items');
    lines.push('');
    for (const c of input.critiques) {
      lines.push(`- **[${c.severity}] ${c.kind}** — ${c.description}`);
      if (c.target_selector) lines.push(`  - Target: \`${c.target_selector}\``);
      if (c.expected_outcome) lines.push(`  - Expected outcome: ${c.expected_outcome}`);
    }
    lines.push('');
  }

  lines.push('## Accepted improvements');
  lines.push('');
  for (let i = 0; i < input.accepted_suggestions.length; i++) {
    const s = input.accepted_suggestions[i];
    lines.push(`### ${i + 1}. ${s.title}`);
    lines.push('');
    lines.push(s.body);
    if (s.rationale) {
      lines.push('');
      lines.push(`*Rationale:* ${s.rationale}`);
    }
    lines.push('');
  }

  if (input.affected_components && input.affected_components.length > 0) {
    lines.push('## Likely affected components');
    lines.push('');
    for (const f of input.affected_components) lines.push(`- \`${f}\``);
    lines.push('');
  }

  if (input.screenshot_path) {
    lines.push(`## Screenshot reference`);
    lines.push('');
    lines.push(`See: \`${input.screenshot_path}\``);
    lines.push('');
  }

  lines.push('## Definition of Done');
  lines.push('');
  lines.push('1. All accepted improvements are implemented in the code.');
  lines.push('2. `npx tsc --noEmit` is clean on both backend and frontend.');
  lines.push('3. Existing tests still pass.');
  lines.push('4. A `BuildManifest` is posted to `POST /api/portal/project/build-session/<this session id>/complete` with:');
  lines.push('   - `task_type: "frontend"`');
  lines.push('   - `files_modified` listing every changed file');
  lines.push('   - `ui_components_modified` for each component touched');
  lines.push('   - `validation_results: [{ check: "tsc", status: "pass" }]` once tsc passes');
  lines.push('5. Re-screenshot the page so the visual review session can compute `ux_score_after`.');
  lines.push('');
  lines.push('Do not bundle unrelated work — this prompt is scoped to one page\'s UX improvements.');

  const generated_prompt = lines.join('\n');

  return Object.freeze({
    session_id: input.session_id,
    project_id: input.project_id,
    bp_id: input.bp_id,
    page_route: input.page_route,
    critiques: Object.freeze([...input.critiques]),
    accepted_suggestions: Object.freeze([...input.accepted_suggestions]),
    affected_components: input.affected_components ? Object.freeze([...input.affected_components]) : Object.freeze([]),
    screenshot_path: input.screenshot_path ?? null,
    expected_outcomes: Object.freeze(expected_outcomes),
    projected_ux_gain,
    generated_prompt,
  });
}
