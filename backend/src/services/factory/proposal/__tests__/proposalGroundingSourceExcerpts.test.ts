import { buildGrounding, groundingToPromptText } from '../proposalGrounding';

const baseInput = {
  blueprint: null,
  document: { title: 'Technical Proposal', requirements: [], sections: [] },
};

describe('proposalGrounding — source-excerpts channel (P-SRC, P2)', () => {
  it('carries retrieved source excerpts on the grounding', () => {
    const g = buildGrounding({ ...baseInput, sourceExcerpts: [{ documentName: 'Saratoga Briefing', text: 'The system audits every action.' }] });
    expect(g.sourceExcerpts).toHaveLength(1);
    expect(g.sourceExcerpts[0].documentName).toBe('Saratoga Briefing');
  });

  it('renders excerpts as cited reference material WITH the hard-specific safety rule intact', () => {
    const g = buildGrounding({ ...baseInput, sourceExcerpts: [{ documentName: 'Saratoga Briefing', text: 'Two-step sign-in with role-based access.' }] });
    const text = groundingToPromptText(g);
    expect(text).toContain('Source excerpts');
    expect(text).toContain('[Saratoga Briefing] Two-step sign-in with role-based access.');
    // the truthfulness guarantee survives: a hard specific still needs an approved fact / placeholder
    expect(text).toContain('still requires an approved company fact');
    expect(text).toContain('Never assert a hard specific from an excerpt alone');
  });

  it('renders no excerpt block when there are none (grounding unchanged for projects with no source library)', () => {
    const g = buildGrounding(baseInput);
    expect(g.sourceExcerpts).toEqual([]);
    expect(groundingToPromptText(g)).not.toContain('Source excerpts');
  });
});
