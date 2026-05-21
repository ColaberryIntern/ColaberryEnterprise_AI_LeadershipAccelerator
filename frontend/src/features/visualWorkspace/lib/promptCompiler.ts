/**
 * promptCompiler — V1 fallback prompt builder.
 *
 * The backend `generate-prompt` endpoint is the canonical compiler — it
 * pulls component + route registry context server-side. This local
 * compiler is the V1 fallback used when:
 *   - the backend prompt is empty
 *   - the user wants to preview a prompt before committing
 *   - the network round-trip should be skipped
 *
 * Output format mirrors the Visual Productization Plan §11 — objectives,
 * affected areas (selectors), critiques, expected outcomes, verification.
 */

interface CritiqueLite {
  id: string;
  kind: string;
  severity: string;
  description: string;
  target_selector?: string | null;
  region?: { x: number; y: number; width: number; height: number } | null;
  expected_outcome?: string | null;
  // 2026-05-21 Visual Scan additions.
  scope?: 'page' | 'global' | 'component';
  title?: string | null;
  rationale?: string | null;
}

interface SuggestionLite {
  id: string;
  critique_id: string;
  title: string;
  body: string;
  expected_ux_impact?: number;
}

interface DecisionLite {
  suggestion_id?: string | null;
  critique_id?: string | null;
  verdict: 'accepted' | 'rejected' | 'deferred';
}

interface CompileInput {
  page_route: string;
  preview_origin: string;
  critiques: CritiqueLite[];
  suggestions: SuggestionLite[];
  decisions: DecisionLite[];
  selected_critique_ids?: string[];
}

export function compilePromptLocally(input: CompileInput): string {
  const acceptedSuggestionIds = new Set(
    input.decisions.filter(d => d.verdict === 'accepted' && d.suggestion_id)
      .map(d => d.suggestion_id as string),
  );

  // Critiques included: those explicitly selected, OR those that have at
  // least one accepted suggestion. If neither filter is set, include all.
  const filterSet = input.selected_critique_ids ? new Set(input.selected_critique_ids) : null;
  const critiques = input.critiques.filter(c => {
    if (filterSet) return filterSet.has(c.id);
    const has_accepted = input.suggestions.some(s => s.critique_id === c.id && acceptedSuggestionIds.has(s.id));
    return has_accepted || input.suggestions.every(s => s.critique_id !== c.id);
  });

  if (critiques.length === 0) {
    return '_no critiques selected — pin at least one issue, then compile._';
  }

  const previewUrl = joinUrl(input.preview_origin, input.page_route);

  // 2026-05-21 (Addition C): sort by severity desc so high-severity
  // critiques appear first in the prompt. Within severity, preserve
  // creation order for stability.
  const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const sortedCritiques = [...critiques].sort((a, b) => {
    const sa = SEVERITY_RANK[(a.severity || 'medium').toLowerCase()] || 2;
    const sb = SEVERITY_RANK[(b.severity || 'medium').toLowerCase()] || 2;
    return sb - sa;
  });

  // 2026-05-21 (Phase 2): split into global vs page-scoped sections so
  // the Claude Code consumer sees the theme-level fixes framed as
  // cross-cutting work, separate from this page's specific changes.
  const globalCritiques = sortedCritiques.filter((c: any) => c.scope === 'global' || c.scope === 'component');
  const pageCritiques = sortedCritiques.filter((c: any) => !c.scope || c.scope === 'page');

  const lines: string[] = [];
  lines.push('# Visual workspace change request');
  lines.push('');
  lines.push(`**Target page:** \`${input.page_route}\``);
  lines.push(`**Preview URL:** ${previewUrl}`);
  lines.push(`**Critique count:** ${critiques.length} (${globalCritiques.length} global / ${pageCritiques.length} page-specific)`);
  lines.push('');
  lines.push('## Objective');
  lines.push('Address the critiques pinned in the visual workspace. Each critique below is anchored to a region of the rendered page (region coordinates are normalized 0..1 across the iframe stage).');
  if (globalCritiques.length > 0) {
    lines.push('');
    lines.push('**Scope note:** items in the "Global" section below are theme / design-system changes that should apply across all pages, not just this surface. Page-specific items live only on the target page.');
  }
  lines.push('');

  if (globalCritiques.length > 0) {
    lines.push('## Global (theme / design system)');
    lines.push('');
    globalCritiques.forEach((c, idx) => {
      lines.push(`### G${idx + 1}. ${kindBadge(c.kind)} · ${c.severity.toUpperCase()}`);
      lines.push('');
      if ((c as any).title) lines.push(`- **Title:** ${(c as any).title}`);
      if ((c as any).rationale) lines.push(`- **Rationale:** ${(c as any).rationale}`);
      if (c.target_selector) lines.push(`- **Selector:** \`${c.target_selector}\``);
      lines.push(`- **Issue:** ${c.description}`);
      if (c.expected_outcome) lines.push(`- **Expected outcome:** ${c.expected_outcome}`);
      lines.push('- **Note:** this is a global change. Apply consistently across the design system (tokens, base components) so every page benefits.');
      lines.push('');
    });
  }

  lines.push('## Page-specific critiques');
  pageCritiques.forEach((c, idx) => {
    lines.push(`### ${idx + 1}. ${kindBadge(c.kind)} · ${c.severity.toUpperCase()}`);
    lines.push('');
    if (c.target_selector) lines.push(`- **Selector:** \`${c.target_selector}\``);
    if (c.region) {
      const r = c.region;
      lines.push(`- **Region (normalized):** x=${r.x.toFixed(3)} y=${r.y.toFixed(3)} w=${r.width.toFixed(3)} h=${r.height.toFixed(3)}`);
    }
    lines.push(`- **Issue:** ${c.description}`);
    if (c.expected_outcome) lines.push(`- **Expected outcome:** ${c.expected_outcome}`);

    const accepted = input.suggestions
      .filter(s => s.critique_id === c.id && acceptedSuggestionIds.has(s.id));
    if (accepted.length > 0) {
      lines.push(`- **Accepted suggestion(s):**`);
      accepted.forEach(s => {
        lines.push(`  - ${s.title}${typeof s.expected_ux_impact === 'number' ? ` (+${s.expected_ux_impact} UX)` : ''} — ${s.body}`);
      });
    }
    lines.push('');
  });

  lines.push('## Implementation expectations');
  lines.push('- Make the minimum-viable change for each critique. Do not bundle unrelated refactors.');
  lines.push('- Preserve existing component contracts; do not rename exported props or types.');
  lines.push('- If a CSS token already exists for a colour/spacing value, use it; do not introduce hex codes.');
  lines.push('- For layout changes, ensure the page still renders correctly at 1280px, 1024px, and 768px viewports.');
  lines.push('');

  lines.push('## Verification');
  lines.push('- Run `npx tsc --noEmit` in `frontend/`.');
  lines.push('- Re-render the target page; confirm visually that each pinned critique is addressed.');
  lines.push('- Emit a BuildManifest with `files_modified`, `ui_components_modified`, and `validation_results` per CLAUDE.md.');
  lines.push('- Update `PROGRESS.md` with the change list and a one-line verification statement.');
  lines.push('');

  lines.push('## Acceptance criteria');
  critiques.forEach((c, idx) => {
    const ac = c.expected_outcome ? c.expected_outcome : `Critique #${idx + 1} (${c.kind}) is no longer visible at the pinned region.`;
    lines.push(`- [ ] ${idx + 1}. ${ac}`);
  });
  lines.push('');

  return lines.join('\n');
}

function kindBadge(kind: string): string {
  return `[${kind}]`;
}

function joinUrl(origin: string, route: string): string {
  if (!origin) return route;
  const o = origin.replace(/\/$/, '');
  const r = route.startsWith('/') ? route : `/${route}`;
  return `${o}${r}`;
}
