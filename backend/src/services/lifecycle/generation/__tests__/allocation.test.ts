/**
 * P3-T3 (part 1) — allocation and accountability.
 *
 * Fixture helpers follow `factory/__tests__/factoryValidate.test.ts`'s `task()`/`asg()`/`base()`
 * idiom, re-declared rather than imported because that file does not export them and exporting
 * them would mean editing an existing file.
 *
 * Every rejection is paired with a PASSING counterpart. Delegated rules are asserted THROUGH this
 * layer so a regression upstream surfaces here, without being re-implemented.
 */

import {
  deriveAllocation,
  deriveExecutionClass,
  validateAllocation,
  allocationErrors,
  unknownAllocationCount,
  humanlyFilledRoleIds,
  EXECUTION_CLASSES,
  ALLOCATION_CODES,
} from '../allocation';
import { factoryErrors } from '../../../factory/factoryValidate';
import type {
  FactoryProject, FactoryTask, Assignment, AllocationRow,
} from '../../../factory/contracts/factoryContract';

const task = (over: Partial<FactoryTask> & Pick<FactoryTask, 'id' | 'kind'>): FactoryTask => ({
  process_id: 'proc-1', title: 't', description: 'd', stage_id: 's', source_evidence: [],
  required_skills: [], judgment_level: 'low', decision_authority: 'none', data_sensitivity: 'internal',
  interaction_pattern: null, frequency: null, effort_minutes: null, effort_basis: 'UNKNOWN',
  confidence: null, method: 'EXPLICIT', ...over,
});

const asg = (over: Partial<Assignment> & Pick<Assignment, 'id' | 'task_id' | 'role_id' | 'responsibility'>): Assignment => ({
  executor: { type: 'person', id: 'p-1' }, minutes: null, basis: 'UNKNOWN', evidence_note: null, ...over,
});

/** START → t-1 → END, one work task with a human performer. */
function base(): FactoryProject {
  return {
    delivery_project_id: 'dp-1',
    tracks: [{ id: 'tr-1', delivery_project_id: 'dp-1', track_type: 'solution_build', status: 'active', owner_identity_id: null, solution_student_project_id: 'sp-1' }],
    source_blocks: [{ id: 'blk-1', locator: 'L.1', text: 'the requirement', kind: 'requirement' }],
    requirements: [],
    processes: [{ id: 'proc-1', business_outcome: 'o', success_criterion: 'c', trigger: 't', inputs: [], outputs: [], decision_branches: [], future_owner_role_id: 'r-1', exceptions: [] }],
    tasks: [
      task({ id: 't-start', kind: 'START', stage_id: 's0' }),
      task({ id: 't-1', kind: 'TASK', stage_id: 's1', source_evidence: ['blk-1'] }),
      task({ id: 't-end', kind: 'END', stage_id: 's2' }),
    ],
    roles: [
      { id: 'r-1', name: 'Analyst', definition: 'reviews' },
      { id: 'r-ghost', name: 'Nobody', definition: 'a role on paper only' },
    ],
    assignments: [asg({ id: 'a-1', task_id: 't-1', role_id: 'r-1', responsibility: 'PERFORMER' })],
    transitions: [
      { id: 'e-1', from_task_id: 't-start', to_task_id: 't-1', condition: null, is_rework: false },
      { id: 'e-2', from_task_id: 't-1', to_task_id: 't-end', condition: null, is_rework: false },
    ],
    allocation: [], role_map: [],
  };
}

/** The same project with t-1 performed by an agent under a human approver. */
function agentPerformed(): FactoryProject {
  const p = base();
  p.assignments = [
    asg({ id: 'a-1', task_id: 't-1', role_id: 'r-1', responsibility: 'PERFORMER', executor: { type: 'agent', id: 'ag-1' } }),
    asg({ id: 'a-2', task_id: 't-1', role_id: 'r-1', responsibility: 'APPROVER', executor: { type: 'person', id: 'p-2' } }),
  ];
  return p;
}

const codes = (p: FactoryProject, alloc: ReadonlyArray<AllocationRow>) =>
  validateAllocation(p, alloc).map((i) => i.code);

describe('the gap: allocation is absent, not merely incomplete', () => {
  it('a project is fully gate-valid with an EMPTY allocation', () => {
    // The premise, proven rather than asserted: factoryValidate has no opinion about allocation,
    // so nothing today stops a blueprint reaching approval with no human/AI split recorded at all.
    expect(factoryErrors(base())).toEqual([]);
    expect(base().allocation).toEqual([]);
  });

  it('every code this module adds is new', () => {
    expect([...ALLOCATION_CODES]).toEqual([
      'ALLOCATION_MISSING', 'ALLOCATION_DUPLICATE', 'ALLOCATION_CLASS', 'ALLOCATION_RATIONALE',
      'ALLOCATION_ACCOUNTABLE', 'PERFORMER_SINGULAR', 'SENSITIVITY_AUTONOMY',
      'ALLOCATION_CONTRADICTS_ASSIGNMENTS', 'ALLOCATION_UNVERIFIABLE', 'TASK_FIELDS',
    ]);
  });

  it('uses the four execution classes the contract already declares', () => {
    expect([...EXECUTION_CLASSES])
      .toEqual(['human', 'ai_with_approval', 'ai_autonomous', 'deterministic_software']);
  });
});

describe('empty allocation: draft permitted, full approval refused', () => {
  it('refuses approval, naming each unallocated task', () => {
    const issues = validateAllocation(base(), []);
    const missing = issues.filter((i) => i.code === 'ALLOCATION_MISSING');

    expect(missing).toHaveLength(1);
    expect(missing[0].stepId).toBe('t-1');
    expect(missing[0].severity).toBe('error');
  });

  it('counts the unknown so allocation_unknown can block, rather than throwing', () => {
    // lifecyclePrerequisites' allocation_unknown rule is driven by this count. Returning a number
    // is what lets a DRAFT exist while full approval is refused; throwing would prevent both.
    expect(() => validateAllocation(base(), [])).not.toThrow();
    expect(unknownAllocationCount(base(), [])).toBe(1);
  });

  it('PASSING COUNTERPART: a derived allocation satisfies it', () => {
    const p = base();
    const alloc = deriveAllocation(p);
    expect(alloc).toHaveLength(1);
    expect(unknownAllocationCount(p, alloc)).toBe(0);
    expect(allocationErrors(p, alloc)).toEqual([]);
  });

  it('does not allocate START or END — they are structure, not work', () => {
    expect(deriveAllocation(base()).map((r) => r.task_id)).toEqual(['t-1']);
    expect(unknownAllocationCount(base(), deriveAllocation(base()))).toBe(0);
  });
});

describe('execution class is derived from the assignments, never guessed', () => {
  it('a human performer is human', () => {
    expect(deriveExecutionClass(base().assignments)).toBe('human');
  });

  it('an agent performer with a human APPROVER is ai_with_approval, not autonomous', () => {
    expect(deriveExecutionClass(agentPerformed().assignments)).toBe('ai_with_approval');
  });

  it('an agent performer with no human approver is ai_autonomous', () => {
    const p = agentPerformed();
    p.assignments = p.assignments.filter((a) => a.responsibility !== 'APPROVER');
    expect(deriveExecutionClass(p.assignments)).toBe('ai_autonomous');
  });

  it('returns null rather than defaulting when there is no performer', () => {
    expect(deriveExecutionClass([])).toBeNull();
  });

  it('returns null rather than defaulting when the performer has no executor', () => {
    const orphan = asg({ id: 'a-x', task_id: 't-1', role_id: 'r-1', responsibility: 'PERFORMER', executor: null });
    expect(deriveExecutionClass([orphan])).toBeNull();
  });

  it('an undecidable task is OMITTED from the derivation and COUNTED as unknown', () => {
    // The two halves must agree: omitting it silently would hide the gap, which is the failure
    // mode this whole phase exists to prevent.
    const p = base();
    p.assignments = [];
    expect(deriveAllocation(p)).toEqual([]);
    expect(unknownAllocationCount(p, deriveAllocation(p))).toBe(1);
  });

  it('an agent APPROVER does not count as approval — only a human does', () => {
    const p = agentPerformed();
    p.assignments[1].executor = { type: 'agent', id: 'ag-2' };
    expect(deriveExecutionClass(p.assignments)).toBe('ai_autonomous');
  });
});

describe('accountability: a role nobody holds is a name, not an accountability', () => {
  const aiRow = (over: Partial<AllocationRow> = {}): AllocationRow[] => ([{
    task_id: 't-1', execution_class: 'ai_with_approval', rationale: 'agent drafts, human signs',
    accountable_role_id: 'r-1', ...over,
  }]);

  it('refuses AI work with no accountable role at all', () => {
    const issues = validateAllocation(agentPerformed(), aiRow({ accountable_role_id: null }));
    const acct = issues.filter((i) => i.code === 'ALLOCATION_ACCOUNTABLE');

    expect(acct).toHaveLength(1);
    expect(acct[0].stepId).toBe('t-1');
    expect(acct[0].message).toContain('unaccountable by construction');
  });

  it('refuses an accountable role that no person or team fills', () => {
    const issues = validateAllocation(agentPerformed(), aiRow({ accountable_role_id: 'r-ghost' }));
    expect(issues.filter((i) => i.code === 'ALLOCATION_ACCOUNTABLE')).toHaveLength(1);
    expect(humanlyFilledRoleIds(agentPerformed()).has('r-ghost')).toBe(false);
  });

  it('refuses a role that only an AGENT fills — found by a mutation that produced no failure', () => {
    // My first version of this suite only covered a role with NO assignment at all. Mutating
    // `humanlyFilledRoleIds` to count every assigned role broke nothing, because `r-ghost` is
    // referenced by no assignment either way. The case that matters is a role an AGENT occupies
    // being named accountable: that is how accountability gets handed back to the machine it is
    // supposed to constrain, and it was untested until the silent mutation exposed it.
    const p = agentPerformed();
    p.roles.push({ id: 'r-bot', name: 'Bot Owner', definition: 'filled only by an agent' });
    p.assignments.push(asg({ id: 'a-bot', task_id: 't-1', role_id: 'r-bot', responsibility: 'CONTRIBUTOR', executor: { type: 'agent', id: 'ag-3' } }));

    expect(humanlyFilledRoleIds(p).has('r-bot')).toBe(false);
    const issues = validateAllocation(p, aiRow({ accountable_role_id: 'r-bot' }));
    expect(issues.filter((i) => i.code === 'ALLOCATION_ACCOUNTABLE')).toHaveLength(1);
  });

  it('a role filled by a TEAM counts as humanly filled', () => {
    const p = agentPerformed();
    p.roles.push({ id: 'r-team', name: 'Review Board', definition: 'a team' });
    p.assignments.push(asg({ id: 'a-team', task_id: 't-1', role_id: 'r-team', responsibility: 'ACCOUNTABLE', executor: { type: 'team', id: 'tm-1' } }));

    expect(humanlyFilledRoleIds(p).has('r-team')).toBe(true);
    expect(allocationErrors(p, aiRow({ accountable_role_id: 'r-team' }))).toEqual([]);
  });

  it('PASSING COUNTERPART: a humanly-filled accountable role is accepted', () => {
    expect(allocationErrors(agentPerformed(), aiRow())).toEqual([]);
    expect(humanlyFilledRoleIds(agentPerformed()).has('r-1')).toBe(true);
  });

  it('does not demand an accountable role for purely human work', () => {
    // A human performer IS the accountability. Demanding a second human to be accountable for the
    // first would be ceremony, and the request asks for it only where an AI performs.
    const humanRow: AllocationRow[] = [{
      task_id: 't-1', execution_class: 'human', rationale: 'analyst does it', accountable_role_id: null,
    }];
    expect(allocationErrors(base(), humanRow)).toEqual([]);
  });

  it('DELEGATED: an agent holding ACCOUNTABLE is refused upstream by OVERSIGHT', () => {
    // Asserted through factoryValidate rather than re-implemented here. If this ever stops
    // failing, OVERSIGHT has regressed and this module's assumption is void.
    const p = agentPerformed();
    p.assignments.push(asg({ id: 'a-3', task_id: 't-1', role_id: 'r-1', responsibility: 'ACCOUNTABLE', executor: { type: 'agent', id: 'ag-9' } }));
    expect(factoryErrors(p).map((i) => i.code)).toContain('OVERSIGHT');
  });
});

describe('PERFORMER_SINGULAR — the half factoryValidate computes and discards', () => {
  function twoPerformers(): FactoryProject {
    const p = base();
    p.assignments.push(asg({ id: 'a-2', task_id: 't-1', role_id: 'r-2', responsibility: 'PERFORMER', executor: { type: 'person', id: 'p-9' } }));
    p.roles.push({ id: 'r-2', name: 'Second', definition: 'also does it' });
    return p;
  }

  it('factoryValidate accepts two performers — the premise, proven', () => {
    // It builds a count map and then only tests for zero, so the count is computed and thrown away.
    expect(factoryErrors(twoPerformers()).map((i) => i.code)).not.toContain('PERFORMER');
    expect(factoryErrors(twoPerformers())).toEqual([]);
  });

  it('this module rejects them, naming the task', () => {
    const p = twoPerformers();
    const issues = validateAllocation(p, deriveAllocation(p));
    const singular = issues.filter((i) => i.code === 'PERFORMER_SINGULAR');

    expect(singular).toHaveLength(1);
    expect(singular[0].stepId).toBe('t-1');
    expect(singular[0].message).toContain('2 PERFORMER');
  });

  it('PASSING COUNTERPART: one performer is accepted', () => {
    expect(codes(base(), deriveAllocation(base()))).not.toContain('PERFORMER_SINGULAR');
  });

  it('DELEGATED: zero performers is still refused upstream', () => {
    const p = base();
    p.assignments = [];
    expect(factoryErrors(p).map((i) => i.code)).toContain('PERFORMER');
  });
});

describe('SENSITIVITY_AUTONOMY — connecting a field that was always required to the allocation', () => {
  function autonomous(sensitivity: FactoryTask['data_sensitivity']): FactoryProject {
    const p = agentPerformed();
    p.assignments = p.assignments.filter((a) => a.responsibility !== 'APPROVER');
    p.tasks.find((t) => t.id === 't-1')!.data_sensitivity = sensitivity;
    return p;
  }
  const autoRow: AllocationRow[] = [{
    task_id: 't-1', execution_class: 'ai_autonomous', rationale: 'fully automated', accountable_role_id: 'r-1',
  }];

  it.each(['regulated', 'confidential'] as const)('refuses %s data under ai_autonomous', (s) => {
    const issues = validateAllocation(autonomous(s), autoRow);
    const sens = issues.filter((i) => i.code === 'SENSITIVITY_AUTONOMY');
    expect(sens).toHaveLength(1);
    expect(sens[0].message).toContain(s);
  });

  it.each(['public', 'internal'] as const)('PASSING COUNTERPART: allows %s data under ai_autonomous', (s) => {
    expect(codes(autonomous(s), autoRow)).not.toContain('SENSITIVITY_AUTONOMY');
  });

  it('allows regulated data under ai_with_approval — a human is in the loop', () => {
    const p = agentPerformed();
    p.tasks.find((t) => t.id === 't-1')!.data_sensitivity = 'regulated';
    const row: AllocationRow[] = [{
      task_id: 't-1', execution_class: 'ai_with_approval', rationale: 'agent drafts, human signs', accountable_role_id: 'r-1',
    }];
    expect(allocationErrors(p, row)).toEqual([]);
  });

  it.each(['decide_full', 'decide_bounded'] as const)('refuses %s decision authority under ai_autonomous', (authority) => {
    const p = autonomous('internal');
    p.tasks.find((t) => t.id === 't-1')!.decision_authority = authority;
    expect(codes(p, autoRow)).toContain('SENSITIVITY_AUTONOMY');
  });

  it.each(['none', 'recommend'] as const)('PASSING COUNTERPART: allows %s authority under ai_autonomous', (authority) => {
    const p = autonomous('internal');
    p.tasks.find((t) => t.id === 't-1')!.decision_authority = authority;
    expect(codes(p, autoRow)).not.toContain('SENSITIVITY_AUTONOMY');
  });

  it('a high-consequence decision cannot be reclassified into autonomy to lift the AI share', () => {
    const p = autonomous('regulated');
    p.tasks.find((t) => t.id === 't-1')!.decision_authority = 'decide_full';
    // Both reasons fire: the data AND the authority. Reclassifying is refused twice over.
    expect(codes(p, autoRow).filter((c) => c === 'SENSITIVITY_AUTONOMY')).toHaveLength(2);
  });
});


describe('ALLOCATION_CONTRADICTS_ASSIGNMENTS — the stated row against the graph', () => {
  const row = (cls: AllocationRow['execution_class'], over: Partial<AllocationRow> = {}): AllocationRow[] => ([{
    task_id: 't-1', execution_class: cls, rationale: 'stated by the model',
    accountable_role_id: 'r-1', ...over,
  }]);

  it('THE DANGEROUS DIRECTION: ai_with_approval stated where no human approver is assigned', () => {
    // The reassuring label with nothing behind it. A reviewer reads "a human approves this"
    // and no assignment provides one.
    const p = agentPerformed();
    p.assignments = p.assignments.filter((a) => a.responsibility !== 'APPROVER');

    const issues = validateAllocation(p, row('ai_with_approval'));
    const clash = issues.filter((i) => i.code === 'ALLOCATION_CONTRADICTS_ASSIGNMENTS');
    expect(clash).toHaveLength(1);
    expect(clash[0].stepId).toBe('t-1');
    // Wording corrected after the verifier pointed out the old message claimed NO human was
    // assigned, when a human ACCOUNTABLE may well be - only the APPROVER is missing.
    expect(clash[0].message).toContain('No human APPROVER is assigned');
    expect(clash[0].message).toContain('not the same as approving it');
  });

  it('PASSING COUNTERPART: ai_with_approval stated WITH a human approver assigned', () => {
    expect(allocationErrors(agentPerformed(), row('ai_with_approval'))).toEqual([]);
  });

  it('refuses human stated where an agent is assigned to perform', () => {
    const issues = validateAllocation(agentPerformed(), row('human'));
    const clash = issues.filter((i) => i.code === 'ALLOCATION_CONTRADICTS_ASSIGNMENTS');
    expect(clash).toHaveLength(1);
    expect(clash[0].message).toContain('a person does work an agent is assigned to perform');
  });

  it('refuses an AI class stated where a human is assigned to perform', () => {
    expect(codes(base(), row('ai_autonomous'))).toContain('ALLOCATION_CONTRADICTS_ASSIGNMENTS');
  });

  it('flags understating oversight too, but without the dangerous-direction wording', () => {
    // ai_autonomous stated where a human approver IS assigned: wrong, but it understates the
    // oversight in place rather than inventing oversight that is absent.
    const issues = validateAllocation(agentPerformed(), row('ai_autonomous'));
    const clash = issues.filter((i) => i.code === 'ALLOCATION_CONTRADICTS_ASSIGNMENTS');
    expect(clash).toHaveLength(1);
    expect(clash[0].message).not.toContain('No human APPROVER is assigned');
    expect(clash[0].message).toContain('disagree about who does this work');
  });

  it('EXEMPTS deterministic_software, which no executor type can express', () => {
    // ExecutorType is person | team | agent. There is no "software", so the graph can neither
    // confirm nor contradict the claim. Exempt from the comparison, not failed by it - and
    // still required to carry a rationale.
    expect(codes(base(), row('deterministic_software'))).not.toContain('ALLOCATION_CONTRADICTS_ASSIGNMENTS');
    const blank = row('deterministic_software', { rationale: '  ' });
    expect(codes(base(), blank)).toContain('ALLOCATION_RATIONALE');
  });


  it('CLOSES THE BYPASS: deterministic_software claimed for agent-performed work is refused', () => {
    // The verifier measured this on an agent-performed, regulated, decide_full task: labelling it
    // 'deterministic_software' turned THREE blocking errors into ZERO. The sensitivity and
    // accountability rules key on the AI classes, and this rule exempted the label
    // unconditionally - so one word bypassed the whole module.
    const p = agentPerformed();
    p.assignments = p.assignments.filter((a) => a.responsibility !== 'APPROVER');
    const t = p.tasks.find((x) => x.id === 't-1')!;
    t.data_sensitivity = 'regulated';
    t.decision_authority = 'decide_full';

    const claimed = codes(p, row('deterministic_software'));
    expect(claimed).toContain('ALLOCATION_CONTRADICTS_ASSIGNMENTS');
  });

  it('PASSING COUNTERPART: deterministic_software claimed for human-performed work is allowed', () => {
    // A person running a deterministic script is plausible, and the graph derives human, so
    // there is genuinely nothing to contradict. The exemption survives where it was justified.
    expect(codes(base(), row('deterministic_software')))
      .not.toContain('ALLOCATION_CONTRADICTS_ASSIGNMENTS');
  });

  it('says nothing when the class cannot be derived at all', () => {
    // No performer means no second account to compare against. ALLOCATION_MISSING is not the
    // right code either, since a row WAS stated - the unknown surfaces via the derivation.
    const p = base();
    p.assignments = [];
    expect(codes(p, row('human'))).not.toContain('ALLOCATION_CONTRADICTS_ASSIGNMENTS');
  });

  it('a derived allocation never contradicts itself', () => {
    // The derivation is one of the two accounts, so feeding it back must agree by construction.
    // If this ever fails, deriveAllocation and the comparison have drifted apart.
    for (const p of [base(), agentPerformed()]) {
      expect(codes(p, deriveAllocation(p))).not.toContain('ALLOCATION_CONTRADICTS_ASSIGNMENTS');
    }
  });
});


describe('ALLOCATION_UNVERIFIABLE \u2014 a class stated over an unknown executor', () => {
  /** A PERFORMER with no executor. Legal: the contract says null means unknown. */
  function noExecutor(): FactoryProject {
    const p = base();
    p.assignments = [asg({ id: 'a-1', task_id: 't-1', role_id: 'r-1', responsibility: 'PERFORMER', executor: null })];
    const t = p.tasks.find((x) => x.id === 't-1')!;
    t.data_sensitivity = 'regulated';
    t.decision_authority = 'decide_full';
    return p;
  }
  const row = (cls: AllocationRow['execution_class']): AllocationRow[] => ([{
    task_id: 't-1', execution_class: cls, rationale: 'stated by the model', accountable_role_id: null,
  }]);

  it('the premise: this project passes factoryValidate cleanly', () => {
    expect(factoryErrors(noExecutor())).toEqual([]);
  });

  it.each(['human', 'deterministic_software'] as const)(
    'CLOSES A MEASURED ZERO-ERROR PATH: %s stated over a null executor is refused', (cls) => {
      // Measured by the P3-T3 attempt-2 verifier: on a regulated, decide_full task this produced
      // ZERO errors and a zero unknown count. The omit-and-count mechanism only protected the
      // DERIVED path; once the model states rows, an unverifiable claim counted as a decision.
      const p = noExecutor();
      const issues = validateAllocation(p, row(cls));
      const unver = issues.filter((i) => i.code === 'ALLOCATION_UNVERIFIABLE');
      expect(unver).toHaveLength(1);
      expect(unver[0].stepId).toBe('t-1');
      expect(unver[0].message).toContain('no executor');
    },
  );

  it('counts it as UNKNOWN too, so allocation_unknown can block full approval', () => {
    // A row is not enough: "unknown" means the project cannot corroborate who does the work.
    expect(unknownAllocationCount(noExecutor(), row('human'))).toBe(1);
  });

  it('PASSING COUNTERPART: give the performer an executor and both clear', () => {
    const p = noExecutor();
    p.assignments[0].executor = { type: 'person', id: 'p-1' };
    expect(allocationErrors(p, row('human'))).toEqual([]);
    expect(unknownAllocationCount(p, row('human'))).toBe(0);
  });

  it('does not mask the AI-class rules, which still fire on the same project', () => {
    // ai_autonomous over a null executor is unverifiable AND sensitive AND unaccountable. The new
    // code must not swallow the others by short-circuiting first.
    const codesOut = codes(noExecutor(), row('ai_autonomous'));
    expect(codesOut).toContain('ALLOCATION_ACCOUNTABLE');
    expect(codesOut).toContain('SENSITIVITY_AUTONOMY');
  });
});

describe('a manual-only allocation is a recorded decision, not a blank', () => {
  it('accepts every task explicitly human, with a rationale', () => {
    const row: AllocationRow[] = [{
      task_id: 't-1', execution_class: 'human',
      rationale: 'admissions judgement; deliberately not automated', accountable_role_id: 'r-1',
    }];
    expect(allocationErrors(base(), row)).toEqual([]);
    expect(unknownAllocationCount(base(), row)).toBe(0);
  });

  it('refuses an allocation with an empty rationale', () => {
    const row: AllocationRow[] = [{
      task_id: 't-1', execution_class: 'human', rationale: '   ', accountable_role_id: 'r-1',
    }];
    const issues = validateAllocation(base(), row);
    expect(issues.filter((i) => i.code === 'ALLOCATION_RATIONALE')).toHaveLength(1);
    expect(issues.find((i) => i.code === 'ALLOCATION_RATIONALE')!.message).toContain('recorded decision');
  });
});

describe('malformed allocation input', () => {
  it('refuses an execution class outside the four', () => {
    const row = [{ task_id: 't-1', execution_class: 'magic', rationale: 'x', accountable_role_id: 'r-1' }] as unknown as AllocationRow[];
    const issues = validateAllocation(base(), row);
    expect(issues.filter((i) => i.code === 'ALLOCATION_CLASS')).toHaveLength(1);
    // And an invalid class does not ALSO count as allocated.
    expect(unknownAllocationCount(base(), row)).toBe(1);
  });

  it('refuses two rows for one task', () => {
    const rows: AllocationRow[] = [
      { task_id: 't-1', execution_class: 'human', rationale: 'a', accountable_role_id: 'r-1' },
      { task_id: 't-1', execution_class: 'ai_autonomous', rationale: 'b', accountable_role_id: 'r-1' },
    ];
    expect(codes(base(), rows)).toContain('ALLOCATION_DUPLICATE');
  });

  it('refuses a row citing a task that is not work', () => {
    const rows: AllocationRow[] = [
      { task_id: 't-1', execution_class: 'human', rationale: 'a', accountable_role_id: 'r-1' },
      { task_id: 't-start', execution_class: 'human', rationale: 'b', accountable_role_id: 'r-1' },
    ];
    const issues = validateAllocation(base(), rows);
    expect(issues.some((i) => i.code === 'ALLOCATION_MISSING' && i.stepId === 't-start')).toBe(true);
  });

  it('refuses effort minutes with no frequency, which would break the T5 totals', () => {
    const p = base();
    const t = p.tasks.find((x) => x.id === 't-1')!;
    t.effort_minutes = 30;
    t.frequency = null;
    expect(codes(p, deriveAllocation(p))).toContain('TASK_FIELDS');
  });

  it('PASSING COUNTERPART: minutes with a frequency are accepted', () => {
    const p = base();
    const t = p.tasks.find((x) => x.id === 't-1')!;
    t.effort_minutes = 30;
    t.frequency = 'per case';
    t.effort_basis = 'ESTIMATED';
    expect(codes(p, deriveAllocation(p))).not.toContain('TASK_FIELDS');
  });

  it('an empty project yields no allocation issues and no crash', () => {
    const empty: FactoryProject = {
      delivery_project_id: 'dp-0', tracks: [], source_blocks: [], requirements: [], processes: [],
      tasks: [], roles: [], assignments: [], transitions: [], allocation: [], role_map: [],
    };
    expect(validateAllocation(empty, [])).toEqual([]);
    expect(unknownAllocationCount(empty, [])).toBe(0);
  });
});
