import { sourcesFromTree } from '../deckSources';
import type { ProjectTreeDto } from '../../projects/projectTreeDto';

/**
 * These sources are what the grounding check measures a generated deck against, so
 * what goes IN here decides which figures get flagged. Two ways to get it wrong, and
 * only one of them is visible:
 *
 *   - too little, and a number the student really did write gets flagged as invented;
 *   - too much — the prompt, the template, anything we generated — and a fabricated
 *     number finds a match and sails through. That one is silent, and it defeats the
 *     entire feature.
 *
 * So the load-bearing tests here are the exclusions.
 */

const task = (over: Record<string, any> = {}): any => ({
  id: 't1', story_id: 'STORY-001', requirement_key: null, requirement_map_id: null,
  title: 'Route couriers by distance', description: null, status: 'complete', position: 1,
  owner_agent: null, execution_mode: null, release_key: null, acceptance: null,
  build: null, vibe: null, trust: null, fulfills: null, blocked_by: [],
  due_on: null, due_baseline_on: null, verified_at: null, ...over,
});

const tree = (over: Partial<ProjectTreeDto> = {}): ProjectTreeDto => ({
  id: 'p1', name: 'Regional Medical Courier System',
  organization_name: 'Mercy Health', industry: 'Healthcare logistics', project_stage: 'Pilot',
  requirements_completion_pct: null, health_score: null,
  lists: [{ id: 'l1', name: 'Build', position: 1, tasks: [task()] }] as any,
  task_counts: {} as any, command_center_url: null, ...over,
} as ProjectTreeDto);

describe('the learner’s own material, and nothing we wrote for them', () => {
  it('includes the project’s name and setting', () => {
    const s = sourcesFromTree(tree());
    expect(s).toContain('Regional Medical Courier System');
    expect(s).toContain('Mercy Health');
    expect(s).toContain('Healthcare logistics');
  });

  it('includes plan story titles and descriptions', () => {
    const s = sourcesFromTree(tree({
      lists: [{ id: 'l1', name: 'Build', position: 1, tasks: [task({ description: 'Cuts a 40 minute round trip to 12.' })] }] as any,
    }));
    expect(s).toContain('Route couriers by distance');
    expect(s).toContain('Cuts a 40 minute round trip to 12.');
  });

  it('includes acceptance lines, which is where the thresholds live', () => {
    // "under 2 minutes" is a figure the student committed to. Leave it out and their
    // own number comes back flagged as invented.
    const s = sourcesFromTree(tree({
      lists: [{ id: 'l1', name: 'Build', position: 1, tasks: [task({ acceptance: ['Dispatch completes in under 2 minutes', 'At least 40 deliveries a day'] })] }] as any,
    }));
    expect(s).toContain('Dispatch completes in under 2 minutes');
    expect(s).toContain('At least 40 deliveries a day');
  });

  it('includes the Prepare answers the learner typed', () => {
    const s = sourcesFromTree(tree(), { audience: 'Hospital operations leads', purpose: 'Cut courier spend by 18%' });
    expect(s).toContain('Hospital operations leads');
    expect(s).toContain('Cut courier spend by 18%');
  });

  // THE EXCLUSION THAT MATTERS MOST.
  it('EXCLUDES prep tasks, so the Studio’s own wording is never evidence', () => {
    const s = sourcesFromTree(tree({
      lists: [{ id: 'l1', name: 'Prep', position: 1, tasks: [
        task({ story_id: 'PREP-2', title: 'Record a first run-through and watch it back' }),
        task({ story_id: 'STORY-002', title: 'Build the dispatch board' }),
      ] }] as any,
    }));
    expect(s).toContain('Build the dispatch board');
    expect(s).not.toContain('Record a first run-through and watch it back');
  });

  it('returns an EMPTY list for a learner who has written nothing', () => {
    // Not a filler string. Empty sources mean every figure in the deck is unsupported,
    // which is the correct verdict for someone who supplied no figures.
    const s = sourcesFromTree(tree({
      name: null, organization_name: null, industry: null, project_stage: null, lists: [],
    }));
    expect(s).toEqual([]);
  });

  it('drops blank and whitespace-only text rather than counting it as a source', () => {
    const s = sourcesFromTree(tree({
      lists: [{ id: 'l1', name: 'Build', position: 1, tasks: [task({ title: '   ', description: '' })] }] as any,
    }), { audience: '   ' });
    expect(s).not.toContain('');
    expect(s.every((x) => x.trim().length > 0)).toBe(true);
  });

  it('deduplicates, because the same phrase twice is not more true', () => {
    const s = sourcesFromTree(tree({
      lists: [{ id: 'l1', name: 'Build', position: 1, tasks: [task(), task({ id: 't2' })] }] as any,
    }));
    expect(s.filter((x) => x === 'Route couriers by distance')).toHaveLength(1);
  });

  it('survives a malformed tree instead of throwing mid-generation', () => {
    expect(() => sourcesFromTree({ } as any)).not.toThrow();
    expect(() => sourcesFromTree({ lists: [{ tasks: null }] } as any)).not.toThrow();
    expect(() => sourcesFromTree(tree({ lists: [{ id: 'l', name: 'x', position: 1, tasks: [task({ acceptance: 'not an array' })] }] as any }))).not.toThrow();
  });
});
