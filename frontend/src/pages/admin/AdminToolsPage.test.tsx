import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import AdminToolsPage from './AdminToolsPage';
import * as agentEffectiveAccessApi from '../../services/agentEffectiveAccessApi';
import { AdminToolsOverview } from '../../services/agentEffectiveAccessApi';

// Reese manager-growth mission, Phase 3 (T09/T10) — R203-R205 happy-path +
// honest-empty-state coverage for the new Admin Tools page. No
// @testing-library — react-dom/client + act, matching this codebase's own
// established pattern (AdminGovQualificationPage.test.tsx).
jest.mock('../../services/agentEffectiveAccessApi');

const baseOverview = (over: Partial<AdminToolsOverview> = {}): AdminToolsOverview => ({
  generatedAt: '2026-10-01T00:00:00.000Z',
  tools: [],
  driftFindings: [],
  ...over,
});

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/admin/tools']}>
        <AdminToolsPage />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  jest.clearAllMocks();
});

describe('AdminToolsPage', () => {
  it('honest empty state: zero tools and zero drift findings never shows fabricated content', async () => {
    (agentEffectiveAccessApi.getAdminToolsOverview as jest.Mock).mockResolvedValue(baseOverview());

    await renderPage();

    expect(container.textContent ?? '').toContain('No tools found');
    expect(container.textContent ?? '').toContain('No drift found');
  });

  it('happy path: a real tool and a real drift finding both render', async () => {
    (agentEffectiveAccessApi.getAdminToolsOverview as jest.Mock).mockResolvedValue(
      baseOverview({
        tools: [
          {
            toolName: 'read_attachments',
            reads: ["The student's attached file"],
            produces: [],
            documented: false,
            assignedAgents: [{ agentId: 'agent-reese', agentName: 'Reese', registered: true, grantedVia: ['GRANTS'], usable: true }],
          },
        ],
        driftFindings: [{ agentName: 'Reese', agentId: 'agent-reese', description: 'read_attachments: granted via GRANTS but absent from tools_granted' }],
      }),
    );

    await renderPage();

    expect(container.textContent ?? '').toContain('read_attachments');
    expect(container.textContent ?? '').toContain('Reese');
    expect(container.textContent ?? '').toContain('absent from tools_granted');
  });

  it('search filters the tool list client-side, by tool name', async () => {
    (agentEffectiveAccessApi.getAdminToolsOverview as jest.Mock).mockResolvedValue(
      baseOverview({
        tools: [
          { toolName: 'read_attachments', reads: [], produces: [], documented: false, assignedAgents: [] },
          { toolName: 'escalate_to_human', reads: [], produces: [], documented: true, assignedAgents: [] },
        ],
      }),
    );

    await renderPage();
    expect(container.textContent ?? '').toContain('read_attachments');
    expect(container.textContent ?? '').toContain('escalate_to_human');

    const search = container.querySelector('input[type="search"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(search, 'escalate');
      search.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent ?? '').not.toContain('read_attachments');
    expect(container.textContent ?? '').toContain('escalate_to_human');
  });

  it('a load failure shows a retry affordance, never a silent blank page', async () => {
    (agentEffectiveAccessApi.getAdminToolsOverview as jest.Mock).mockRejectedValue(new Error('network error'));

    await renderPage();

    expect(container.textContent ?? '').toContain("Couldn't load the tools overview");
  });
});
