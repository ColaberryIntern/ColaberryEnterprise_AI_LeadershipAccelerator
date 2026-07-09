/**
 * componentBackfill — migrates the 36 existing curriculum types into fully-formed
 * AI Components by generating a coherent default prompt bundle from each type's
 * own metadata (label, render_band, competencies, difficulty). Deterministic and
 * idempotent: by default only fills EMPTY prompt fields, so author edits are never
 * clobbered. Refreshes cost/token/runtime estimates for every component.
 */
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import { estimateComponent } from './costEstimationService';
import { capabilitiesFromLegacyFlags } from './capabilityRegistry';
import { templateThumbnail } from './thumbnailService';

function defaultPrompts(c: CurriculumTypeDefinition) {
  const label = c.student_label || c.label;
  const band = c.render_band || 'overview';
  const comps = Array.isArray(c.competencies) && c.competencies.length
    ? c.competencies.map((x: any) => x.domain_id || x).join(', ')
    : 'AI systems architecture';
  return {
    design_prompt:
      `Design a "${label}" learning experience for an AI Systems Architect student. Define the learning goal, the ` +
      `single big idea, the interaction model (${band}), and the evidence of mastery. Competencies: ${comps}. ` +
      `Difficulty: ${c.difficulty || 'core'}.`,
    generation_prompt:
      `You are generating a "${label}" learning card for an AI Systems Architect student.\n` +
      `Topic: {{topic}}. Week: {{week}}. Cohort context: {{cohort}}.\n` +
      `Produce the ${label} content in the "${band}" style. Keep it concrete, hands-on, and mapped to the competencies: ${comps}.\n` +
      `Difficulty: ${c.difficulty || 'core'}.`,
    renderer_prompt:
      `Render the following ${label} as a "${band}" card for the student feed. Output clean, self-contained HTML ` +
      `(no scripts) with a clear heading, body, and a single call-to-action. Content:\n{{content}}`,
    evaluation_prompt:
      `Evaluate the student's submission for this ${label}. Score 0-100 against: correctness, depth, and ` +
      `application of ${comps}. Return JSON { "score": number, "strengths": string[], "gaps": string[], "next_step": string }.\n` +
      `Submission:\n{{submission}}`,
    reflection_prompt:
      `Ask the student one sharp reflection question about their "${label}" on {{topic}} that surfaces their ` +
      `understanding of ${comps}. Then, given their answer {{answer}}, give a 2-sentence coaching response.`,
    github_prompt: c.github_required
      ? `Analyze the student's GitHub repository {{repo}} for this ${label}. Check for: working code, tests, a README, ` +
        `and commit hygiene. Return JSON { "passed": boolean, "evidence": string[], "issues": string[] }.`
      : null,
    improvement_prompt:
      `Review this ${label} component's content and suggest 3 concrete improvements to make it more effective for ` +
      `teaching ${comps}. Be specific and actionable.\nContent:\n{{content}}`,
  };
}

function defaultVariableKeys(c: CurriculumTypeDefinition): string[] {
  const base = ['topic', 'week', 'cohort'];
  if (c.evidence_required) base.push('submission', 'content');
  if (c.github_required) base.push('repo');
  return base;
}

export async function backfillComponents(force = false): Promise<{ processed: number; filled: number }> {
  const rows = await CurriculumTypeDefinition.findAll();
  let filled = 0;
  for (const c of rows) {
    const dp = defaultPrompts(c);
    const patch: Record<string, any> = {};
    const setIf = (field: keyof CurriculumTypeDefinition, val: any) => {
      if (val != null && (force || !(c as any)[field])) patch[field] = val;
    };
    setIf('design_prompt', dp.design_prompt);
    setIf('generation_prompt', dp.generation_prompt);
    setIf('renderer_prompt', dp.renderer_prompt);
    setIf('evaluation_prompt', dp.evaluation_prompt);
    setIf('reflection_prompt', dp.reflection_prompt);
    setIf('github_prompt', dp.github_prompt);
    setIf('improvement_prompt', dp.improvement_prompt);
    if (force || !(Array.isArray(c.variable_keys) && c.variable_keys.length)) patch.variable_keys = defaultVariableKeys(c);
    // compose capability modules from the 5 legacy flags (idempotent seed).
    if (force || !(Array.isArray(c.capabilities) && c.capabilities.length)) patch.capabilities = capabilitiesFromLegacyFlags(c.toJSON() as any);
    if (force || !c.category) patch.category = c.render_band ? String(c.render_band).split('_')[0] : 'learn';
    if (force || !(Array.isArray(c.architect_domains) && c.architect_domains.length)) {
      patch.architect_domains = (Array.isArray(c.competencies) ? c.competencies.map((x: any) => x.domain_id || x) : []).slice(0, 4);
    }
    // Output contracts (explicit I/O) derived from capabilities/flags.
    if (force || !c.evaluation_type) patch.evaluation_type = c.ai_evaluation ? 'ai' : c.instructor_review ? 'instructor' : 'none';
    if (force || !(c.completion_rules && Object.keys(c.completion_rules).length)) patch.completion_rules = { on: c.evidence_required ? 'submit' : 'view' };
    if (force || !(Array.isArray(c.evidence_produced) && c.evidence_produced.length)) patch.evidence_produced = c.evidence_required ? ['submission'] : [];
    if (force || !(Array.isArray(c.artifacts_produced) && c.artifacts_produced.length)) patch.artifacts_produced = c.can_create_artifacts ? ['artifact'] : [];
    if (force || !(Array.isArray(c.portfolio_assets) && c.portfolio_assets.length)) patch.portfolio_assets = c.portfolio_eligible ? ['portfolio_entry'] : [];
    if (force || !(Array.isArray(c.github_assets) && c.github_assets.length)) patch.github_assets = c.github_required ? ['repo'] : [];
    if (force || !(Array.isArray(c.inputs) && c.inputs.length)) patch.inputs = (patch.variable_keys || c.variable_keys || []).map((k: string) => ({ key: k, type: 'string', required: true }));
    if (force || !(Array.isArray(c.outputs) && c.outputs.length)) patch.outputs = [{ key: 'content', type: 'html', description: 'Rendered student content' }];
    if (force || !c.thumbnail_url) patch.thumbnail_url = templateThumbnail(c.toJSON() as any);

    // always refresh estimates off the merged state
    const est = estimateComponent({ ...c.toJSON(), ...patch } as any);
    Object.assign(patch, { est_input_tokens: est.input_tokens, est_output_tokens: est.output_tokens, est_cost_usd: est.cost_usd, est_runtime_ms: est.runtime_ms });

    if (Object.keys(patch).length) { await c.update(patch); filled += 1; }
  }
  return { processed: rows.length, filled };
}
