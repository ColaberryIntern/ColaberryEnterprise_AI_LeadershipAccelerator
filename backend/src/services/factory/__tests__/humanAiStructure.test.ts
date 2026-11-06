import { evaluateHumanAiStructure, type StructureInput } from '../humanAiStructure';
import { INPACT_DIMENSIONS } from '../../../modules/delivery/inpact';
import type {
  FactoryTask, Assignment, AllocationRow, AgentTeam, Surface,
} from '../contracts/factoryContract';

const task = (id: string): FactoryTask => ({
  id,
  process_id: 'PROC-1',
  title: id,
  description: '',
  kind: 'TASK',
  stage_id: 'S1',
  source_evidence: ['b1'],
  required_skills: [],
  judgment_level: 'low',
  decision_authority: 'none',
  data_sensitivity: 'internal',
  interaction_pattern: null,
  frequency: null,
  effort_minutes: null,
  effort_basis: 'UNKNOWN',
  confidence: null,
  method: 'EXPLICIT',
});

const alloc = (task_id: string, execution_class: AllocationRow['execution_class']): AllocationRow => ({
  task_id, execution_class, rationale: 'because', accountable_role_id: 'role-lead',
});

const assign = (
  task_id: string,
  role_id: string,
  type: 'person' | 'agent',
  responsibility: Assignment['responsibility'] = 'PERFORMER',
): Assignment => ({
  id: `a-${task_id}-${role_id}-${responsibility}`,
  task_id,
  role_id,
  responsibility,
  executor: { type, id: 'x' },
  minutes: null,
  basis: 'UNKNOWN',
  evidence_note: null,
});

const team = (over: Partial<AgentTeam> = {}): AgentTeam => ({
  id: 'team-compliance',
  name: 'Compliance',
  subject: 'compliance',
  task_ids: ['t-ai'],
  approver_role_id: 'role-lead',
  execution_policy: 'agent_with_review',
  approval_policy: 'internal_review',
  autonomy_stage: 'autonomy:R3',
  trust_dimensions: ['permitted', 'transparent'],
  ...over,
});

const surface = (over: Partial<Surface> = {}): Surface => ({
  id: 'surf-console', name: 'Operator console', kind: 'console', task_ids: ['t-human'], ...over,
});

/** A project that satisfies every rule: one AI task in one team, one human task on one console. */
const clean = (): StructureInput => ({
  tasks: [task('t-ai'), task('t-human')],
  allocation: [alloc('t-ai', 'ai_with_approval'), alloc('t-human', 'human')],
  assignments: [assign('t-ai', 'role-agent', 'agent'), assign('t-human', 'role-lead', 'person')],
  agent_teams: [team()],
  surfaces: [surface()],
});

describe('evaluateHumanAiStructure', () => {
  it('passes a correctly structured project', () => {
    const r = evaluateHumanAiStructure(clean());
    expect(r.blockingFindings).toEqual([]);
    expect(r.passes).toBe(true);
    expect(r.structured).toBe(true);
    expect(r.consoleCount).toBe(1);
  });

  describe('absence is reported, never passed', () => {
    it('refuses a project that declared no teams and no surfaces', () => {
      // THE FALSE ZERO THIS MODULE EXISTS FOR. Four production decompositions predate these
      // fields, so "no findings" for an undeclared structure would read as a clean bill.
      const r = evaluateHumanAiStructure({
        tasks: [task('t-ai')],
        allocation: [alloc('t-ai', 'ai_autonomous')],
        assignments: [],
      });
      expect(r.structured).toBe(false);
      expect(r.passes).toBe(false);
      expect(r.findings.some((f) => f.rule === 'STRUCTURE_ABSENT')).toBe(true);
    });

    it('does not report orphan AI tasks when nothing was declared, to avoid double-counting', () => {
      const r = evaluateHumanAiStructure({
        tasks: [task('t-ai')], allocation: [alloc('t-ai', 'ai_autonomous')], assignments: [],
      });
      expect(r.findings.some((f) => f.rule === 'AI_TASK_WITHOUT_TEAM')).toBe(false);
    });

    it('an empty declared structure IS structured, and still fails on the orphan', () => {
      const r = evaluateHumanAiStructure({
        tasks: [task('t-ai')], allocation: [alloc('t-ai', 'ai_autonomous')],
        assignments: [], agent_teams: [], surfaces: [],
      });
      expect(r.structured).toBe(true);
      expect(r.aiTasksWithoutTeam).toEqual(['t-ai']);
      expect(r.findings.some((f) => f.rule === 'AI_TASK_WITHOUT_TEAM')).toBe(true);
    });
  });

  describe('the generic blob', () => {
    it('refuses a team with no subject', () => {
      const i = clean();
      i.agent_teams = [team({ subject: '  ' })];
      expect(evaluateHumanAiStructure(i).findings.some((f) => f.rule === 'SUBJECT_REQUIRED')).toBe(true);
    });

    it('refuses two teams claiming the same subject, ignoring case and padding', () => {
      const i = clean();
      i.agent_teams = [team(), team({ id: 'team-b', name: 'B', subject: ' Compliance ', task_ids: [] })];
      expect(evaluateHumanAiStructure(i).findings.some((f) => f.rule === 'SUBJECT_UNIQUE')).toBe(true);
    });

    it('refuses the same task claimed by two teams', () => {
      const i = clean();
      i.agent_teams = [team(), team({ id: 'team-b', name: 'B', subject: 'pricing' })];
      expect(evaluateHumanAiStructure(i).findings.some((f) => f.rule === 'TASK_ONE_TEAM')).toBe(true);
    });

    it('reports every AI task that belongs to no team', () => {
      const i = clean();
      i.tasks.push(task('t-orphan'));
      i.allocation.push(alloc('t-orphan', 'ai_autonomous'));
      const r = evaluateHumanAiStructure(i);
      expect(r.aiTasksWithoutTeam).toEqual(['t-orphan']);
      expect(r.passes).toBe(false);
    });

    it('refuses a team that claims work classed human', () => {
      const i = clean();
      i.agent_teams = [team({ task_ids: ['t-ai', 't-human'] })];
      expect(evaluateHumanAiStructure(i).findings.some((f) => f.rule === 'TEAM_CLAIMS_HUMAN_TASK')).toBe(true);
    });
  });

  describe('oversight', () => {
    it('refuses a reviewed team with no human approver', () => {
      const i = clean();
      i.agent_teams = [team({ approver_role_id: null })];
      const f = evaluateHumanAiStructure(i).findings.find((x) => x.rule === 'APPROVER_MISSING');
      expect(f?.severity).toBe('blocking');
    });

    it('refuses an approver role under which an agent HOLDS the approval', () => {
      // The violation the rule is for: a system signing off. Narrowed on 2026-11-06 from "an agent
      // appears anywhere under this role" to "an agent holds APPROVER or ACCOUNTABLE under it".
      const i = clean();
      i.assignments = [...i.assignments, assign('t-ai', 'role-agent', 'agent', 'APPROVER')];
      i.agent_teams = [team({ approver_role_id: 'role-agent' })];
      const f = evaluateHumanAiStructure(i).findings.find((x) => x.rule === 'APPROVER_IS_AGENT');
      expect(f?.severity).toBe('blocking');
    });

    it('WARNS, not blocks, when the approver role is merely shared with an agent performer', () => {
      // THE 6 NOV PRODUCTION CASE. `role-proposal_manager` had an AGENT as PERFORMER on two tasks
      // and a PERSON as APPROVER on three. The old rule called that "a system may never be the
      // approver", which was false — the oversight was a person's. Promoting the old rule to
      // blocking on this evidence would have rejected a sound decomposition over a role label.
      const i = clean();
      i.assignments = [...i.assignments, assign('t-ai', 'role-agent', 'person', 'APPROVER')];
      i.agent_teams = [team({ approver_role_id: 'role-agent' })];
      const r = evaluateHumanAiStructure(i);
      expect(r.findings.some((f) => f.rule === 'APPROVER_IS_AGENT')).toBe(false);
      const shared = r.findings.find((f) => f.rule === 'APPROVER_ROLE_SHARED_WITH_AGENT');
      expect(shared?.severity).toBe('warning');
      expect(r.blockingFindings).toEqual([]);
    });

    it('says nothing when the approver role has no agent under it at all', () => {
      // The control. Without this, both findings above could be firing on the fixture rather than
      // on the condition they name.
      const r = evaluateHumanAiStructure(clean());
      expect(r.findings.some((f) => f.rule === 'APPROVER_IS_AGENT')).toBe(false);
      expect(r.findings.some((f) => f.rule === 'APPROVER_ROLE_SHARED_WITH_AGENT')).toBe(false);
    });

    it('warns rather than blocks when an autonomous team has no approver', () => {
      // Somebody CHOSE autonomy. The choice must be visible; it is not automatically an error.
      const i = clean();
      i.agent_teams = [team({
        approver_role_id: null,
        execution_policy: 'agent_autonomous',
        trust_dimensions: [...INPACT_DIMENSIONS],
      })];
      const r = evaluateHumanAiStructure(i);
      expect(r.findings.find((f) => f.rule === 'APPROVER_MISSING')?.severity).toBe('warning');
      expect(r.passes).toBe(true);
    });
  });

  describe('trust fails closed, matching Gate 5', () => {
    it('refuses an autonomous team that has not addressed all six INPACT dimensions', () => {
      const i = clean();
      i.agent_teams = [team({ execution_policy: 'agent_autonomous', trust_dimensions: ['permitted'] })];
      const f = evaluateHumanAiStructure(i).findings.find((x) => x.rule === 'TRUST_INCOMPLETE_FOR_AUTONOMOUS');
      expect(f?.severity).toBe('blocking');
      expect(f?.detail).toContain('5 INPACT dimension(s) unaddressed');
    });

    it('accepts an autonomous team that addressed all six', () => {
      const i = clean();
      i.agent_teams = [team({
        execution_policy: 'agent_autonomous', trust_dimensions: [...INPACT_DIMENSIONS],
      })];
      expect(evaluateHumanAiStructure(i).passes).toBe(true);
    });

    it('does NOT demand all six of a reviewed team, because a human is in the loop', () => {
      expect(evaluateHumanAiStructure(clean()).passes).toBe(true);
    });

    it('refuses a dimension that is not one of the book\'s six', () => {
      const i = clean();
      i.agent_teams = [team({ trust_dimensions: ['instantaneous' as never] })];
      expect(evaluateHumanAiStructure(i).findings.some((f) => f.rule === 'TRUST_DIMENSION_UNKNOWN')).toBe(true);
    });
  });

  describe('autonomy stage', () => {
    it('refuses a bare R3, which is a delivery RISK tier and not an autonomy level', () => {
      const i = clean();
      i.agent_teams = [team({ autonomy_stage: 'R3' as never })];
      expect(evaluateHumanAiStructure(i).findings.some((f) => f.rule === 'AUTONOMY_STAGE_UNKNOWN')).toBe(true);
    });

    it('warns, without blocking, when the stage has never been assessed', () => {
      const i = clean();
      i.agent_teams = [team({ autonomy_stage: null })];
      const r = evaluateHumanAiStructure(i);
      expect(r.findings.find((f) => f.rule === 'AUTONOMY_STAGE_UNASSESSED')?.severity).toBe('warning');
      expect(r.passes).toBe(true);
    });
  });

  describe('one console', () => {
    it('refuses a second console, because every console past the first is a login', () => {
      const i = clean();
      i.surfaces = [surface(), surface({ id: 'surf-2', name: 'Pricing console', task_ids: [] })];
      const r = evaluateHumanAiStructure(i);
      expect(r.consoleCount).toBe(2);
      expect(r.findings.some((f) => f.rule === 'ONE_CONSOLE')).toBe(true);
    });

    it('allows an external surface alongside the console, because some work is genuinely elsewhere', () => {
      const i = clean();
      i.tasks.push(task('t-submit'));
      i.allocation.push(alloc('t-submit', 'human'));
      i.surfaces = [surface(), surface({
        id: 'surf-city', name: 'City procurement portal', kind: 'external', task_ids: ['t-submit'],
      })];
      const r = evaluateHumanAiStructure(i);
      expect(r.consoleCount).toBe(1);
      expect(r.passes).toBe(true);
    });

    it('reports every human task that lands nowhere', () => {
      const i = clean();
      i.tasks.push(task('t-sign'));
      i.allocation.push(alloc('t-sign', 'human'));
      const r = evaluateHumanAiStructure(i);
      expect(r.humanTasksWithoutSurface).toEqual(['t-sign']);
      expect(r.passes).toBe(false);
    });
  });

  it('ignores a task with no allocation rather than guessing a side for it', () => {
    // The allocation gap is real and is reported by the allocation layer. Counting it here too
    // would make the structure look worse than it is, and would imply a class nobody stated.
    const i = clean();
    i.tasks.push(task('t-unknown'));
    const r = evaluateHumanAiStructure(i);
    expect(r.aiTasksWithoutTeam).toEqual([]);
    expect(r.humanTasksWithoutSurface).toEqual([]);
    expect(r.passes).toBe(true);
  });

  it('reports EVERY finding, not just the first', () => {
    const r = evaluateHumanAiStructure({
      tasks: [task('t-ai'), task('t-human')],
      allocation: [alloc('t-ai', 'ai_autonomous'), alloc('t-human', 'human')],
      assignments: [],
      agent_teams: [team({ subject: '', approver_role_id: null, trust_dimensions: [], execution_policy: 'agent_autonomous', task_ids: [] })],
      surfaces: [surface({ task_ids: [] }), surface({ id: 's2', task_ids: [] })],
    });
    const rules = new Set(r.findings.map((f) => f.rule));
    expect(rules.has('SUBJECT_REQUIRED')).toBe(true);
    expect(rules.has('TRUST_INCOMPLETE_FOR_AUTONOMOUS')).toBe(true);
    expect(rules.has('ONE_CONSOLE')).toBe(true);
    expect(rules.has('AI_TASK_WITHOUT_TEAM')).toBe(true);
    expect(rules.has('HUMAN_TASK_WITHOUT_SURFACE')).toBe(true);
    expect(rules.size).toBeGreaterThanOrEqual(5);
  });

  it('is deterministic: the same input twice gives the same findings', () => {
    const a = evaluateHumanAiStructure(clean());
    const b = evaluateHumanAiStructure(clean());
    expect(a).toEqual(b);
  });
});
