/**
 * Shared apparatus for the §103 corpus cases, extracted when `corpusCases.test.ts` crossed
 * CLAUDE.md's 500-line hard ceiling at 552.
 *
 * THE RULE IS "SPLIT BEFORE ADDING", AND I ADDED FIRST. Attempt 1 of this packet recorded the
 * file at 478 lines with an explicit residual: "the next change to it splits first." Attempt 2
 * was that change, took it to 552, and disclosed nothing. An independent verifier caught it.
 * Extracting the apparatus rather than halving the cases arbitrarily keeps each file about one
 * thing: this module is the fixtures and their compositions, and the two suites are the claims.
 */
import { type CorpusFixture } from './corpusRunner';
import { fixtureA, fixtureB } from '../../generation/__tests__/fixtures/referenceFixtures';
import {
  manualOnlyUnderstanding, manualOnlyProject, manualOnlyAllocation, manualOnlyAgents,
  manualOnlyDeclaration, manualOnlyEffort, manualOnlyAcceptance,
} from '../../generation/__tests__/fixtures/manualOnly';
import { ws, wsState, acceptedDesign } from '../../generation/__tests__/fixtures/acceptedDesign';
import { type EffortAssessment } from '../../generation/effortMeasures';

type Fixture = typeof fixtureA;

const fieldsOf = (fx: Fixture) => ({
  understanding: fx.understanding(),
  project: fx.project(),
  allocation: fx.allocation(),
  agents: fx.agents(),
  effort: fx.effort(),
  declaration: { declaration: fx.declaration(), origin: 'approved_blueprint' as const },
  targetAcceptance: fx.acceptance(),
});

/** A, B and C share the same task ids, so they share a composition. */
const abcComposition = () => ({
  bindings: [ws('t-draft', 'r-1'), ws('t-review', 'r-1')],
  workspaceStates: [wsState('t-draft'), wsState('t-review')],
  design: acceptedDesign(),
  // Fixture B carries the corpus's only rework edge and declares its own bound. Inert for A and
  // C, which have no rework edge: `validateProcess` looks up bounds only for edges a project has.
  reworkBounds: fixtureB.reworkBounds(),
});

/** Fixture D has its own task ids (`t-intake`) and its own role, so it needs its own. */
const dComposition = () => ({
  bindings: [ws('t-intake', 'role-counsel'), ws('t-review', 'role-counsel')],
  workspaceStates: [wsState('t-intake'), wsState('t-review')],
  design: acceptedDesign(),
});

const caseOf = (id: string, proves: string, fx: Fixture): CorpusFixture => ({
  id, proves, build: () => fieldsOf(fx), composition: abcComposition(),
});

const fixtureDCase = (over: { effort?: EffortAssessment[] } = {}): CorpusFixture => ({
  id: 'D-manual-only',
  proves: '"all human" is a RECORDED DECISION, not an empty allocation',
  build: () => ({
    understanding: manualOnlyUnderstanding(),
    project: manualOnlyProject(),
    allocation: manualOnlyAllocation(),
    agents: manualOnlyAgents(),
    effort: over.effort ?? manualOnlyEffort(),
    declaration: { declaration: manualOnlyDeclaration(), origin: 'approved_blueprint' as const },
    targetAcceptance: manualOnlyAcceptance(),
  }),
  composition: dComposition(),
});

export {
  fieldsOf, abcComposition, caseOf, fixtureDCase, type Fixture,
};
