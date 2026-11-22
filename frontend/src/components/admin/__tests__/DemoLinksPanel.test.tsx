import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DemoLinksPanel from '../DemoLinksPanel';
import * as projectDemoApi from '../../../services/projectDemoApi';
import type { DemoLinkDirectory } from '../../../services/projectDemoApi';

/**
 * The panel's one job is not to show a link that does not work.
 *
 * This repo has no @testing-library; component tests render through react-dom/client + act and
 * read `container.textContent` (see `components/admin/agentDetailV2/__tests__`). That makes the
 * assertions blunt, so they are written as PAIRS: for every state, what is shown AND what is not.
 * An anchor is checked by querying `a[href]`, because "the text says Open demo" would pass on a
 * span and the whole point is whether something is clickable.
 */
jest.mock('../../../services/projectDemoApi');

const PUBLISHED = {
  project_id: 'p-published',
  name: 'Dispatch console',
  enrollment_id: 'enr-1',
  state: 'published' as const,
  url: '/api/public/demo/tok-abc',
  event_count: 6,
};
const GENERATED = {
  project_id: 'p-generated',
  name: 'Shift planner',
  enrollment_id: 'enr-2',
  state: 'generated' as const,
  url: null,
  event_count: 4,
};
const NONE = {
  project_id: 'p-none',
  name: 'Intake triage',
  enrollment_id: 'enr-3',
  state: 'none' as const,
  url: null,
  event_count: 0,
};

const directory = (over: Partial<DemoLinkDirectory> = {}): DemoLinkDirectory => ({
  rows: [PUBLISHED, GENERATED, NONE],
  counts: { published: 1, generated: 1, none: 1 },
  truncated: false,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<DemoLinksPanel />);
  });
  // The panel is collapsible and starts CLOSED, so a text assertion would read an empty body.
  // Opening it is part of rendering it for test purposes.
  const header = container.querySelector('button, [role="button"], .admin-section-card__header');
  if (header) {
    await act(async () => { (header as HTMLElement).click(); });
  }
}

afterEach(() => {
  act(() => { root?.unmount(); });
  container?.remove();
  jest.resetAllMocks();
});

const api = projectDemoApi as jest.Mocked<typeof projectDemoApi>;

describe('what the panel shows per state', () => {
  it('renders a real anchor for a published demo, pointing at the url the API gave', async () => {
    api.listProjectDemoLinks.mockResolvedValue(directory({ rows: [PUBLISHED], counts: { published: 1, generated: 0, none: 0 } }));
    await render();
    const links = Array.from(container.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('/api/public/demo/tok-abc');
    // A public link opened from an admin page must not hand the opener a window reference.
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(container.textContent).toContain('Dispatch console');
  });

  it('renders NO anchor for a demo that is built but not published', async () => {
    // The trap. The token exists in the database and the public route refuses it, so a link here
    // would send a staff member to a 404 and produce a bug report about a feature working
    // correctly.
    api.listProjectDemoLinks.mockResolvedValue(directory({ rows: [GENERATED], counts: { published: 0, generated: 1, none: 0 } }));
    await render();
    expect(container.querySelectorAll('a[href]')).toHaveLength(0);
    expect(container.textContent).toContain('waiting for the student to publish it');
  });

  it('says "No demo yet" for a project with no demo, and renders no anchor', async () => {
    api.listProjectDemoLinks.mockResolvedValue(directory({ rows: [NONE], counts: { published: 0, generated: 0, none: 1 } }));
    await render();
    expect(container.querySelectorAll('a[href]')).toHaveLength(0);
    expect(container.textContent).toContain('No demo yet');
  });

  it('across a mixed estate, exactly the published rows are clickable', async () => {
    api.listProjectDemoLinks.mockResolvedValue(directory());
    await render();
    const links = Array.from(container.querySelectorAll('a[href]')) as HTMLAnchorElement[];
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/api/public/demo/tok-abc']);
    // All three projects are listed, so the two without links are present rather than hidden.
    expect(container.textContent).toContain('Dispatch console');
    expect(container.textContent).toContain('Shift planner');
    expect(container.textContent).toContain('Intake triage');
  });
});

describe('the states it reports to the reader', () => {
  it('summarizes the counts', async () => {
    api.listProjectDemoLinks.mockResolvedValue(directory());
    await render();
    expect(container.textContent).toContain('1 published');
    expect(container.textContent).toContain('1 not published');
    expect(container.textContent).toContain('1 with no demo');
  });

  it('says the list is partial when it is', async () => {
    api.listProjectDemoLinks.mockResolvedValue(directory({ truncated: true }));
    await render();
    expect(container.textContent).toContain('There are more than this list holds');
  });

  it('does not say it is partial when it is not', async () => {
    api.listProjectDemoLinks.mockResolvedValue(directory({ truncated: false }));
    await render();
    expect(container.textContent).not.toContain('There are more than this list holds');
  });

  it('shows an empty state rather than a bare table when there are no projects', async () => {
    api.listProjectDemoLinks.mockResolvedValue(directory({ rows: [], counts: { published: 0, generated: 0, none: 0 } }));
    await render();
    expect(container.querySelectorAll('table')).toHaveLength(0);
    expect(container.textContent).toContain('No projects yet');
  });

  it('shows a warning and no table when the request fails, rather than an empty estate', async () => {
    // An empty list and a failed request look identical to a reader, and "no demos exist" is a
    // conclusion somebody would act on.
    api.listProjectDemoLinks.mockRejectedValue(new Error('boom'));
    await render();
    expect(container.textContent).toContain('Could not load the demo directory');
    expect(container.querySelectorAll('table')).toHaveLength(0);
    expect(container.querySelectorAll('a[href]')).toHaveLength(0);
  });

  it('does not leak the error message from the server into the page', async () => {
    api.listProjectDemoLinks.mockRejectedValue(new Error('relation "projects" does not exist'));
    await render();
    expect(container.textContent).not.toContain('relation');
  });
});

describe('read only, asserted', () => {
  it('renders no publish, enable or revoke control of any kind', async () => {
    /*
     * Publishing exposes a student's work at an unauthenticated URL and is their decision, taken
     * in their own portal. The only button this panel may have is Copy link. Asserted so a later
     * change that adds a control has to argue with this test rather than slip past it.
     */
    api.listProjectDemoLinks.mockResolvedValue(directory());
    await render();
    /*
     * Scoped to the TABLE, not the whole card. `SectionCard`'s collapsible header is itself a
     * button and its label carries the subtitle, which legitimately contains the word "published"
     * in "1 published, 1 not published". Sweeping every button therefore failed on the summary
     * copy rather than on a control, which is a test reading the wrong thing rather than a defect.
     */
    const table = container.querySelector('table');
    expect(table).not.toBeNull();
    const labels = Array.from(table!.querySelectorAll('button')).map((b) => (b.textContent || '').toLowerCase());
    for (const label of labels) {
      expect(label).not.toContain('publish');
      expect(label).not.toContain('enable');
      expect(label).not.toContain('revoke');
      expect(label).not.toContain('disable');
    }
    // And the control that IS allowed exists, so the assertion above is not passing on an empty
    // list of buttons.
    expect(labels.some((l) => l.includes('copy link'))).toBe(true);
  });
});
