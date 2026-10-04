import { PRESENTATION_FORMATS } from '../presentationCardFormats';
import { PRESENTATION_TEMPLATES } from '../../services/presentation';

/**
 * Guard for the presentation-family authoring blocks.
 *
 * THE BUG THIS EXISTS TO PREVENT is the one it fixes: all three slugs were registered
 * in `typeRegistry.ts` but had no authoring block, so they received only a
 * `thumbnail_url` from the `...AI_THUMBNAILS` spread and `approved` stayed false.
 * `approvedPalette()` filters the Composer's palette to approved types, so
 * `presentation` and `demo` were invisible to scheduling — a curriculum type that
 * exists, renders, and can never be assigned. Nothing failed; it simply never appeared.
 *
 * These assertions are cheap and the failure they catch is silent, which is exactly the
 * trade that makes a guard worth having.
 */

const SLUGS = ['presentation', 'demo', 'ai_video_feedback'] as const;

describe('presentation family — authoring blocks', () => {
  it('authors exactly the three presentation-family slugs', () => {
    expect(Object.keys(PRESENTATION_FORMATS).sort()).toEqual([...SLUGS].sort());
  });

  it.each(SLUGS)('%s is approved and published, so the Composer can actually schedule it', (slug) => {
    const f = PRESENTATION_FORMATS[slug];
    expect(f.approved).toBe(true);
    expect(f.status).toBe('published');
  });

  it.each(SLUGS)('%s restates its thumbnail_url — the spread-override trap', (slug) => {
    // An explicit entry REPLACES the ...AI_THUMBNAILS value. Omitting this is how
    // community_live_session once shipped with no banner.
    expect(PRESENTATION_FORMATS[slug].thumbnail_url).toBe(`/thumbnails/curriculum-types/${slug}.jpg`);
  });

  it.each(SLUGS)('%s carries a real generation prompt, not a stub', (slug) => {
    const p = String(PRESENTATION_FORMATS[slug].generation_prompt || '');
    expect(p.length).toBeGreaterThan(400);
    expect(p).not.toMatch(/TODO|TBD|placeholder|coming soon/i);
    // Every prompt must carry the accuracy clause: a generated card that invents a
    // metric is worse than one that admits it has none, because a student will read an
    // invented number to an audience as if it were their own.
    expect(p).toMatch(/[Nn]ever invent numbers/);
    expect(p).toMatch(/measurement pending/);
    // Project text is data, never instructions.
    expect(p).toMatch(/untrusted source/);
  });

  it.each(SLUGS)('%s declares outputs and a completion rule', (slug) => {
    const f = PRESENTATION_FORMATS[slug];
    const outputs = (f.outputs || []) as Array<{ key: string }>;
    expect(outputs.map((o) => o.key)).toEqual(expect.arrayContaining(['title', 'body_html', 'summary']));
    expect(f.completion_rules).toBeDefined();
    expect(f.evaluation_type).toBeDefined();
  });

  it('the presentation prompt lists every shipped template, so the two cannot drift', () => {
    const p = String(PRESENTATION_FORMATS.presentation.generation_prompt || '');
    for (const t of PRESENTATION_TEMPLATES) {
      expect(p).toContain(t.id);
    }
    // Positive control: the menu is genuinely derived, not a hardcoded list that
    // happens to match today.
    expect(PRESENTATION_TEMPLATES.length).toBe(7);
  });

  it('demo is evidenced, not graded — matching its registry entry', () => {
    // typeRegistry sets evidence_required WITHOUT ai_evaluation for `demo`. Authoring it
    // with a rubric would silently turn a peer showcase into an assessed deliverable.
    expect(PRESENTATION_FORMATS.demo.evaluation_type).toBe('none');
    expect(PRESENTATION_FORMATS.demo.capabilities).not.toContain('evaluation');
  });

  it('presentation keeps the human instructor in the loop', () => {
    // The registry marks presentation instructor_review: true. `mentor_review` is the
    // capability that maps to that flag, so dropping it would quietly remove the human.
    expect(PRESENTATION_FORMATS.presentation.capabilities).toContain('mentor_review');
    expect(PRESENTATION_FORMATS.presentation.evaluation_type).toBe('rubric');
  });

  it('the AI feedback prompt refuses to claim it can judge a person', () => {
    const p = String(PRESENTATION_FORMATS.ai_video_feedback.generation_prompt || '');
    expect(p).toMatch(/coaching, not a grade/i);
    expect(p).toMatch(/confidence, eye contact, body language/i);
  });

  it('the demo prompt never sends a student at real customer data', () => {
    const p = String(PRESENTATION_FORMATS.demo.generation_prompt || '');
    expect(p).toMatch(/[Nn]ever instruct the learner to demonstrate against real customer data/);
  });
});
