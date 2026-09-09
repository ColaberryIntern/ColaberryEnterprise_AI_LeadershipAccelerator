import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import CaseStudyKpi, { readinessBreakdown, Readiness } from '../CaseStudyKpi';
import BuildEvidencePanel, { EvidenceSummary } from '../BuildEvidencePanel';
import ArtifactsPanel from '../ArtifactsPanel';
import ReleaseRow from '../ReleaseRow';

/**
 * No @testing-library/react in this repo — same react-dom/client + act convention as
 * StatCard.test.tsx. Adding RTL would be a drive-by dependency CLAUDE.md prohibits.
 *
 * These assert the behaviours that carry meaning rather than the markup: that a score
 * is never a bare number, that an empty evidence panel shows NO zeros, and that an
 * absent definition-of-done renders nothing rather than an empty quote.
 */

let container: HTMLDivElement;
let root: Root;

async function render(node: React.ReactElement) {
  await act(async () => { root.render(<MemoryRouter>{node}</MemoryRouter>); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

const readiness: Readiness = {
  score: 31,
  ready: false,
  components: [
    { key: 'build', label: 'Build plan complete', score: 0.78, weight: 0.4, gap: '6 of 27 tasks open' },
    { key: 'repo', label: 'Code repository', score: 0, weight: 0.2, gap: 'no repo' },
    { key: 'artifacts', label: 'Artifacts produced', score: 0, weight: 0.15, gap: 'no artifacts' },
    { key: 'narrative', label: 'Executive summary', score: 0, weight: 0.15, gap: 'no executive summary' },
    { key: 'stage', label: 'Stage progression', score: 0, weight: 0.1, gap: 'stage is discovery' },
  ],
  gaps: ['6 of 27 tasks open', 'no repo', 'no artifacts', 'no executive summary', 'stage is discovery'],
};

describe('CaseStudyKpi — the defect fix', () => {
  it('labels the score instead of rendering a bare number', async () => {
    // The operator asked "what is the number all the way to the right?" — a score
    // nobody can name is not a KPI.
    await render(<CaseStudyKpi readiness={readiness} />);
    expect(container.textContent).toContain('Case Study');
    expect(container.textContent).toContain('31');
    expect(container.textContent).toContain('/100');
    expect(container.textContent!.trim()).not.toBe('31');
  });

  it('exposes the full weighted breakdown so the number can be traced', async () => {
    await render(<CaseStudyKpi readiness={readiness} />);
    const title = container.querySelector('[title]')!.getAttribute('title')!;
    for (const c of readiness.components) expect(title).toContain(c.label);
    expect(title).toContain('no repo');
  });

  it('says "Case Study" rather than scoring one already converted', async () => {
    await render(<CaseStudyKpi readiness={readiness} alreadyCaseStudy />);
    expect(container.textContent).toContain('Case Study');
    expect(container.textContent).not.toContain('/100');
  });

  it('breakdown reports each component in points out of its weight', () => {
    const text = readinessBreakdown(readiness);
    expect(text).toContain('Case Study Readiness 31/100');
    expect(text).toContain('Build plan complete: 31/40');
    expect(text).toContain('Code repository: 0/20 — no repo');
  });
});

describe('BuildEvidencePanel — the empty state is the live case', () => {
  const empty: EvidenceSummary = {
    has_evidence: false, manifests: 0, files_created: 0, files_modified: 0,
    apis_added: 0, ui_components_added: 0, tests_added: 0, database_changes: 0,
    last_execution_at: null,
  };

  it('names the cause and renders NO numeric zeros', async () => {
    // Zeros would assert "they built nothing". The truth is "nothing was recorded".
    await render(<BuildEvidencePanel evidence={empty} />);
    expect(container.querySelector('[data-testid="evidence-empty"]')).not.toBeNull();
    expect(container.textContent).toContain('No build telemetry recorded');
    expect(container.textContent).not.toMatch(/\b0\b/);
  });

  it('treats a null summary the same as no evidence', async () => {
    await render(<BuildEvidencePanel evidence={null} />);
    expect(container.querySelector('[data-testid="evidence-empty"]')).not.toBeNull();
  });

  it('renders the counts once evidence exists', async () => {
    await render(<BuildEvidencePanel evidence={{
      ...empty, has_evidence: true, manifests: 2, files_created: 14,
      apis_added: 3, tests_added: 9, last_execution_at: '2026-08-01T10:00:00.000Z',
    }} />);
    expect(container.querySelector('[data-testid="evidence-summary"]')).not.toBeNull();
    expect(container.textContent).toContain('14');
    expect(container.textContent).toContain('Files created');
  });
});

describe('ArtifactsPanel', () => {
  it('shows an empty state rather than an empty list', async () => {
    await render(<ArtifactsPanel artifacts={[]} />);
    expect(container.querySelector('[data-testid="artifacts-empty"]')).not.toBeNull();
    expect(container.textContent).toContain('No artifacts submitted');
  });

  it('groups versions under one document and shows the latest', async () => {
    await render(<ArtifactsPanel artifacts={[{
      name: 'System Requirements Specification',
      latest_version: 8,
      versions: [
        { version: 8, submission_id: 'a', title: 'SRS', file_name: null, has_content: true, submitted_at: '2026-05-22T12:33:43Z', stage: 'discovery' },
        { version: 2, submission_id: 'b', title: 'SRS', file_name: null, has_content: true, submitted_at: '2026-04-26T11:38:36Z', stage: 'discovery' },
      ],
    }]} />);
    expect(container.textContent).toContain('System Requirements Specification');
    expect(container.textContent).toContain('v8');
    expect(container.textContent).toContain('2 versions');
  });

  it('offers no file link when file_name is null — a dead link is worse than none', async () => {
    await render(<ArtifactsPanel artifacts={[{
      name: 'Spec', latest_version: 1,
      versions: [{ version: 1, submission_id: 'a', title: null, file_name: null, has_content: true, submitted_at: null, stage: null }],
    }]} />);
    expect(container.querySelector('a[href]')).toBeNull();
  });
});

describe('ReleaseRow', () => {
  const base = {
    release_key: 'r0', total: 3, complete: 2, overdue: 0,
    starts_on: '2026-08-20', ends_on: '2026-08-28',
  };

  it('shows the readable release name, not the internal key', async () => {
    await render(<ReleaseRow release={{ ...base, display_name: 'Release 0 · Initial Setup and Trust Spine' }} />);
    expect(container.textContent).toContain('Release 0 · Initial Setup and Trust Spine');
  });

  it('falls back to the raw key when no name exists', async () => {
    await render(<ReleaseRow release={base} />);
    expect(container.textContent).toContain('r0');
  });

  it('renders the definition of done when present', async () => {
    await render(<ReleaseRow release={{ ...base, lands_when: 'Show a production change requiring human approval.' }} />);
    expect(container.textContent).toContain('Lands when:');
    expect(container.textContent).toContain('human approval');
  });

  it('renders NO lands-when block when absent — not an empty quote', async () => {
    await render(<ReleaseRow release={{ ...base, lands_when: null }} />);
    expect(container.textContent).not.toContain('Lands when');
  });

  it('reports unverified separately from on time', async () => {
    // The rule that matters: unverified work is unknown, not on-time.
    await render(<ReleaseRow release={{
      ...base,
      timing: { on_time: 5, late: 2, unverified: 3, open: 1, undated: 0, on_time_pct: 71 },
    }} />);
    expect(container.textContent).toContain('5 on time');
    expect(container.textContent).toContain('2 late');
    expect(container.textContent).toContain('3 unverified');
    expect(container.textContent).toContain('71% on time');
  });
});
