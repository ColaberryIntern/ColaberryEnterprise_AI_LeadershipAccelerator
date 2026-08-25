import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import CaseStudyArchitecture from '../CaseStudyArchitecture';
import CaseStudyArtifacts from '../CaseStudyArtifacts';
import CaseStudyCTA from '../CaseStudyCTA';
import CaseStudyFilters from '../CaseStudyFilters';
import CaseStudyLedger from '../CaseStudyLedger';
import CaseStudyMeasurement from '../CaseStudyMeasurement';
import CaseStudyRoadmap from '../CaseStudyRoadmap';
import CaseStudyTimeline, { formatIsoDate } from '../CaseStudyTimeline';
import { EMPTY_CASE_STUDY_FILTERS } from '../../../services/caseStudyApi';
import {
  ROADMAP_STATUS_LABELS,
  resolveCaseStudySurfaceProfile,
} from '../../../config/caseStudySurfaces';
import * as F from '../__fixtures__/caseStudyPublicFixtures';
import type { CaseStudyRoadmapStatus } from '../../../services/caseStudyPublicTypes';

/**
 * The detail-page parts, and the two rules that run through all of them:
 * an absent field is hidden rather than filled in, and no state is legible only
 * in colour.
 */

const render = (element: React.ReactElement): string =>
  renderToStaticMarkup(<MemoryRouter>{element}</MemoryRouter>);

const textOf = (markup: string): string =>
  markup.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

const LABELS = resolveCaseStudySurfaceProfile(null).ledgerLabels;

/* ---------------------------------------------------------------- ledger --- */

describe('CaseStudyLedger counts what is published and nothing else', () => {
  const ledger = { projects: 12, verifiedOutcomes: 5, publicRepositories: 3, shipped: 7 };

  it('prints every figure from the payload and invents none', () => {
    const text = textOf(render(<CaseStudyLedger ledger={ledger} labels={LABELS} />));
    const values = Object.values(ledger).map(String);
    for (const number of text.match(/\d[\d,]*/g) ?? []) {
      expect({ number, fromLedger: values.includes(number) })
        .toEqual({ number, fromLedger: true });
    }
  });

  it('labels each figure from the surface profile', () => {
    const text = textOf(render(<CaseStudyLedger ledger={ledger} labels={LABELS} />));
    for (const label of Object.values(LABELS)) expect(text).toContain(label);
  });

  it('renders an empty library as zeroes rather than as a placeholder', () => {
    const empty = { projects: 0, verifiedOutcomes: 0, publicRepositories: 0, shipped: 0 };
    const text = textOf(render(<CaseStudyLedger ledger={empty} labels={LABELS} />));
    expect(text.match(/\b0\b/g)?.length).toBe(4);
  });
});

/* --------------------------------------------------------------- filters --- */

describe('CaseStudyFilters is operable by keyboard because it uses real controls', () => {
  const groups = [
    {
      field: 'capability' as const,
      legend: 'Capability',
      options: [
        { value: 'agents', label: 'Agents', count: 4 },
        { value: 'retrieval', label: 'Retrieval', count: 2 },
      ],
    },
  ];
  const markup = (): string =>
    render(
      <CaseStudyFilters
        groups={groups}
        value={EMPTY_CASE_STUDY_FILTERS}
        onToggle={() => undefined}
      />,
    );

  it('uses a native disclosure rather than a div with a click handler', () => {
    expect(markup()).toContain('<details');
    expect(markup()).toContain('<summary');
  });

  it('gives every option a real checkbox with a label bound to it', () => {
    const html = markup();
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('id="cs-filter-capability-agents"');
    expect(html).toContain('for="cs-filter-capability-agents"');
    expect(html).toContain('name="capability"');
    expect(html).toContain('value="agents"');
  });

  it('names each control with words a reader can act on', () => {
    const text = textOf(markup());
    expect(text).toContain('Agents');
    expect(text).toContain('matching projects');
  });

  it('reflects the selected state on the control itself, not only in styling', () => {
    const html = render(
      <CaseStudyFilters
        groups={groups}
        value={{ ...EMPTY_CASE_STUDY_FILTERS, capability: ['agents'] }}
        onToggle={() => undefined}
      />,
    );
    expect(html).toContain('checked');
    expect(textOf(html)).toContain('1 selected');
  });

  it('renders nothing when there are no facets to offer', () => {
    expect(
      render(
        <CaseStudyFilters groups={[]} value={EMPTY_CASE_STUDY_FILTERS} onToggle={() => undefined} />,
      ),
    ).toBe('');
  });

  it('declares no live region: the result count belongs to the page', () => {
    expect(markup()).not.toContain('aria-live');
  });
});

/* -------------------------------------------------------------- timeline --- */

describe('CaseStudyTimeline never moves a date', () => {
  it('formats from the ISO string rather than through a Date', () => {
    expect(formatIsoDate('2026-03-04')).toBe('March 4, 2026');
    expect(formatIsoDate('2026-01-01')).toBe('January 1, 2026');
    expect(formatIsoDate('2026-12-31')).toBe('December 31, 2026');
  });

  it('constructs no Date object at all, which is what makes that true', () => {
    // A UTC-midnight Date rendered through a locale formatter shows the previous
    // day in any negative-offset zone. Comments are stripped before the check,
    // because the component's own header explains that trap by naming it.
    const source = fs
      .readFileSync(path.join(__dirname, '..', 'CaseStudyTimeline.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    expect(source).not.toContain('new Date(');
    expect(source).not.toContain('toLocaleDateString');
  });

  it('prints an unparseable value verbatim instead of guessing', () => {
    expect(formatIsoDate('sometime in March')).toBe('sometime in March');
    expect(formatIsoDate('2026-13-01')).toBe('2026-13-01');
  });

  it('carries a machine-readable date beside the human one', () => {
    // Matched case-insensitively: React's server renderer emits the JSX prop
    // name `dateTime`, and HTML attribute names are case-insensitive, so the
    // browser reads it as `datetime` either way.
    const html = render(<CaseStudyTimeline entries={[F.timelineEntry()]} />);
    expect(html).toMatch(/<time datetime="2026-03-04"/i);
    expect(textOf(html)).toContain('March 4, 2026');
  });

  it('renders a range when the entry has an end date', () => {
    const html = render(
      <CaseStudyTimeline entries={[F.timelineEntry({ endDate: '2026-04-09' })]} />,
    );
    expect(html).toMatch(/<time datetime="2026-04-09"/i);
    expect(textOf(html)).toContain('to April 9, 2026');
  });

  it('says what KIND of thing evidenced the entry, and carries no reference', () => {
    const html = render(<CaseStudyTimeline entries={[F.timelineEntry()]} />);
    expect(textOf(html)).toContain('Repository evidence');
    expect(html).toContain('data-source-kind="repository"');
  });

  it('renders nothing when there is no timeline', () => {
    expect(render(<CaseStudyTimeline entries={[]} />)).toBe('');
  });
});

/* ---------------------------------------------------------- architecture --- */

describe('CaseStudyArchitecture describes the system without drawing one', () => {
  it('lists nodes by their graph key, never by an id', () => {
    const html = render(<CaseStudyArchitecture architecture={F.architecture()} />);
    expect(html).toContain('data-node-key="api"');
    expect(html).not.toMatch(/\sid="(?!cs-filter)/);
    expect(textOf(html)).toContain('Planner API');
  });

  it('resolves each edge endpoint to its node label', () => {
    const text = textOf(render(<CaseStudyArchitecture architecture={F.architecture()} />));
    expect(text).toContain('Planner API to Route worker (queues)');
  });

  it('shows an edge whose endpoint has no node rather than dropping it', () => {
    const arch = F.architecture({
      diagram: {
        nodes: [{ key: 'api', label: 'Planner API', kind: 'service' }],
        edges: [{ from: 'api', to: 'ghost', label: null }],
      },
    });
    expect(textOf(render(<CaseStudyArchitecture architecture={arch} />)))
      .toContain('Planner API to ghost');
  });

  it('hides a subsection that has no data instead of heading empty space', () => {
    const arch = F.architecture({ integrations: [], diagram: null });
    const text = textOf(render(<CaseStudyArchitecture architecture={arch} />));
    expect(text).not.toContain('Integrations');
    expect(text).not.toContain('Components');
    expect(text).toContain('Stack');
  });

  it('renders nothing at all when the whole section is empty', () => {
    const arch = F.architecture({
      narrative: [], stack: [], capabilities: [], integrations: [], diagram: null,
    });
    expect(render(<CaseStudyArchitecture architecture={arch} />)).toBe('');
  });
});

/* ----------------------------------------------------------- measurement --- */

describe('CaseStudyMeasurement never shows a figure without its context', () => {
  it('renders the figure through the shared Metric with its evidence class', () => {
    const html = render(<CaseStudyMeasurement measurement={F.measurement()} />);
    expect(html).toContain('data-metric="true"');
    expect(html).toContain('data-evidence="verified"');
    expect(textOf(html)).toContain('41% fewer');
  });

  it('shows baseline, sample, methodology and limitations when the record has them', () => {
    const text = textOf(render(<CaseStudyMeasurement measurement={F.measurement()} />));
    expect(text).toContain('Baseline');
    expect(text).toContain('approximately 300 per quarter');
    expect(text).toContain('Sample');
    expect(text).toContain('Methodology');
    expect(text).toContain('Limitations');
    expect(text).toContain('One season of data.');
  });

  it('omits a missing field rather than printing a filler value for it', () => {
    const bare = F.measurement({
      metrics: [F.metric({ baseline: null, sample: null, methodology: null, limitations: [] })],
    });
    const text = textOf(render(<CaseStudyMeasurement measurement={bare} />));
    expect(text).not.toContain('Baseline');
    expect(text).not.toContain('Limitations');
    expect(text.toLowerCase()).not.toContain('n/a');
    expect(text.toLowerCase()).not.toContain('unknown');
  });

  it('shows a unit as its own term rather than glued onto the value', () => {
    const withUnit = F.measurement({ metrics: [F.metric({ unit: 'per quarter' })] });
    const text = textOf(render(<CaseStudyMeasurement measurement={withUnit} />));
    expect(text).toContain('Unit');
    expect(text).toContain('41% fewer');
    expect(text).not.toContain('41% fewerper quarter');
  });

  it('shows who verified the figure beside how much it may claim', () => {
    const html = render(<CaseStudyMeasurement measurement={F.measurement()} />);
    expect(html).toContain('data-verification-method="client"');
    expect(textOf(html)).toContain('Client');
  });

  it('renders nothing when there is no measurement', () => {
    expect(render(<CaseStudyMeasurement measurement={{ narrative: [], metrics: [] }} />)).toBe('');
  });
});

/* --------------------------------------------------------------- roadmap --- */

describe('CaseStudyRoadmap shows stalled work in words', () => {
  const STATUSES: readonly CaseStudyRoadmapStatus[] = [
    'shipped', 'in_progress', 'paused', 'not_pursued', 'unknown',
  ];

  it.each(STATUSES)('renders %s with its own word, not a colour', (status) => {
    const html = render(<CaseStudyRoadmap items={[F.roadmapItem({ status })]} />);
    expect(textOf(html)).toContain(ROADMAP_STATUS_LABELS[status]);
    expect(html).toContain(`data-roadmap-status="${status}"`);
  });

  it('hides its glyph from assistive technology so the word is the status', () => {
    expect(render(<CaseStudyRoadmap items={[F.roadmapItem()]} />)).toContain('aria-hidden="true"');
  });

  it('gives the five statuses five distinct words', () => {
    expect(new Set(STATUSES.map((s) => ROADMAP_STATUS_LABELS[s])).size).toBe(5);
  });

  it('renders nothing when there is no roadmap', () => {
    expect(render(<CaseStudyRoadmap items={[]} />)).toBe('');
  });
});

/* ------------------------------------------------------------- artifacts --- */

describe('CaseStudyArtifacts creates no control it cannot honour', () => {
  it('links an open artifact safely, and names which one it opens', () => {
    const html = render(<CaseStudyArtifacts artifacts={[F.openArtifact()]} />);
    expect(html).toContain('href="https://example.org/walkthrough"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(textOf(html)).toContain('Executive walkthrough (opens in a new tab)');
  });

  it('renders a request-only artifact as a state, never as a button', () => {
    const html = render(<CaseStudyArtifacts artifacts={[F.requestArtifact()]} />);
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a ');
    expect(textOf(html)).toContain('Available on request');
  });

  it('names the artifact type from the shared vocabulary', () => {
    const text = textOf(render(<CaseStudyArtifacts artifacts={[F.openArtifact()]} />));
    expect(text).toContain('Deck');
  });

  it('renders nothing when there are no approved artifacts', () => {
    expect(render(<CaseStudyArtifacts artifacts={[]} />)).toBe('');
  });
});

/* ------------------------------------------------------------------- cta --- */

describe('CaseStudyCTA is surface data, not copy written into a component', () => {
  it('prints every string from the payload', () => {
    const text = textOf(render(<CaseStudyCTA cta={F.cta()} />));
    expect(text).toContain('Same shape, different workflow');
    expect(text).toContain('Bring us a workflow worth improving.');
    expect(text).toContain('Map an opportunity');
  });

  it('routes an internal href through the router', () => {
    expect(render(<CaseStudyCTA cta={F.cta()} />)).toContain('href="/lab"');
  });

  it('treats an absolute or protocol-relative href as external', () => {
    const external = render(<CaseStudyCTA cta={F.cta({ href: 'https://example.org/talk' })} />);
    expect(external).toContain('rel="noopener noreferrer"');
    expect(textOf(external)).toContain('opens in a new tab');
    expect(render(<CaseStudyCTA cta={F.cta({ href: '//example.org' })} />))
      .toContain('target="_blank"');
  });

  it('writes no path, product name or wording of its own', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', 'CaseStudyCTA.tsx'), 'utf8');
    const body = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    expect(body).not.toContain('/lab');
    expect(body).not.toContain('Map an opportunity');
  });
});
