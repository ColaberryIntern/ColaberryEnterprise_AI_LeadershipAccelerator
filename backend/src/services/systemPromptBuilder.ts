/**
 * Blueprint System Prompt builder.
 *
 * Produces a structured, multi-section markdown prompt from the project's
 * stored data: business problem, requirements doc, capabilities, stakeholders,
 * architecture surface. Deterministic — no LLM call. Sections drop out cleanly
 * when their underlying data is empty so the output stays signal-dense.
 *
 * The output is one string suitable for storage in
 * `project.project_variables.system_prompt` (JSONB) and for paste into
 * Claude Code prompts.
 */

import { getProjectByEnrollment } from './projectService';
import { calculateRequirementsProgress } from './projectProgressService';
import { getCapabilityHierarchy } from './projectScopeService';

const DOMAIN_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /lead|pipeline|campaign|sales|revenue/i, label: 'lead generation' },
  { pattern: /train|adopt|learn|curriculum/i, label: 'training' },
  { pattern: /monitor|analytics|report|dashboard/i, label: 'analytics' },
  { pattern: /automat|workflow|agent/i, label: 'automation' },
  { pattern: /engag|feedback|user/i, label: 'user engagement' },
  { pattern: /content|market/i, label: 'content delivery' },
  { pattern: /ship|freight|logistic|carrier|fleet/i, label: 'logistics' },
  { pattern: /compliance|audit|risk|govern/i, label: 'compliance' },
  { pattern: /finance|account|billing|invoice/i, label: 'finance' },
];

function deriveDomains(capNames: string[]): string[] {
  const found = new Set<string>();
  for (const n of capNames) {
    for (const { pattern, label } of DOMAIN_PATTERNS) {
      if (pattern.test(n)) found.add(label);
    }
  }
  return [...found].slice(0, 4);
}

function joinList(items: any): string {
  if (!items) return '';
  if (Array.isArray(items)) return items.filter(Boolean).map(String).join(', ');
  if (typeof items === 'string') return items.trim();
  if (typeof items === 'object') return Object.values(items).filter(Boolean).map(String).join(', ');
  return String(items);
}

export async function buildBlueprintSystemPrompt(enrollmentId: string): Promise<string> {
  const project = await getProjectByEnrollment(enrollmentId);
  if (!project) throw new Error('No project found');

  const vars = (project as any).project_variables || {};
  const lines: string[] = [];

  // Header
  const orgName = (project as any).organization_name || 'This project';
  lines.push(`# ${orgName} — System Prompt`);
  lines.push('');

  // What we're building
  const what = (project as any).primary_business_problem
    || (project as any).executive_summary
    || (project as any).selected_use_case;
  if (what) {
    lines.push('## What we\'re building');
    lines.push(String(what).trim());
    lines.push('');
  }

  // Industry & domain
  let hierarchy: any[] = [];
  try { hierarchy = await getCapabilityHierarchy(project.id); } catch { hierarchy = []; }
  const capNames = hierarchy.map((c: any) => c.name || '');
  const domains = deriveDomains(capNames);
  const industry = (project as any).industry;
  if (industry || domains.length > 0) {
    lines.push('## Industry & domain');
    const parts: string[] = [];
    if (industry) parts.push(String(industry));
    if (domains.length > 0) parts.push(domains.join(', '));
    lines.push(parts.join(' · '));
    lines.push('');
  }

  // Core capabilities — top 8 by completion desc, name asc as tiebreaker
  if (hierarchy.length > 0) {
    const sorted = [...hierarchy].sort((a: any, b: any) => {
      const ac = a.completion_pct || 0; const bc = b.completion_pct || 0;
      if (ac !== bc) return bc - ac;
      return (a.name || '').localeCompare(b.name || '');
    });
    const top = sorted.slice(0, 8);
    if (top.length > 0) {
      lines.push('## Core capabilities');
      for (const c of top) {
        const desc = (c.description || '').trim().split(/\.\s|\n/)[0]; // first sentence
        const oneLiner = desc ? ` — ${desc}` : '';
        lines.push(`- **${c.name}**${oneLiner}`);
      }
      lines.push('');
    }
  }

  // Requirements coverage
  let reqProgress: any = null;
  try { reqProgress = await calculateRequirementsProgress(enrollmentId); } catch { reqProgress = null; }
  if (reqProgress && reqProgress.total > 0) {
    lines.push('## Requirements coverage');
    lines.push(`- Total: **${reqProgress.completed}/${reqProgress.total}** requirements complete (${reqProgress.completion_percentage}%) across ${reqProgress.sections.length} section${reqProgress.sections.length === 1 ? '' : 's'}.`);
    if (reqProgress.sections.length > 0) {
      const topSections = [...reqProgress.sections].sort((a: any, b: any) => b.total - a.total).slice(0, 5);
      lines.push(`- Sections: ${topSections.map((s: any) => `${s.name} (${s.completed}/${s.total})`).join(', ')}.`);
    }
    if (reqProgress.current_phase) {
      lines.push(`- Current phase: **${reqProgress.current_phase}**.`);
    }
    const stage = (project as any).project_stage;
    if (stage) lines.push(`- Project stage: ${stage}.`);
    lines.push('');
  }

  // Stakeholders & constraints (from project_variables, set during discovery)
  const ctxBits: Array<{ label: string; value: string }> = [];
  const stakeholders = joinList(vars.stakeholders);
  if (stakeholders) ctxBits.push({ label: 'Stakeholders', value: stakeholders });
  const successMetrics = joinList(vars.success_metrics);
  if (successMetrics) ctxBits.push({ label: 'Success metrics', value: successMetrics });
  const constraints = joinList(vars.constraints);
  if (constraints) ctxBits.push({ label: 'Constraints', value: constraints });
  const timeline = joinList(vars.timeline);
  if (timeline) ctxBits.push({ label: 'Timeline', value: timeline });
  const dataSources = joinList(vars.data_sources);
  if (dataSources) ctxBits.push({ label: 'Data sources', value: dataSources });
  const automationGoal = (project as any).automation_goal;
  if (automationGoal) ctxBits.push({ label: 'Automation goal', value: String(automationGoal).trim() });
  if (ctxBits.length > 0) {
    lines.push('## Stakeholders & constraints');
    for (const b of ctxBits) lines.push(`- **${b.label}:** ${b.value}`);
    lines.push('');
  }

  // Architecture surface — counts derived from hierarchy
  if (hierarchy.length > 0) {
    let pageBPCount = 0;
    let processBPCount = 0;
    let agentBPCount = 0;
    for (const c of hierarchy) {
      const src = (c.source || '').toLowerCase();
      const name = (c.name || '').toLowerCase();
      if (src === 'frontend_page' || /page$/i.test(name)) pageBPCount++;
      else if (/agent|automation|monitor/i.test(name)) agentBPCount++;
      else processBPCount++;
    }
    lines.push('## Architecture surface');
    lines.push(`- Pages: ${pageBPCount}`);
    lines.push(`- Process capabilities: ${processBPCount}`);
    lines.push(`- Agent / automation capabilities: ${agentBPCount}`);
    lines.push(`- Total capabilities: ${hierarchy.length}`);
    lines.push('');
  }

  // Verbatim requirements — top 10 by section/key for grounding
  if (reqProgress && reqProgress.requirements && reqProgress.requirements.length > 0) {
    const top = reqProgress.requirements.slice(0, 10);
    lines.push('## Verbatim requirements (sample)');
    top.forEach((r: any, i: number) => {
      const text = (r.text || '').trim();
      if (text) lines.push(`${i + 1}. ${text}`);
    });
    if (reqProgress.requirements.length > 10) {
      lines.push(`…and ${reqProgress.requirements.length - 10} more.`);
    }
    lines.push('');
  }

  // Footer
  lines.push(`*(generated ${new Date().toISOString().slice(0, 10)} from project state — edit freely; saved to project_variables.system_prompt)*`);

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
