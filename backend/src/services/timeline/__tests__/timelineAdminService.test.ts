/**
 * Unit tests for the pure card-composition core of the Timeline author service.
 * DB-touching functions (create/reorder/clone) are covered by integration; this
 * pins the registry-default + author-override logic that everything relies on.
 */
import { composeCardAttributes, CreateCardInput } from '../timelineAdminService';
import { resolveOrThrow } from '../typeRegistry';

const COHORT = '11111111-1111-1111-1111-111111111111';

describe('composeCardAttributes', () => {
  it('inherits defaults from the type registry when no overrides given', () => {
    const def = resolveOrThrow('prompt_lab'); // learn/practice, builder-heavy, evidence_required
    const input: CreateCardInput = { cohort_id: COHORT, type: 'prompt_lab' };
    const attrs = composeCardAttributes(def, input, 0);

    expect(attrs.type).toBe('prompt_lab');
    expect(attrs.title).toBe(def.label);            // falls back to type label
    expect(attrs.bucket).toBe(def.bucket);          // 'practice'
    expect(attrs.difficulty).toBe(def.difficulty);  // 'core'
    expect(attrs.points).toEqual({ learning: def.learning_xp, builder: def.builder_xp, community: def.community_xp });
    expect(attrs.estimated_time).toBe(45);          // evidence_required => 45
    expect(attrs.visibility).toBe('draft');         // authored cards start hidden
    expect(attrs.status).toBe('active');
    expect(attrs.cohort_id).toBe(COHORT);
    expect(attrs.order).toBe(0);
  });

  it('maps registry competency ids into {domain_id, weight} pairs', () => {
    const def = resolveOrThrow('implementation_task'); // architecture, testing, deployment
    const attrs = composeCardAttributes(def, { cohort_id: COHORT, type: 'implementation_task' }, 3);
    expect(attrs.competencies).toEqual(
      def.competencies.map((domain_id) => ({ domain_id, weight: 1 })),
    );
    expect(attrs.order).toBe(3);
  });

  it('lets author overrides win over registry defaults', () => {
    const def = resolveOrThrow('overview');
    const input: CreateCardInput = {
      cohort_id: COHORT, type: 'overview',
      title: '  Week 1 kickoff  ', bucket: 'pre_class', week: 1,
      difficulty: 'stretch', estimated_time: 90,
      points: { learning: 5, builder: 0, community: 0 },
      visibility: 'published',
    };
    const attrs = composeCardAttributes(def, input, 2);

    expect(attrs.title).toBe('Week 1 kickoff'); // trimmed
    expect(attrs.bucket).toBe('pre_class');
    expect(attrs.week).toBe(1);
    expect(attrs.difficulty).toBe('stretch');
    expect(attrs.estimated_time).toBe(90);
    expect(attrs.points).toEqual({ learning: 5, builder: 0, community: 0 });
    expect(attrs.visibility).toBe('published');
  });

  it('defaults estimated_time to 15 for non-evidence types', () => {
    const def = resolveOrThrow('announcement'); // evidence_required=false
    const attrs = composeCardAttributes(def, { cohort_id: COHORT, type: 'announcement' }, 0);
    expect(attrs.estimated_time).toBe(15);
  });
});
