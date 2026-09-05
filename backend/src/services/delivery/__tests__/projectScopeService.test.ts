/**
 * The scope is the artifact a prospect is being asked to pay for, so these tests are about
 * what it must never look like.
 *
 * The screen this replaces was tested live on "city tour guide app for old people" and
 * returned PRIMARY USERS 0, AI OPPORTUNITIES 0, HUMAN DECISION POINTS 0 — zero users on an
 * app whose entire premise is a group of users. A zero does not read as an honest gap. It
 * reads as broken software, at the exact moment someone is deciding whether we can build
 * software.
 */

import { assembleScope } from '../projectScopeService';
import { parseUnderstanding } from '../projectUnderstanding';
import { projectBlueprint } from '../buildBlueprint';
import { applyProposals } from '../blueprintProposals';

const said = (dimension: string, value: string) => ({
  dimension,
  value,
  classification: 'FACT' as const,
  provenance: 'client_confirmed' as const,
});

const understanding = parseUnderstanding({
  title: 'City Tour Guide App for Older Adults',
  proposed_surfaces: ['Navigation screen', 'Alerts interface'],
  items: [
    said('problem', 'It is hard for a lot of older adults to navigate the city.'),
    said('desired_outcome', 'Make it easier for older adults to get where they need to be.'),
    said('actors', 'Older adults using the app day to day.'),
    said('integrations', 'It needs to integrate with an existing tracking system API.'),
    {
      dimension: 'unknowns',
      value: 'Which tracking system are they already using?',
      classification: 'QUESTION' as const,
      provenance: 'ai_inferred' as const,
    },
  ],
});

const withProposals = () =>
  applyProposals(projectBlueprint(understanding), [
    { section: 'proposed_application', value: 'A guided navigation app with a companion view for family.' },
    { section: 'release_1', value: 'Turn-by-turn walking guidance and a single trusted contact.' },
    { section: 'proposed_agents', value: 'A check-in agent that notices a missed arrival and alerts the contact.' },
    { section: 'trust_blueprint', value: 'A person confirms an alert before family are contacted', trust_state: 'Required' },
    { section: 'architecture_direction', value: 'Mobile-first client against a hosted API.' },
    { section: 'ux_direction', value: 'Large type, high contrast, one action per screen.' },
  ] as any);

const AT = '2026-09-05T12:00:00.000Z';

describe('a zero is never shown', () => {
  it('omits figures that would read as broken rather than empty', () => {
    // The blueprint here has no "agents" content, so an Automations figure would be 0.
    const bare = projectBlueprint(understanding);
    const scope = assembleScope(understanding, bare, AT);

    expect(scope.figures.every((f) => f.value > 0)).toBe(true);
    expect(scope.figures.map((f) => f.label)).not.toContain('Automations');
  });

  it('shows the figures that do have substance', () => {
    const scope = assembleScope(understanding, withProposals(), AT);
    const labels = scope.figures.map((f) => f.label);

    expect(labels).toContain('Screens');
    expect(labels).toContain('Automations');
    expect(scope.figures.every((f) => f.value > 0)).toBe(true);
  });

  it('drops a section with nothing in it rather than printing an empty heading', () => {
    // An empty section reads as a gap in the thinking, not a gap in the conversation.
    const scope = assembleScope(understanding, projectBlueprint(understanding), AT);
    expect(scope.sections.every((s) => s.items.length > 0)).toBe(true);
    expect(scope.sections.map((s) => s.key)).not.toContain('agents');
  });
});

describe('the scope is forward-looking', () => {
  const scope = assembleScope(understanding, withProposals(), AT);

  it('leads with what would be built, not with what they said', () => {
    expect(scope.sections[0].key).toBe('build');
    expect(scope.sections[0].items[0]).toContain('guided navigation app');
  });

  it('includes a first release, which is the thing that makes it feel real', () => {
    expect(scope.sections.find((s) => s.key === 'release_1')?.items[0]).toContain('Turn-by-turn');
  });

  it('separates what the software does from what still needs a person', () => {
    expect(scope.sections.find((s) => s.key === 'agents')?.items[0]).toContain('check-in agent');
    expect(scope.sections.find((s) => s.key === 'human')?.items.join(' ')).toContain('confirms an alert');
  });

  it('keeps what we heard, but not as the headline', () => {
    expect(scope.heard.length).toBeGreaterThan(0);
    expect(scope.sections.map((s) => s.key)).not.toContain('heard');
  });

  it('surfaces the open question rather than hiding an unknown', () => {
    expect(scope.open_questions).toEqual(['Which tracking system are they already using?']);
  });

  it('writes a summary a person could read aloud', () => {
    expect(scope.summary).toContain('older adults');
    expect(scope.summary.length).toBeGreaterThan(40);
  });

  it('is deterministic for a given blueprint', () => {
    const bp = withProposals();
    expect(JSON.stringify(assembleScope(understanding, bp, AT))).toBe(
      JSON.stringify(assembleScope(understanding, bp, AT)),
    );
  });
});

describe('the screens section', () => {
  it('combines what they named with what we propose', () => {
    const scope = assembleScope(understanding, withProposals(), AT);
    const screens = scope.sections.find((s) => s.key === 'surfaces')!.items;

    expect(screens).toContain('Navigation screen');
    expect(screens.join(' ')).toContain('Large type');
  });
});
