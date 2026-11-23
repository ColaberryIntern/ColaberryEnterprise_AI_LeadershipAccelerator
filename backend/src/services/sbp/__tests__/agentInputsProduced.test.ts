/**
 * ShiftFill v7 (2026-11-22, project 99bca55a): Schedule Updater, Summary
 * Reporter and Performance Monitor read "Shift acceptance", and no agent
 * produced it. Shift Offer Sender handled the replies but output only the offer.
 * The inputs and outputs below are v7's, verbatim.
 */
import { unproducedInputs, handoffsFor } from '../planDocumentInsights';
import { commandCenterTabSections } from '../commandCenterTabs';
import { BuildPlan, PlanAgent } from '../planContract';

const agent = (name: string, inputs: string[], outputs: string[]): PlanAgent => ({
  id: name, name, purpose: 'p', trigger_type: 'event', trigger: 't', inputs, outputs,
  autonomy_level: 'acts_autonomously', approval_gates: [], escalation_rules: [], skills: [], owns: [],
});
const V7: PlanAgent[] = [
  agent('Gap Creator', [], ['Gap record']),
  agent('Hygienist Ranker', ['Gap record'], ['Ranked hygienist list']),
  agent('Shift Offer Sender', ['Ranked hygienist list'], ['Shift offer SMS']),
  agent('Schedule Updater', ['Shift acceptance'], ['Updated schedule', 'Slack notification']),
  agent('Summary Reporter', ['Gap record', 'Shift acceptance', 'Overtime approval request'], ['Daily summary report']),
  agent('Performance Monitor', ['Gap record', 'Shift acceptance'], ['Performance metrics']),
  agent('Overtime Approval Manager', ['Ranked hygienist list'], ['Overtime approval request']),
];

describe('inputs no agent produces', () => {
  it('names every agent reading "Shift acceptance", and nothing that is produced', () => {
    expect(unproducedInputs(V7)).toEqual([
      { agent: 'Schedule Updater', input: 'Shift acceptance' },
      { agent: 'Summary Reporter', input: 'Shift acceptance' },
      { agent: 'Performance Monitor', input: 'Shift acceptance' },
    ]);
  });

  it('uses the same name rule as the hand-offs, so plurals and qualifiers still count as produced', () => {
    const roster = [agent('A', [], ['Gap record']), agent('B', ['Unfilled gap records'], [])];
    expect(unproducedInputs(roster)).toEqual([]);
    expect(handoffsFor(roster)).toHaveLength(1);
  });

  it('does not count an agent feeding itself, and is empty for no agents', () => {
    expect(unproducedInputs([agent('Loop', ['Draft'], ['Draft'])])).toEqual([{ agent: 'Loop', input: 'Draft' }]);
    expect(unproducedInputs([])).toEqual([]);
    expect(unproducedInputs(null)).toEqual([]);
  });

  it('is empty once the offer sender passes the acceptance on', () => {
    const fixed = V7.map((a) => (a.name === 'Shift Offer Sender' ? { ...a, outputs: [...a.outputs, 'Shift acceptance'] } : a));
    expect(unproducedInputs(fixed)).toEqual([]);
  });
});

describe('the Story 000 brief', () => {
  const plan: BuildPlan = {
    project_name: 'ShiftFill', descriptor: 'd', requirements: [],
    releases: [{ key: 'r0', name: 'r0', goal: 'g', demo: 'd', week_start: 1, week_end: 1 }],
    stories: [], agents: V7,
  };

  it('lists the inputs nobody produces as questions, never as arrows', () => {
    const text = commandCenterTabSections(plan).join('\n');
    expect(text).toContain('Inputs no agent produces.');
    expect(text).toContain('Schedule Updater reads "Shift acceptance"');
    expect(text).toMatch(/a marker, not an arrow/);
  });

  it('says nothing when every input is produced', () => {
    const fixed = V7.map((a) => (a.name === 'Shift Offer Sender' ? { ...a, outputs: [...a.outputs, 'Shift acceptance'] } : a));
    expect(commandCenterTabSections({ ...plan, agents: fixed }).join('\n')).not.toContain('Inputs no agent produces');
  });
});
