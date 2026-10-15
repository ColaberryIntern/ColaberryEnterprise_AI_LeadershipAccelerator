import { completeEvidence } from '../../lifecycle/__tests__/evidenceFixture';
import type { LifecycleEvidence } from '../../lifecycle/lifecyclePrerequisites';

/**
 * P6-T2's ACCEPTANCE EVIDENCE: two separately reachable states, and the negative control.
 *
 * The task's own wording: "requirements can be refined early while authorized stories wait for
 * an approved blueprint/design; asserted as two separately reachable states, with a negative
 * control showing a story cannot be authorized from a refined-but-unapproved requirement set."
 *
 * So three things have to be true at once, and the third is the one that makes the first two
 * mean anything:
 *
 *   STATE A  requirements refine with no approval and no lifecycle row at all.
 *   STATE B  stories authorize once, and only once, the blueprint is approved.
 *   CONTROL  a REFINED BUT UNAPPROVED requirement set does not authorize a story.
 *
 * Without the control, "two reachable states" is satisfied by a gate that authorizes
 * everything: state A works, state B works, and nothing is ever refused. The control is what
 * distinguishes a gate from a pass-through, and it is asserted on the REAL predicate layer
 * rather than on a stub of it.
 *
 * ## What is mocked and what is not
 *
 * The real `prerequisiteGaps` and the real `blockingGaps` decide every verdict here. Only two
 * things are stubbed: the model lookup that finds the lifecycle row, and the evidence gatherer
 * (which has its own suites, needs a database, and is not what this file is about). The
 * authorization DECISION is never stubbed, because it is the subject.
 *
 * `FLAGS.lifecycleEnforcement` is read at module load, so each block re-imports the module
 * under the environment it needs. A single import would silently test one flag state twice.
 */

const PROJECT = 'proj-under-test';

/** Evidence for a project whose requirements ARE refined but whose blueprint is not approved. */
function refinedButUnapproved(): LifecycleEvidence {
  const e = completeEvidence() as LifecycleEvidence;
  return {
    ...e,
    // The requirement set is real and measured: this is NOT a project nobody has worked on.
    requirementCount: 24,
    assessedFields: new Set([...e.assessedFields, 'requirementCount']) as never,
    // But nothing is approved.
    approval: null,
  };
}

/** Load the module under a given flag state, with the row and evidence it should see. */
async function loadGate(opts: {
  enforcement: boolean;
  row: unknown;
  evidence?: LifecycleEvidence;
  /**
   * What `Project.findByPk` returns when there is no lifecycle row. Only the compatibility
   * branch reads it. Defaults to a project created AFTER the cutoff, so a `row: null` case
   * keeps meaning "a modern project with no row", which is a bypass and still refuses.
   */
  project?: unknown;
}) {
  jest.resetModules();
  process.env.ENABLE_PROJECT_LIFECYCLE = opts.enforcement ? 'true' : 'false';

  const findOne = jest.fn(async () => opts.row);
  jest.doMock('../../../models/ProjectLifecycleState', () => ({
    __esModule: true,
    default: { findOne },
  }));
  const findByPk = jest.fn(async () => (
    'project' in opts ? opts.project : { id: PROJECT, created_at: AFTER_CUTOFF }
  ));
  jest.doMock('../../../models/Project', () => ({
    __esModule: true,
    default: { findByPk },
  }));
  const readLifecycleEvidence = jest.fn(async () => opts.evidence ?? completeEvidence());
  jest.doMock('../../lifecycle/lifecycleEvidence', () => ({
    __esModule: true,
    readLifecycleEvidence,
  }));

  const mod = await import('../storyAuthorization');
  return { ...mod, findOne, readLifecycleEvidence, findByPk };
}

// The cutoff `STUDENT_REGISTRATION_LIVE_SINCE` is 2026-10-12T00:00:00.000Z. These three dates
// straddle it, and two of them are REAL production values rather than invented ones.

/** The newest student project that genuinely holds no lifecycle row, measured 2026-10-14. */
const BEFORE_CUTOFF = new Date('2026-10-05T06:02:41.455Z');
/** One of the ten pilot projects created after the hook shipped. */
const AFTER_CUTOFF = new Date('2026-10-13T14:03:48.285Z');
/** The cutoff instant itself. The hook was live AT it, so this must NOT be treated as legacy. */
const AT_CUTOFF = new Date('2026-10-12T00:00:00.000Z');

/** A client that returns exactly what it is given. */
const clientReturning = (payload: unknown) => ({
  create: jest.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: { total_tokens: 1 },
  })),
});

const SET = {
  project_name: 'P',
  descriptor: 'd',
  requirements: [{
    id: 'REQ-001', statement: 's', kind: 'FUNC', priority: 'must',
    cluster: 'c', from_dimensions: [],
  }],
};

const GENERATED_PLAN = {
  project_name: 'P',
  descriptor: 'd',
  // The model ECHOES SOMETHING ELSE: one requirement, reworded, renumbered, and short of
  // the approved set. Exactly what a human review exists to prevent being silently lost.
  requirements: [{
    id: 'REQ-999', statement: 'something the model made up', kind: 'FUNC',
    priority: 'should', cluster: 'c', from_dimensions: [],
  }],
  releases: [{ key: 'r0', name: 'n', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [{
    id: 'STORY-001', release: 'r0', title: 't', narrative: 'n', fulfills: ['REQ-001'],
    owner_agent: 'AGENT-001', acceptance: ['Given a', 'When b', 'Trust c'],
    task_guidance: 'g', failure_paths: ['f'], blocked_by: [],
    workspace: { kind: 'workspace', ref: 'WS' },
  }],
};

const APPROVED = {
  project_name: 'P',
  descriptor: 'd',
  requirements: [
    { id: 'REQ-001', statement: 'first approved requirement', kind: 'FUNC', priority: 'must', cluster: 'c', from_dimensions: ['problem'] },
    { id: 'REQ-002', statement: 'second approved requirement', kind: 'FUNC', priority: 'must', cluster: 'c', from_dimensions: [] },
    { id: 'REQ-003', statement: 'third approved requirement', kind: 'CONSTRAINT', priority: 'must', cluster: 'c', from_dimensions: [] },
  ],
};

afterEach(() => {
  delete process.env.ENABLE_PROJECT_LIFECYCLE;
  jest.resetModules();
});

describe('STATE A: requirements refine early, with no approval and no lifecycle', () => {
  it('extracts a requirement set while enforcement is ON and nothing is approved', async () => {
    // The load-bearing half of "refine early". Stage A consults no gate at all, so it works for
    // a project that has no lifecycle row, no blueprint and no approval. That is deliberate:
    // refining requirements is the part a human should iterate on BEFORE anything is committed.
    process.env.ENABLE_PROJECT_LIFECYCLE = 'true';
    jest.resetModules();
    const { extractRequirements } = await import('../requirementExtraction');

    const { requirements } = await extractRequirements({
      brief: 'b', document: 'd', client: clientReturning(SET) as never,
    } as never);

    expect(requirements.requirements).toHaveLength(1);
    // And it produced NO stories, which is what leaves them to be authorized separately.
    expect(requirements).not.toHaveProperty('stories');
  });

  it('does not import the authorization gate at all', async () => {
    // Structural, and the reason state A cannot accidentally acquire an approval
    // requirement: the extraction module has no EDGE to the gate. An import would be the
    // first step toward somebody adding a check that defeats refine-early.
    //
    // MEASURED ON THE IMPORT SPECIFIERS, not on the file text. The first version of this
    // test asserted the source does not contain the string "storyAuthorization" and failed
    // against the module’s OWN DOCBLOCK, which names that file while explaining why it is
    // deliberately not imported. A check that cannot tell code from prose is not a check on
    // the dependency graph.
    const fs = await import('fs');
    const src = await fs.promises.readFile(
      require.resolve('../requirementExtraction'), 'utf8',
    );
    const specifiers = [...src.matchAll(/^\s*import[\s\S]*?from\s+'([^']+)'/gm)]
      .map((m) => m[1]);

    // POSITIVE CONTROL FIRST. A regex that matched nothing would make every assertion below
    // pass while proving nothing at all, which is the exact shape of decorative control this
    // phase has already shipped three of.
    expect(specifiers).toContain('./planContract');
    expect(specifiers).toContain('./decomposePrompt');
    expect(specifiers.length).toBeGreaterThanOrEqual(3);

    // Now the claim: no edge to the gate, and none to the predicate layer either.
    expect(specifiers.some((s) => s.includes('storyAuthorization'))).toBe(false);
    expect(specifiers.some((s) => s.includes('lifecycle'))).toBe(false);
  });
});

describe('STATE B: stories authorize only once the blueprint is approved', () => {
  it('AUTHORIZES when the planning prerequisites are met', async () => {
    const { storyAuthorizationFor } = await loadGate({
      enforcement: true,
      row: { student_project_id: PROJECT, tenant_id: 't' },
      evidence: completeEvidence() as LifecycleEvidence,
    });

    expect(await storyAuthorizationFor(PROJECT)).toEqual({
      authorized: true, reason: 'blueprint_approved', gaps: [],
    });
  });

  it('is a MEASURED verdict, not a flag read: the evidence is actually consulted', async () => {
    // Without this, a gate that returned `authorized: true` unconditionally would pass the test
    // above. The same shape of hole that failed an earlier task in this phase.
    const { storyAuthorizationFor, readLifecycleEvidence, findOne } = await loadGate({
      enforcement: true,
      row: { student_project_id: PROJECT, tenant_id: 't' },
      evidence: completeEvidence() as LifecycleEvidence,
    });
    await storyAuthorizationFor(PROJECT);
    expect(findOne).toHaveBeenCalledTimes(1);
    expect(readLifecycleEvidence).toHaveBeenCalledTimes(1);
  });
});

describe('THE NEGATIVE CONTROL: a refined but unapproved requirement set authorizes nothing', () => {
  it('REFUSES, and names the missing approval', async () => {
    // The control the acceptance asks for, and the assertion that makes the two states above
    // mean something. The evidence here is a project whose requirements are genuinely refined
    // (24 of them, measured) and whose blueprint is simply not approved.
    const { storyAuthorizationFor } = await loadGate({
      enforcement: true,
      row: { student_project_id: PROJECT, tenant_id: 't' },
      evidence: refinedButUnapproved(),
    });

    const verdict = await storyAuthorizationFor(PROJECT);
    expect(verdict.authorized).toBe(false);
    expect(verdict.reason).toBe('blueprint_not_approved');
    // NAMED, not counted. A refusal that cannot say what is missing sends the student to an
    // operator instead of to an action.
    expect(verdict.gaps).toContain('approval_missing');
    expect(verdict.gaps.length).toBeGreaterThan(0);
  });

  it('having REFINED requirements does not help: the refusal is about approval', async () => {
    // Proves the refusal is not an artifact of thin evidence. Both snapshots differ in exactly
    // one field, `approval`, and they get opposite verdicts.
    const approved = await loadGate({
      enforcement: true,
      row: { student_project_id: PROJECT, tenant_id: 't' },
      evidence: { ...refinedButUnapproved(), approval: (completeEvidence() as LifecycleEvidence).approval },
    });
    expect((await approved.storyAuthorizationFor(PROJECT)).authorized).toBe(true);

    const unapproved = await loadGate({
      enforcement: true,
      row: { student_project_id: PROJECT, tenant_id: 't' },
      evidence: refinedButUnapproved(),
    });
    expect((await unapproved.storyAuthorizationFor(PROJECT)).authorized).toBe(false);
  });

  it('a project with NO lifecycle row is refused, not waved through', async () => {
    // LC-01: a new-project path "cannot bypass plan authorization". A missing lifecycle row is
    // the absence of evidence, not evidence of approval.
    //
    // The comment here used to say P6-T1b was a precondition because student `projects` rows did
    // not register lifecycles. P6-T1b LANDED, and this case is now narrower: a missing row on a
    // project created AFTER the cutoff means something created it outside the model the hook sits
    // on, which is the bypass LC-01 forbids. Projects predating the cutoff are permitted instead,
    // which the compatibility block below proves.
    const { storyAuthorizationFor } = await loadGate({
      enforcement: true, row: null, project: { id: PROJECT, created_at: AFTER_CUTOFF },
    });

    expect(await storyAuthorizationFor(PROJECT)).toEqual({
      authorized: false, reason: 'no_lifecycle', gaps: ['lifecycle_unregistered'],
    });
  });

  it('PERMITS a project that predates the registration hook (compatibility mode)', async () => {
    // P8-T4's own clause: "old projects retain compatibility mode". 62 real projects are in this
    // cohort; refusing them would break every legacy build for a rule that did not exist when
    // they were created, which is the reason the gate stayed unwired after the flag went on.
    const { storyAuthorizationFor, readLifecycleEvidence } = await loadGate({
      enforcement: true, row: null, project: { id: PROJECT, created_at: BEFORE_CUTOFF },
    });

    expect(await storyAuthorizationFor(PROJECT)).toEqual({
      authorized: true, reason: 'legacy_compatibility', gaps: [],
    });
    // And it short-circuits: there is no lifecycle row to read evidence from, so asking the
    // predicate layer would be a query against nothing.
    expect(readLifecycleEvidence).not.toHaveBeenCalled();
  });

  it('BOUNDARY: a project created AT the cutoff is a bypass, not legacy', async () => {
    // The off-by-one that decides whether the first governed project is governed. The hook was
    // live at that instant, so a missing row is already a bypass. `<`, never `<=`.
    const { storyAuthorizationFor } = await loadGate({
      enforcement: true, row: null, project: { id: PROJECT, created_at: AT_CUTOFF },
    });

    const verdict = await storyAuthorizationFor(PROJECT);
    expect(verdict.authorized).toBe(false);
    expect(verdict.reason).toBe('no_lifecycle');
  });

  it('REFUSES an id with no project at all, so a nonexistent id is not a way in', async () => {
    // Absence of a project is absence of evidence. If this permitted, the gate would be
    // bypassable by passing any id that does not exist.
    const { storyAuthorizationFor } = await loadGate({
      enforcement: true, row: null, project: null,
    });

    expect(await storyAuthorizationFor(PROJECT)).toEqual({
      authorized: false, reason: 'no_lifecycle', gaps: ['project_not_found'],
    });
  });

  it('compatibility mode is PER PROJECT, not a second global switch', async () => {
    // The distinction that matters for reading the logs later: `enforcement_disabled` is global
    // and temporary, `legacy_compatibility` is per project and permanent for that project. Two
    // projects, one flag state, two different verdicts.
    //
    // ASSERTED IMMEDIATELY AFTER EACH LOAD, not both at the end. `storyAuthorization` imports
    // `Project` with a dynamic `await import()` inside the function, so it resolves against the
    // module registry AT CALL TIME -- and `loadGate` calls `jest.resetModules()`. Loading both
    // first made the second mock answer for the first gate, which is how this test failed on its
    // first run. The same pattern IS safe for `readLifecycleEvidence`, imported statically.
    const legacy = await loadGate({
      enforcement: true, row: null, project: { id: PROJECT, created_at: BEFORE_CUTOFF },
    });
    expect((await legacy.storyAuthorizationFor(PROJECT)).reason).toBe('legacy_compatibility');

    const modern = await loadGate({
      enforcement: true, row: null, project: { id: PROJECT, created_at: AFTER_CUTOFF },
    });
    expect((await modern.storyAuthorizationFor(PROJECT)).reason).toBe('no_lifecycle');
  });

  it('a project WITH a lifecycle row never consults the compatibility path', async () => {
    // Otherwise a registered project could be permitted by its creation date instead of by its
    // approval state, which would be the gate answering the wrong question.
    const { storyAuthorizationFor, findByPk } = await loadGate({
      enforcement: true, row: { student_project_id: PROJECT }, evidence: refinedButUnapproved(),
    });

    const verdict = await storyAuthorizationFor(PROJECT);
    expect(verdict.authorized).toBe(false);
    expect(verdict.reason).toBe('blueprint_not_approved');
    expect(findByPk).not.toHaveBeenCalled();
  });

  it('the refusal carries a throwable error that states the reason', async () => {
    const { storyAuthorizationFor, StoryNotAuthorizedError } = await loadGate({
      enforcement: true,
      row: { student_project_id: PROJECT, tenant_id: 't' },
      evidence: refinedButUnapproved(),
    });
    const verdict = await storyAuthorizationFor(PROJECT);
    const err = new StoryNotAuthorizedError(verdict);
    expect(err.name).toBe('StoryNotAuthorizedError');
    expect(err.message).toContain('blueprint_not_approved');
    expect(err.message).toContain('approval_missing');
  });
});

describe('the dark period is visible, not inferred', () => {
  it('with the flag OFF it authorizes, says why, and consults nothing', async () => {
    // Every phase of this build shipped behind this flag. The verdict must be distinguishable
    // from a measured approval, or "no refusals in the logs" reads as "the gate passed
    // everything" when it means the gate was never asked.
    const { storyAuthorizationFor, findOne, readLifecycleEvidence } = await loadGate({
      enforcement: false, row: { student_project_id: PROJECT, tenant_id: 't' },
    });

    expect(await storyAuthorizationFor(PROJECT)).toEqual({
      authorized: true, reason: 'enforcement_disabled', gaps: [],
    });
    // It did not touch the database. Under the flag, the gate is not a cheap pass, it is absent.
    expect(findOne).not.toHaveBeenCalled();
    expect(readLifecycleEvidence).not.toHaveBeenCalled();
  });

  it('enforcement_disabled and blueprint_approved are DIFFERENT reasons for the same answer', async () => {
    // Both authorize. One is a measurement and one is a flag, and a log that cannot tell them
    // apart cannot answer "has this gate ever actually run in production".
    const off = await loadGate({ enforcement: false, row: null });
    const on = await loadGate({
      enforcement: true,
      row: { student_project_id: PROJECT, tenant_id: 't' },
      evidence: completeEvidence() as LifecycleEvidence,
    });
    const a = await off.storyAuthorizationFor(PROJECT);
    const b = await on.storyAuthorizationFor(PROJECT);
    expect(a.authorized).toBe(b.authorized);
    expect(a.reason).not.toBe(b.reason);
  });
});

describe('THE TWO STAGES CONNECT: a refined set becomes stories, and survives doing it', () => {
  it('the APPROVED requirements are what land in the plan, not the model’s echo', async () => {
    // The survival property, at the new seam. A human refined three requirements; the model
    // echoed one invented one. Substituting rather than trusting the echo is what makes the
    // review mean something, and it is asserted on IDENTITY, not on a count: three
    // requirements of the wrong three would pass a length check.
    jest.resetModules();
    const { decomposeBuild } = await import('../decomposeService');
    const { plan } = await decomposeBuild({
      brief: 'b', document: 'd', requirements: APPROVED,
      client: clientReturning(GENERATED_PLAN) as never,
    } as never);

    expect(plan.requirements).toEqual(APPROVED.requirements);
    expect(plan.requirements.map((r) => r.id)).toEqual(['REQ-001', 'REQ-002', 'REQ-003']);
    expect(JSON.stringify(plan.requirements)).not.toContain('REQ-999');
    // And the stories the model DID produce are kept: only the requirement list is replaced.
    expect(plan.stories).toHaveLength(1);
    expect(plan.releases.map((r) => r.key)).toEqual(['r0']);
  });

  it('sends the approved set to the model as authoritative, so it is not asked to re-derive', async () => {
    jest.resetModules();
    const { decomposeBuild } = await import('../decomposeService');
    const client = clientReturning(GENERATED_PLAN);
    await decomposeBuild({
      brief: 'b', document: 'd', requirements: APPROVED, client: client as never,
    } as never);

    const sent = (client.create as jest.Mock).mock.calls[0][0].messages[1].content;
    expect(sent).toContain('<APPROVED_REQUIREMENTS>');
    expect(sent).toContain('REQ-002');
    expect(sent).toContain('ALREADY BEEN EXTRACTED AND REVIEWED BY A HUMAN');
    // The block comes FIRST, ahead of the generation instructions, for the same reason the
    // brief precedes the document: order is part of the grounding.
    expect(sent.indexOf('<APPROVED_REQUIREMENTS>'))
      .toBeLessThan(sent.indexOf('Capture EVERY requirement'));
  });

  it('WITHOUT a refined set, behaviour is exactly as before', async () => {
    // Backward compatibility, asserted rather than assumed. The live student pipeline calls
    // this with no `requirements` and no `projectId`, and it must be untouched.
    jest.resetModules();
    const { decomposeBuild } = await import('../decomposeService');
    const client = clientReturning(GENERATED_PLAN);
    const { plan } = await decomposeBuild({
      brief: 'b', document: 'd', client: client as never,
    } as never);

    // The model’s own requirements stand, because nobody approved anything else.
    expect(plan.requirements.map((r) => r.id)).toEqual(['REQ-999']);
    const sent = (client.create as jest.Mock).mock.calls[0][0].messages[1].content;
    expect(sent).not.toContain('<APPROVED_REQUIREMENTS>');
  });
});

describe('the gate guards STORY generation, and guards it before the model call', () => {
  it('REFUSES to generate stories for an unapproved project, without calling the model', async () => {
    // Checked before the call on purpose: a refusal must cost nothing and must not be able to
    // half-produce a plan. The assertion that the client was never touched is the one that
    // proves the ordering, which a thrown error alone would not.
    jest.resetModules();
    process.env.ENABLE_PROJECT_LIFECYCLE = 'true';
    jest.doMock('../../../models/ProjectLifecycleState', () => ({
      __esModule: true,
      default: { findOne: jest.fn(async () => ({ student_project_id: PROJECT, tenant_id: 't' })) },
    }));
    jest.doMock('../../lifecycle/lifecycleEvidence', () => ({
      __esModule: true,
      readLifecycleEvidence: jest.fn(async () => refinedButUnapproved()),
    }));
    const { decomposeBuild } = await import('../decomposeService');
    const client = clientReturning(GENERATED_PLAN);

    await expect(decomposeBuild({
      brief: 'b', document: 'd', projectId: PROJECT, requirements: APPROVED,
      client: client as never,
    } as never)).rejects.toThrow(/not authorized/);
    expect(client.create).not.toHaveBeenCalled();
  });

  it('GENERATES for an approved project: the gate is a gate, not a wall', async () => {
    // The positive counterpart. Without it, a gate that refused everything would pass the
    // test above and break every build.
    jest.resetModules();
    process.env.ENABLE_PROJECT_LIFECYCLE = 'true';
    jest.doMock('../../../models/ProjectLifecycleState', () => ({
      __esModule: true,
      default: { findOne: jest.fn(async () => ({ student_project_id: PROJECT, tenant_id: 't' })) },
    }));
    jest.doMock('../../lifecycle/lifecycleEvidence', () => ({
      __esModule: true,
      readLifecycleEvidence: jest.fn(async () => completeEvidence()),
    }));
    const { decomposeBuild } = await import('../decomposeService');
    const client = clientReturning(GENERATED_PLAN);

    const { plan } = await decomposeBuild({
      brief: 'b', document: 'd', projectId: PROJECT, requirements: APPROVED,
      client: client as never,
    } as never);
    expect(plan.stories).toHaveLength(1);
    expect(client.create).toHaveBeenCalledTimes(1);
  });

  it('with NO projectId the gate is not consulted at all', async () => {
    // How the live path calls it today. The gate is about a project; a dry run or a fixture
    // has none, and inventing a refusal for them would break callers that are not doing
    // anything wrong.
    jest.resetModules();
    process.env.ENABLE_PROJECT_LIFECYCLE = 'true';
    const findOne = jest.fn(async () => null);
    jest.doMock('../../../models/ProjectLifecycleState', () => ({ __esModule: true, default: { findOne } }));
    const { decomposeBuild } = await import('../decomposeService');

    await decomposeBuild({
      brief: 'b', document: 'd', client: clientReturning(GENERATED_PLAN) as never,
    } as never);
    // A `findOne` call here would mean an unprojected caller can be refused by a gate that
    // has nothing to judge.
    expect(findOne).not.toHaveBeenCalled();
  });
});
