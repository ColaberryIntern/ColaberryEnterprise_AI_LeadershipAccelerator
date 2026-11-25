/**
 * ShiftFill v5 (2026-11-21): the cold-built workflow diagram drew Offer Sender's
 * labels on top of each other. Two causes: two hand-off entries for the same
 * pair (one arrow each, same path), and three agents fed from one node with no
 * placement guidance. The hand-offs below are v5's, verbatim.
 */
import { workflowArrows, workflowColumns, fanOuts, agentsTab } from '../commandCenterAgentsTab';
import { commandCenterTabSections } from '../commandCenterTabs';
import { BuildPlan, PlanAgent } from '../planContract';

const V5 = [
  { from_agent: 'Gap Creator', to_agent: 'Hygienist Ranker', via: 'Gap record' },
  { from_agent: 'Hygienist Ranker', to_agent: 'Offer Sender', via: 'Ranked hygienist list' },
  { from_agent: 'Offer Sender', to_agent: 'Notification Manager', via: 'Shift acceptance' },
  { from_agent: 'Offer Sender', to_agent: 'Summary Generator', via: 'Shift acceptance' },
  { from_agent: 'Offer Sender', to_agent: 'Summary Generator', via: 'Unaccepted shift' },
  { from_agent: 'Offer Sender', to_agent: 'Uncertainty Flag', via: 'Unaccepted shift' },
];

describe('one arrow per pair of agents', () => {
  it('folds two things passed between the same agents into one labelled arrow', () => {
    const arrows = workflowArrows(V5);
    expect(arrows).toHaveLength(5);
    expect(arrows.find((a) => a.to === 'Summary Generator')!.labels).toEqual(['Shift acceptance', 'Unaccepted shift']);
  });

  it('names the agent that feeds three others as the crowded spot', () => {
    expect(fanOuts(workflowArrows(V5))).toEqual([{ from: 'Offer Sender', count: 3 }]);
  });

  it('finds no crowded spot in a simple chain', () => {
    expect(fanOuts(workflowArrows(V5.slice(0, 2)))).toEqual([]);
  });

  it('is empty for no hand-offs, and does not repeat a label passed twice', () => {
    expect(workflowArrows([])).toEqual([]);
    expect(workflowArrows([V5[0], { ...V5[0] }])[0].labels).toEqual(['Gap record']);
  });
});

describe('the Story 000 agents tab', () => {
  const agent = (name: string, inputs: string[], outputs: string[]): PlanAgent => ({
    id: name, name, purpose: 'p', trigger_type: 'event', trigger: 't', inputs, outputs,
    autonomy_level: 'acts_autonomously', approval_gates: [], escalation_rules: [], skills: [], owns: ['STORY-001'],
  });
  const plan: BuildPlan = {
    project_name: 'ShiftFill', descriptor: 'd', requirements: [],
    releases: [{ key: 'r0', name: 'r0', goal: 'g', demo: 'd', week_start: 1, week_end: 1 }],
    stories: [{ id: 'STORY-001', release: 'r0', title: 't', narrative: 'As Dana, I want x, so y.', fulfills: [],
      owner_agent: 'Offer Sender', acceptance: ['Given a, when b, then c.'], task_guidance: 'g', failure_paths: ['f'] }],
    agents: [
      agent('Offer Sender', [], ['Shift acceptance', 'Unaccepted shift']),
      agent('Notification Manager', ['Shift acceptance'], []),
      agent('Summary Generator', ['Shift acceptance', 'Unaccepted shift'], []),
      agent('Uncertainty Flag', ['Unaccepted shift'], []),
    ],
  };
  const text = commandCenterTabSections(plan).join('\n');

  it('lists the pair once, with both labels', () => {
    expect(text).toContain('Offer Sender → Summary Generator (Shift acceptance, Unaccepted shift)');
    expect(text).not.toContain('Offer Sender → Summary Generator (Unaccepted shift)');
  });

  it('flags the crowded spot and asks for labels that never overlap', () => {
    expect(text).toContain('Crowded spots: Offer Sender feeds 3 agents');
    expect(text).toMatch(/ONE arrow per pair of agents/);
    expect(text).toMatch(/no label overlaps another label, an arrow or a node/);
  });

  it('asks for agent cards whose words never break and whose badges stay inside', () => {
    expect(text).toMatch(/each label sits above its value, or the value column gets at least half the card width/);
    expect(text).toMatch(/no word ever breaks mid-word/);
    expect(text).toMatch(/badges and pills stay inside the card/);
  });

  it('says nothing about crowding when there are no hand-offs', () => {
    expect(agentsTab).toBeInstanceOf(Function);
    const lone = { ...plan, agents: [agent('Offer Sender', [], ['x'])] };
    expect(commandCenterTabSections(lone).join('\n')).not.toContain('Crowded spots');
  });
});

describe('workflowColumns', () => {
  const arrow = (from: string, to: string) => ({ from, to, labels: ['x'] });

  it('places each agent after the furthest one that feeds it, and sets loners apart', () => {
    expect(workflowColumns(
      ['Opener', 'Guard', 'Ranker', 'Dispatcher', 'Summarizer'],
      [arrow('Opener', 'Summarizer'), arrow('Opener', 'Ranker'), arrow('Ranker', 'Dispatcher'), arrow('Dispatcher', 'Summarizer')],
    )).toEqual({ columns: [['Opener'], ['Ranker'], ['Dispatcher'], ['Summarizer']], apart: ['Guard'] });
  });

  it('terminates on a loop and a self-arrow, and keeps every agent once', () => {
    const { columns, apart } = workflowColumns(['A', 'B', 'C'], [arrow('A', 'B'), arrow('B', 'C'), arrow('C', 'A'), arrow('B', 'B')]);
    expect([...columns.flat(), ...apart].sort()).toEqual(['A', 'B', 'C']);
  });

  it('is empty for no agents and ignores an arrow naming an unknown agent', () => {
    expect(workflowColumns([], [])).toEqual({ columns: [], apart: [] });
    expect(workflowColumns(['A'], [arrow('Ghost', 'A')])).toEqual({ columns: [['A']], apart: [] });
  });
});
