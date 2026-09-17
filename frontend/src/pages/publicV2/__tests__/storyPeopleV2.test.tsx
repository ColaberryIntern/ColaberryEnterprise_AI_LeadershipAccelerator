import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoryBuilder, StoryClosing, StoryDecisions } from '../storyPeopleV2';
import { StorySectionBody } from '../storyDetailV2Sections';
import { isSectionSupported, visibleSections } from '../storyDetailV2Model';
import type {
  PublicCaseStudyBuilder, PublicCaseStudyContributor, PublicCaseStudyDecision, PublicCaseStudyDetail, PublicSurfaceView,
} from '../../../services/caseStudyPublicTypes';

/**
 * The three story sections on Enterprise: drawn where the surface profile
 * places them, null-safe on a record that predates them, and the projection's
 * word on every person (a null name credits the role; no biography, no link).
 */

const BUILDER: PublicCaseStudyBuilder = {
  name: 'Kes', roleTitle: 'AI Systems Architect', organization: 'Colaberry', initials: 'K',
  intro: [], progression: ['Intern', 'Hired by Colaberry', 'AI Systems Architect'],
  contribution: 'Created the project and built the recovery system.',
  skills: [{ label: 'Workflow design', evidence: 'Detect, fetch, replay.' }],
  profileUrl: null, photoUrl: null, provenance: { source: 'user_confirmed', confirmedAt: '2026-09-16' },
};
const DECISION: PublicCaseStudyDecision = {
  key: 'detect', title: 'Make missing events visible', problem: 'Two calls looked identical.', decision: 'Treat detection as a query.',
  evidence: 'The failures query landed on 28 April.', consequence: 'Operators see the gap the next morning.', stage: 'Detection query', figure: '28 Apr',
};

describe('the story sections on Enterprise', () => {
  it('draws the builder card with the rail, the contribution and the skills, and credits the role alone when the name is null', () => {
    const named = renderToStaticMarkup(<StoryBuilder builder={BUILDER} />);
    expect(named).toContain('<p class="cbv2-story__builder-name">Kes</p>');
    expect(named).toContain('AI Systems Architect, Colaberry');
    expect(named).toContain('<li data-current="true">AI Systems Architect</li>');
    expect(named).toContain('<li class="cbv2-story__skill"><strong>Workflow design</strong><span>Detect, fetch, replay.</span></li>');
    expect(named).toContain('Career facts as confirmed to Colaberry');
    const roleOnly = renderToStaticMarkup(<StoryBuilder builder={{ ...BUILDER, name: null, progression: [], intro: [], provenance: { source: 'repository', confirmedAt: '2026-09-16' } }} />);
    expect(roleOnly).toContain('<p class="cbv2-story__builder-name">AI Systems Architect</p>');
    expect(roleOnly).not.toContain('cbv2-story__builder-role');
    expect(roleOnly).not.toContain('cbv2-story__progression');
    expect(roleOnly).toContain('From the repository record.');
    expect(renderToStaticMarkup(<StoryBuilder builder={null} />)).toBe('');
  });

  it('draws a decision card with its number, stage pin, evidence line and closing figure; a card without them reads without them', () => {
    const html = renderToStaticMarkup(<StoryDecisions decisions={[DECISION, { ...DECISION, key: 'plain', stage: null, figure: null }]} />);
    expect(html).toContain('<span class="cbv2-story__decision-stage">At Detection query</span>');
    expect(html).toContain('<strong class="cbv2-story__decision-figure">28 Apr</strong><span>Operators see the gap the next morning.</span>');
    expect(html).toContain('Two choices shaped the system.</p>');
    expect(html).not.toContain('drawing above');
    expect((html.match(/cbv2-story__decision-stage/g) ?? []).length).toBe(1);
    expect(renderToStaticMarkup(<StoryDecisions decisions={[DECISION]} />)).toContain('One choice shaped the system. It lives at a specific point in the drawing above.');
    expect(renderToStaticMarkup(<StoryDecisions decisions={[]} />)).toBe('');
    expect(html).not.toMatch(/[–—]/);
  });

  it('draws the closing, and nothing without one', () => {
    expect(renderToStaticMarkup(<StoryClosing closing="What the work shows." />)).toContain('<p class="cbv2-story__closing-text">What the work shows.</p>');
    expect(renderToStaticMarkup(<StoryClosing closing={null} />)).toBe('');
  });

  it('supports the three keys only when the record fills them, and places them by the profile order', () => {
    const base = { builder: null, decisions: [], closing: null, contributors: [], anonymousContributorCount: 0 } as unknown as PublicCaseStudyDetail;
    for (const key of ['decisions', 'builder', 'closing'] as const) expect(isSectionSupported(base, key)).toBe(false);
    const full = { ...base, builder: BUILDER, decisions: [DECISION], closing: 'x' } as PublicCaseStudyDetail;
    for (const key of ['decisions', 'builder', 'closing'] as const) expect(isSectionSupported(full, key)).toBe(true);
    const surface = { key: 'enterprise', sectionOrder: ['hero', 'decisions', 'builder', 'closing', 'cta'], hiddenSections: [], requiredSections: [] } as unknown as PublicSurfaceView;
    expect(visibleSections(full, surface)).toEqual(['hero', 'decisions', 'builder', 'closing', 'cta']);
    expect(visibleSections(base, surface)).toEqual(['hero', 'cta']);
  });

  it('stands Who built it down when the builder card names the only contributor, and keeps it otherwise', () => {
    const kes: PublicCaseStudyContributor = { displayMode: 'named', displayName: 'Kes', role: 'AI Systems Architect', kind: 'colaberry_team' };
    const one = { builder: BUILDER, contributors: [kes], anonymousContributorCount: 0 } as unknown as PublicCaseStudyDetail;
    expect(renderToStaticMarkup(<StorySectionBody sectionKey="contributors" record={one} />)).toBe('');
    const two = { ...one, contributors: [kes, { displayMode: 'role_only', role: 'Reviewer', kind: 'colaberry_team' } as PublicCaseStudyContributor] } as PublicCaseStudyDetail;
    expect(renderToStaticMarkup(<StorySectionBody sectionKey="contributors" record={two} />)).toContain('Reviewer');
    const roleOnly = { ...one, builder: { ...BUILDER, name: null } } as PublicCaseStudyDetail;
    expect(renderToStaticMarkup(<StorySectionBody sectionKey="contributors" record={roleOnly} />)).toContain('Kes');
  });
});
