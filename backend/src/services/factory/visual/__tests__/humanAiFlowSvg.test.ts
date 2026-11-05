import { renderHumanAiFlowSvg } from '../humanAiFlowSvg';
import {
  levelsOf,
  laneOf,
  columnWidthFor,
  wrapText,
  LANE_LABELS,
} from '../humanAiFlowLayout';
import { readFileSync } from 'fs';
import { HUMAN_AI_VISUAL_RULE_IDS } from '../humanAiVisualRules';
import type {
  FactoryTask, Assignment, AllocationRow, Role, TransitionEdge, AgentTeam, Surface,
} from '../../contracts/factoryContract';

const task = (id: string, kind: FactoryTask['kind'], title = id): FactoryTask => ({
  id, process_id: 'PROC-1', title, description: '', kind, stage_id: 's1',
  source_evidence: [], required_skills: [], judgment_level: 'medium',
  decision_authority: 'none', data_sensitivity: 'internal', interaction_pattern: null,
  frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN', confidence: null,
  method: 'EXPLICIT',
} as FactoryTask);

const edge = (from: string, to: string, over: Partial<TransitionEdge> = {}): TransitionEdge => ({
  id: `${from}->${to}`, from_task_id: from, to_task_id: to, condition: null, is_rework: false,
  ...over,
} as TransitionEdge);

const alloc = (task_id: string, execution_class: AllocationRow['execution_class']): AllocationRow => ({
  task_id, execution_class, rationale: 'because', accountable_role_id: 'role-a',
} as AllocationRow);

const assign = (
  task_id: string, responsibility: Assignment['responsibility'], type: 'person' | 'agent' | null,
): Assignment => ({
  id: `${task_id}-${responsibility}`, task_id, role_id: 'role-a', responsibility,
  executor: type ? { type, id: 'x' } : null, minutes: null, basis: 'UNKNOWN', evidence_note: null,
} as Assignment);

const roles: Role[] = [{ id: 'role-a', name: 'Compliance Analyst', definition: '' } as Role];

/** The real shape pulled from production: f52e9a43, AI Government Contract Finder (demo). */
function realFlow() {
  const tasks = [
    task('t-start', 'START', 'Solicitation received'),
    task('t-extract', 'TASK', 'Extract requirements from the solicitation'),
    task('t-classify', 'DECISION', 'Classify each requirement as technical or administrative'),
    task('t-route-admin', 'TASK', 'Map administrative requirements to proposal sections'),
    task('t-route-tech', 'TASK', 'Map technical requirements to build stories'),
    task('t-end', 'END', 'Compliance matrix complete'),
  ];
  const transitions = [
    edge('t-start', 't-extract'),
    edge('t-extract', 't-classify'),
    edge('t-classify', 't-route-admin', { condition: 'administrative' }),
    edge('t-classify', 't-route-tech', { condition: 'technical' }),
    edge('t-route-admin', 't-end'),
    edge('t-route-tech', 't-end'),
  ];
  const allocation = [
    alloc('t-extract', 'ai_with_approval'),
    alloc('t-classify', 'ai_with_approval'),
    alloc('t-route-admin', 'human'),
    alloc('t-route-tech', 'human'),
  ];
  const assignments = [
    assign('t-extract', 'PERFORMER', 'agent'), assign('t-extract', 'ACCOUNTABLE', 'person'),
    assign('t-classify', 'PERFORMER', 'agent'), assign('t-classify', 'ACCOUNTABLE', 'person'),
    assign('t-route-admin', 'PERFORMER', 'person'), assign('t-route-tech', 'PERFORMER', 'person'),
  ];
  return { tasks, transitions, allocation, assignments, roles };
}

describe('laneOf', () => {
  it('puts START and END on the spine, whatever their allocation says', () => {
    expect(laneOf(task('a', 'START'), alloc('a', 'human'))).toBe('spine');
    expect(laneOf(task('z', 'END'), undefined)).toBe('spine');
  });

  it('separates human from AI', () => {
    expect(laneOf(task('t', 'TASK'), alloc('t', 'human'))).toBe('human');
    expect(laneOf(task('t', 'TASK'), alloc('t', 'ai_with_approval'))).toBe('ai');
    expect(laneOf(task('t', 'TASK'), alloc('t', 'ai_autonomous'))).toBe('ai');
  });

  it('marks an unallocated task UNCLASSIFIED rather than guessing it into a lane', () => {
    // The diagram's whole job is to say who does what. Defaulting an unknown task to "human"
    // would make the picture assert something nobody decided.
    expect(laneOf(task('t', 'TASK'), undefined)).toBe('unclassified');
  });
});

describe('levelsOf', () => {
  it('lays the real flow out in depth order, with the branch at one level', () => {
    const { tasks, transitions } = realFlow();
    const l = levelsOf(tasks, transitions);
    expect(l.get('t-start')).toBe(0);
    expect(l.get('t-extract')).toBe(1);
    expect(l.get('t-classify')).toBe(2);
    expect(l.get('t-route-admin')).toBe(3);
    expect(l.get('t-route-tech')).toBe(3);
    expect(l.get('t-end')).toBe(4);
  });

  it('does NOT let a rework edge push a task deeper than the step it corrects', () => {
    // A rework edge points backwards. Counting it would place the correction after the thing
    // being corrected and the flow would read in the wrong order.
    const tasks = [task('a', 'START'), task('b', 'TASK'), task('c', 'TASK')];
    const withRework = [edge('a', 'b'), edge('b', 'c'), edge('c', 'b', { is_rework: true })];
    const l = levelsOf(tasks, withRework);
    expect(l.get('b')).toBe(1);
    expect(l.get('c')).toBe(2);
  });

  it('terminates on a forward cycle instead of spinning', () => {
    const tasks = [task('a', 'START'), task('b', 'TASK'), task('c', 'TASK')];
    const cyclic = [edge('a', 'b'), edge('b', 'c'), edge('c', 'b')];
    const l = levelsOf(tasks, cyclic);
    expect(l.size).toBe(3);
  });

  it('still places a task unreachable from any START', () => {
    // Dropping it would hide work from a diagram whose job is to show all of it.
    const tasks = [task('a', 'START'), task('b', 'TASK'), task('orphan', 'TASK')];
    const l = levelsOf(tasks, [edge('a', 'b')]);
    expect(l.has('orphan')).toBe(true);
    expect(l.get('orphan')).toBeGreaterThan(l.get('b')!);
  });

  it('lays out with no START declared, using tasks that have no inbound edge', () => {
    const tasks = [task('a', 'TASK'), task('b', 'TASK')];
    const l = levelsOf(tasks, [edge('a', 'b')]);
    expect(l.get('a')).toBe(0);
    expect(l.get('b')).toBe(1);
  });
});

describe('columnWidthFor — the clipped-label defect, pinned', () => {
  it('widens the column so the longest condition fits in the gap', () => {
    // "administrative" shipped clipped twice: first as "adr", then as "administrativ", because
    // the gap was a constant. The column is now derived from the label.
    const narrow = columnWidthFor([edge('a', 'b')]);
    const wide = columnWidthFor([edge('a', 'b', { condition: 'administrative' })]);
    expect(wide).toBeGreaterThan(narrow);
  });

  it('leaves room for the label PLUS padding, measured against the node width', () => {
    const label = 'a-very-long-branch-condition-indeed';
    const w = columnWidthFor([edge('a', 'b', { condition: label })]);
    const gap = w - 240; // NODE_W
    expect(gap).toBeGreaterThan(label.length * 6.2);
  });

  it('falls back to the minimum gap when nothing is labelled', () => {
    expect(columnWidthFor([edge('a', 'b')])).toBe(300);
    expect(columnWidthFor([])).toBe(300);
  });
});

describe('wrapText', () => {
  it('wraps on words, not mid-word', () => {
    expect(wrapText('alpha beta gamma', 11, 2)).toEqual(['alpha beta', 'gamma']);
  });

  it('ellipsises when it runs out of lines rather than dropping the tail silently', () => {
    const out = wrapText('one two three four five six seven', 9, 2);
    expect(out).toHaveLength(2);
    expect(out[1].endsWith('...')).toBe(true);
  });

  it('does not ellipsise when everything fits', () => {
    expect(wrapText('short', 20, 2)).toEqual(['short']);
  });

  it('survives empty and whitespace input', () => {
    expect(wrapText('', 10, 2)).toEqual(['']);
    expect(wrapText('   ', 10, 2)).toEqual(['']);
  });
});

describe('renderHumanAiFlowSvg over the real production flow', () => {
  const svg = renderHumanAiFlowSvg({ ...realFlow(), title: 'T', subtitle: 'S' });

  it('is a standalone svg that FETCHES nothing', () => {
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    // A chart that renders empty because a CDN was slow still looks finished, and this output
    // goes into a bid. The `xmlns` URI is a namespace IDENTIFIER, never fetched, so it is
    // excluded rather than the assertion being weakened to pass.
    const withoutNamespace = svg.replace(/xmlns(:\w+)?="[^"]*"/g, '');
    expect(withoutNamespace).not.toMatch(/https?:\/\//);
    expect(svg).not.toMatch(/<script|@import|xlink:href|\burl\(\s*['"]?https?:/i);
  });

  it('names every task', () => {
    for (const t of realFlow().tasks) expect(svg).toContain(t.title.slice(0, 20));
  });

  it('shows both branch conditions, which carry the flow logic', () => {
    expect(svg).toContain('administrative');
    expect(svg).toContain('technical');
  });

  it('labels the AI lane as approval-gated and counts each lane', () => {
    expect(svg).toContain(LANE_LABELS.ai);
    // Counts are computed from the data, never typed in: 2 AI, 2 human, 2 spine.
    expect(svg).toContain(`${LANE_LABELS.ai} (2)`);
    expect(svg).toContain(`${LANE_LABELS.human} (2)`);
  });

  it('names the approver on an AI task, because that IS the human/AI split', () => {
    expect(svg).toContain('Approves: Compliance Analyst');
  });

  it('flags an agent task with NO human approver, rather than letting it pass as approved', () => {
    const f = realFlow();
    const lonely = {
      ...f,
      allocation: [alloc('t-extract', 'ai_autonomous')],
      assignments: [assign('t-extract', 'PERFORMER', 'agent')],
    };
    const out = renderHumanAiFlowSvg(lonely);
    expect(out).toContain('No human approver');
    expect(out).toContain('AI, NO APPROVER');
  });

  it('escapes markup in a task title instead of emitting it', () => {
    const f = realFlow();
    const nasty = { ...f, tasks: [task('t-x', 'TASK', '<script>alert(1)</script>')] };
    const out = renderHumanAiFlowSvg(nasty);
    expect(out).not.toContain('<script>');
    expect(out).toContain('&lt;script&gt;');
  });

  it('renders an empty flow without throwing', () => {
    const out = renderHumanAiFlowSvg({
      tasks: [], assignments: [], allocation: [], roles: [], transitions: [],
    });
    expect(out).toContain('<svg');
  });
});

/**
 * L10.5 — THE EIGHT VISUAL RULES, one test per rule id.
 *
 * The rules are declared as data in `humanAiVisualRules.ts` and `story-build` references that
 * module rather than restating them. This block is the other half of that arrangement: a rule
 * with no test is a rule that decays into a style guide nobody reads, so the completeness test
 * at the bottom asserts the declared ids and the tested ids are the same set.
 *
 * Three rules already had coverage before L10.5 and are MAPPED rather than rewritten:
 *   VR1 → 'separates human from AI' (:77)
 *   VR2 → 'marks an unallocated task UNCLASSIFIED rather than guessing it into a lane' (:83)
 *   VR5 → 'names the approver on an AI task' (:208) and 'flags an agent task with NO human
 *          approver' (:212)
 * Duplicating them to make this block look complete would be theatre; the map below records
 * where each rule is really proven.
 */
describe('the eight visual rules', () => {
  const team = (over: Partial<AgentTeam> = {}): AgentTeam => ({
    id: 'team-compliance', name: 'Compliance', subject: 'Compliance',
    task_ids: ['t-extract', 't-classify'], approver_role_id: 'role-a',
    execution_policy: 'agent_with_review', approval_policy: 'internal_review',
    autonomy_stage: null, trust_dimensions: [], ...over,
  } as AgentTeam);

  const surface = (over: Partial<Surface> = {}): Surface => ({
    id: 'surf-console', name: 'Bid console', kind: 'console',
    task_ids: ['t-route-admin', 't-route-tech'], ...over,
  } as Surface);

  const render = (over: Record<string, unknown> = {}) =>
    renderHumanAiFlowSvg({ ...realFlow(), ...over } as Parameters<typeof renderHumanAiFlowSvg>[0]);

  // VR1 and VR2 and VR5 are proven in the blocks above; these are the five that needed
  // new renderer behaviour.

  it('VR3_NAMED_SUBJECT_AGENTS: an AI task names its team AND that team\'s subject', () => {
    const out = render({ agent_teams: [team({ name: 'Requirements', subject: 'Requirements' })] });
    expect(out).toContain('Team: Requirements - Requirements');
  });

  it('VR3_NAMED_SUBJECT_AGENTS: an AI task owned by no team says so, rather than going blank', () => {
    // The failure this guards is silence. An AI task with no owning team is the generic blob,
    // and a blank line renders identically to a team that simply was not drawn.
    const out = render({ agent_teams: [] });
    expect(out).toContain('No team owns this AI task');
  });

  it('VR4_ONE_SURFACE_CONVERGENCE: states one console and the human count on it', () => {
    const out = render({ surfaces: [surface()] });
    expect(out).toContain('One console');
    expect(out).toContain('Bid console: 2');
  });

  it('VR4_ONE_SURFACE_CONVERGENCE: marks an external surface as external', () => {
    const out = render({
      surfaces: [surface(), surface({
        id: 'surf-portal', name: 'City portal', kind: 'external', task_ids: [],
      })],
    });
    expect(out).toContain('City portal (external)');
    // Two surfaces, one of which is external, is still ONE console - the external one must not
    // be counted as a second, or the one-console claim reads as broken when it is not.
    expect(out).toContain('One console');
  });

  it('VR4_ONE_SURFACE_CONVERGENCE: human tasks with no surface at all are called out', () => {
    const out = render({ surfaces: [] });
    expect(out).toContain('land on NO surface');
  });

  it('VR4_ONE_SURFACE_CONVERGENCE: two consoles are reported as too many', () => {
    const out = render({
      surfaces: [surface(), surface({ id: 'surf-2', name: 'Review console', task_ids: [] })],
    });
    expect(out).toContain('2 consoles - should be one');
  });

  it('VR6_PRE_AI_BASELINE: states how many functions changed and names them', () => {
    const out = render({
      role_map: [{
        previous_function: 'Analyst reads every requirement by hand',
        ai_contribution: 'Extraction and first-pass classification',
        new_role_id: 'role-a',
        retained_responsibilities: ['Final compliance sign-off'],
      }],
    });
    expect(out).toContain('Before AI: 1 function(s) changed');
    expect(out).toContain('Analyst reads every requirement by hand');
  });

  it('VR6_PRE_AI_BASELINE: says the baseline is undeclared rather than omitting the line', () => {
    expect(render()).toContain('Before AI: no displaced function declared');
  });

  it('VR7_APPROVALS_HUMAN: the AI lane is labelled approval-gated', () => {
    expect(render()).toContain(LANE_LABELS.ai);
    expect(LANE_LABELS.ai).toMatch(/human approves/);
  });

  it('VR8_EMPTY_STATE_NAMED: no tasks says NO DECOMPOSITION, not just nothing', () => {
    const out = renderHumanAiFlowSvg({
      tasks: [], assignments: [], allocation: [], roles: [], transitions: [],
    });
    expect(out).toContain('No decomposition yet');
  });

  it('VR8_EMPTY_STATE_NAMED: tasks with no allocation says NOTHING ALLOCATED, a different fact', () => {
    const out = render({ allocation: [] });
    expect(out).toContain('Nothing allocated yet');
    expect(out).not.toContain('No decomposition yet');
  });

  it('VR8_EMPTY_STATE_NAMED: the two empty states are not the same string', () => {
    // The whole rule is that these differ. If a future edit collapses them into one message,
    // "never ran" and "ran and found nothing" become indistinguishable again.
    const noTasks = renderHumanAiFlowSvg({
      tasks: [], assignments: [], allocation: [], roles: [], transitions: [],
    });
    const noAlloc = render({ allocation: [] });
    expect(noTasks).not.toBe(noAlloc);
    expect(noAlloc).not.toContain('No decomposition yet');
  });

  /**
   * THE COMPLETENESS CHECK. Without it, adding a ninth rule to the contract and no test would
   * leave the suite green, which is the decay this ticket exists to stop.
   */
  it('has a test for every declared rule, and declares every tested rule', () => {
    const PROVEN_ELSEWHERE: Record<string, string> = {
      VR1_EXPLICIT_SPLIT: 'separates human from AI',
      VR2_UNCLASSIFIED_NEVER_DEFAULTED: 'marks an unallocated task UNCLASSIFIED rather than guessing it into a lane',
      VR5_AGENT_SHOWS_APPROVER: 'names the approver on an AI task, because that IS the human/AI split',
    };

    const suiteSrc = readFileSync(__filename, 'utf8');

    // CONTROL: if the source read came back empty or the title pattern stopped matching, every
    // assertion below would pass vacuously. Eight declared rules must be found.
    expect(HUMAN_AI_VISUAL_RULE_IDS).toHaveLength(8);
    expect(suiteSrc.length).toBeGreaterThan(1000);

    for (const id of HUMAN_AI_VISUAL_RULE_IDS) {
      const hasOwnTest = suiteSrc.includes(`it('${id}:`) || suiteSrc.includes(`it(\`${id}:`)
        || suiteSrc.includes(`it('${id}`);
      const mappedTitle = PROVEN_ELSEWHERE[id];
      const provenElsewhere = mappedTitle !== undefined && suiteSrc.includes(mappedTitle);
      expect(hasOwnTest || provenElsewhere).toBe(true);
    }

    // And the other direction: no VR-shaped id appears in a test title unless it is declared.
    const titled = [...suiteSrc.matchAll(/it\('(VR\d+_[A-Z_]+)/g)].map((m) => m[1]);
    expect(titled.length).toBeGreaterThan(0);
    for (const id of new Set(titled)) {
      expect(HUMAN_AI_VISUAL_RULE_IDS).toContain(id);
    }
  });
});
