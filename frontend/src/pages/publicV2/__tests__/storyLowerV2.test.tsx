import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoryBuildRail, StoryRoadmapBoard, shortDate } from '../StoryLowerV2';
import type {
  PublicCaseStudyRoadmapItem,
  PublicCaseStudyTimelineEntry,
} from '../../../services/caseStudyPublicTypes';

/**
 * The lower half of the page, in the format Ali approved on 2026-09-17 and then
 * asked for on the other two surfaces: the build as a rail, what happened next
 * as a status board, the details folded under each.
 */

const entry = (over: Partial<PublicCaseStudyTimelineEntry>): PublicCaseStudyTimelineEntry => ({
  date: '2026-03-29', endDate: null, label: 'Routing shipped', detail: null,
  sourceKind: 'commit', verificationClass: 'verified', ...over,
} as PublicCaseStudyTimelineEntry);

const item = (over: Partial<PublicCaseStudyRoadmapItem>): PublicCaseStudyRoadmapItem => ({
  label: 'Retry caps', status: 'shipped', detail: null, verificationClass: 'verified', ...over,
} as PublicCaseStudyRoadmapItem);

describe('StoryBuildRail', () => {
  const html = renderToStaticMarkup(
    <StoryBuildRail
      entries={[
        entry({}),
        entry({ date: '2026-08-24', label: 'Caps', detail: 'Every uncapped loop closed.' }),
        entry({ date: '2026-09-17', label: 'Measured' }),
      ]}
    />,
  );

  it('draws one staggered step per entry and folds only the ones with a detail', () => {
    expect(html.match(/cbv2-cs-rail__item/g)).toHaveLength(3);
    // Staggered: the labels alternate above and below the line so neighbours fit.
    expect(html.match(/data-side="(up|down)"/g)).toEqual(['data-side="up"', 'data-side="down"', 'data-side="up"']);
    expect(html).toContain('--cbv2-rail-n:3');
    expect(html).toContain('Notes on 1 of the 3 steps');
    expect(html).toContain('Every uncapped loop closed.');
    expect(html).toContain('29 Mar 2026');
  });

  it('prints nothing at all when the record has no timeline', () => {
    expect(renderToStaticMarkup(<StoryBuildRail entries={[]} />)).toBe('');
  });

  it('draws the steps with no fold when not one of them carries a detail', () => {
    const plain = renderToStaticMarkup(<StoryBuildRail entries={[entry({}), entry({ label: 'Second' })]} />);
    expect(plain).toContain('cbv2-cs-rail__item');
    expect(plain).not.toContain('story-build-notes');
  });

  it('reads the date out of the string, so no timezone can move it a day', () => {
    expect(shortDate('2026-03-29')).toBe('29 Mar 2026');
    expect(shortDate('2026-01-01')).toBe('1 Jan 2026');
    expect(shortDate('not a date')).toBe('not a date');
  });
});

describe('StoryRoadmapBoard', () => {
  const html = renderToStaticMarkup(
    <StoryRoadmapBoard
      items={[
        item({ label: 'Detection' }),
        item({ label: 'Handlers' }),
        item({ label: 'Labelled sample', status: 'not_pursued', detail: 'No sample has been drawn.' }),
      ]}
    />,
  );

  it('groups by status in the record order, labels only, details folded', () => {
    expect(html.match(/data-roadmap-status="[a-z_]+"/g))
      .toEqual(['data-roadmap-status="shipped"', 'data-roadmap-status="not_pursued"']);
    // Stalled work keeps its own column and says its own word, never a slug.
    expect(html).toContain('Not pursued');
    expect(html).toContain('Detection');
    expect(html).toContain('Notes on 1 of the 3 items');
    expect(html).toContain('No sample has been drawn.');
  });

  it('prints nothing at all when the record has no roadmap', () => {
    expect(renderToStaticMarkup(<StoryRoadmapBoard items={[]} />)).toBe('');
  });
});

describe('StoryArchitectureBand, once the band above has drawn the flow', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { StoryArchitectureBand } = require('../StoryArchitectureBand') as typeof import('../StoryArchitectureBand');
  const architecture = {
    narrative: ['First, the shape of it.', 'Second, the detail.', 'Third, the caps.'],
    stack: ['Python'], capabilities: [], integrations: [], dataStores: [],
    diagram: null, diagramSource: 'flowchart TD\n  a --> b', diagramImageUrl: null,
  } as unknown as Parameters<typeof StoryArchitectureBand>[0]['architecture'];

  it('keeps the first paragraph standing and folds the rest with the drawing', () => {
    const html = renderToStaticMarkup(<StoryArchitectureBand architecture={architecture} diagramFolded />);
    const [open, folded] = html.split('<details');
    expect(open).toContain('First, the shape of it.');
    expect(open).not.toContain('Second, the detail.');
    expect(folded).toContain('More on what was built');
    expect(folded).toContain('Second, the detail.');
    expect(folded).toContain('Third, the caps.');
  });

  it('keeps every paragraph standing when there is no band above', () => {
    const html = renderToStaticMarkup(<StoryArchitectureBand architecture={architecture} />);
    const [open] = html.split('<details');
    expect(open).toContain('Second, the detail.');
    expect(html).toContain('View technical proof');
  });
});
