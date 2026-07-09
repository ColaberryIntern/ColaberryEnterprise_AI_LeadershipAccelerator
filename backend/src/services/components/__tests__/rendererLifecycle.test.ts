import { defaultRendererFor, defaultRenderers, RENDERER_SURFACES } from '../rendererService';
import { currentState, canTransition, LIFECYCLE_STATES } from '../lifecycleService';

describe('rendererService — default Renderer Definition (pure)', () => {
  const c = { label: 'Prompt Lab', student_label: 'Prompt Lab', render_band: 'interactive' };

  it('produces a prompt for every one of the 8 surfaces', () => {
    const r = defaultRenderers(c);
    expect(RENDERER_SURFACES.length).toBe(8);
    for (const s of RENDERER_SURFACES) {
      expect(typeof r[s]).toBe('string');
      expect(r[s].length).toBeGreaterThan(20);
    }
  });

  it('is deterministic — same component yields identical renderers', () => {
    expect(JSON.stringify(defaultRenderers(c))).toBe(JSON.stringify(defaultRenderers(c)));
  });

  it('tailors each surface (mobile mentions the viewport, thumbnail is compact)', () => {
    expect(defaultRendererFor('mobile', c).toLowerCase()).toContain('375');
    expect(defaultRendererFor('thumbnail', c).toLowerCase()).toContain('thumbnail');
  });

  it('carries the student label + the {{content}} slot into every surface', () => {
    for (const s of RENDERER_SURFACES) {
      expect(defaultRendererFor(s, c)).toContain('Prompt Lab');
      expect(defaultRendererFor(s, c)).toContain('{{content}}');
    }
  });
});

describe('lifecycleService — state math (pure)', () => {
  it('exposes exactly the 10 lifecycle states', () => {
    expect(LIFECYCLE_STATES.length).toBe(10);
    expect(LIFECYCLE_STATES).toContain('version_locked');
  });

  it('version_locked always wins', () => {
    expect(currentState('published', true, { runtime_count: 5, completion_pct: 80, evaluation_quality: 70 })).toBe('version_locked');
  });

  it('derives runtime states from analytics only when published', () => {
    expect(currentState('published', false, null)).toBe('published');
    expect(currentState('published', false, { runtime_count: 3 })).toBe('generated_runtime');
    expect(currentState('published', false, { runtime_count: 3, completion_pct: 40 })).toBe('completed');
    expect(currentState('published', false, { runtime_count: 3, completion_pct: 40, evaluation_quality: 60 })).toBe('evaluated');
    // analytics on a non-published component never advances past its authoring state
    expect(currentState('draft', false, { runtime_count: 9, completion_pct: 99 })).toBe('draft');
  });

  it('maps authoring statuses to lifecycle nodes', () => {
    expect(currentState('draft', false, null)).toBe('draft');
    expect(currentState('generated', false, null)).toBe('generated');
    expect(currentState('validated', false, null)).toBe('validated');
    expect(currentState('ready', false, null)).toBe('validated');
    expect(currentState('archived', false, null)).toBe('archived');
  });

  it('enforces transition rules', () => {
    expect(canTransition('draft', 'published')).toBe(true);
    expect(canTransition('published', 'archived')).toBe(true);
    expect(canTransition('archived', 'published')).toBe(false); // must revive to draft first
    expect(canTransition('draft', 'evaluated')).toBe(false);    // runtime state, not settable
  });
});
