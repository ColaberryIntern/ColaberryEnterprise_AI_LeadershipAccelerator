import React from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentEmailExplorerPreview from '../AgentEmailExplorerPreview';
import type { ExplorerSummary, ExplorerDecisionPage } from '../../../../services/explorerGrowthApi';

// This repo's convention for `createRoot` + `act` tests (see the campus and caseStudy suites):
// without it React logs "the current testing environment is not configured to support act(...)"
// on every render, which is noise a reader learns to scroll past - and scrolling past warnings is
// how a real one gets missed.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../../services/explorerGrowthApi', () => ({
  getSummary: jest.fn(),
  getShadow: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../../services/explorerGrowthApi');

const SUMMARY: ExplorerSummary = {
  decision_date: '2026-09-02',
  modes: ['SHADOW'],
  total: 153,
  waited: 11,
  actionable: 142,
  with_content: 130,
  executed: 0,
  gaps: 12,
  learners_with_profile: 647,
};

function row(over: Partial<ExplorerDecisionPage['rows'][0]> = {}): ExplorerDecisionPage['rows'][0] {
  return {
    id: 'd1',
    enrollment_id: 'e1',
    lead_id: null,
    ghl_url: null,
    decision_date: '2026-09-02',
    mode: 'SHADOW',
    selected_action: 'SEND_EMAIL' as ExplorerDecisionPage['rows'][0]['selected_action'],
    channel: 'email',
    executed: false,
    reason: 'state=EXPLORING, asset matched',
    suppressed_count: 0,
    asset_count: 1,
    email_normalized: 'learner@example.com',
    primary_state: 'EXPLORING',
    e_score: 40,
    i_score: 30,
    f_score: 10,
    // The draft the decision produced (Phase 2). Null here on purpose: this
    // preview renders a count and a verdict, not the copy, so a fixture carrying
    // a subject would suggest it displays one. The REQUIRED-ness of these three
    // fields is what brought this fixture to my attention at all, which is the
    // contract layer doing its job rather than a chore.
    scheduled_email_id: null,
    draft_subject: null,
    draft_status: null,
    ...over,
  };
}

function page(rows: ExplorerDecisionPage['rows']): ExplorerDecisionPage {
  return { rows, total: rows.length, limit: 10, offset: 0, decision_date: '2026-09-02' };
}

let container: HTMLDivElement;
let root: Root;

async function render(): Promise<void> {
  await act(async () => {
    root.render(<AgentEmailExplorerPreview agentName="Maya" />);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AgentEmailExplorerPreview', () => {
  it('renders the run counts, and labels them as the journey’s decisions rather than the agent’s', () => {
    api.getSummary.mockResolvedValue(SUMMARY);
    api.getShadow.mockResolvedValue(page([row()]));

    return render().then(() => {
      const text = container.textContent ?? '';
      // The attribution sentence is the load-bearing copy on this panel: these rows carry no
      // agent attribution at all, so the screen must not imply Maya produced them.
      expect(text).toContain('Explorer Growth’s');
      expect(text).toContain('not Maya’s work');
      expect(text).toContain('Nothing here has been sent');
      expect(text).toContain('142');
      expect(text).toContain('153');
    });
  });

  it('says how old the run is, so the most recent run is not mistaken for today’s', () => {
    api.getSummary.mockResolvedValue(SUMMARY);
    api.getShadow.mockResolvedValue(page([row()]));

    return render().then(() => {
      // 2026-09-02 is fixed and in the past, so this stays true as the clock moves forward.
      expect(container.textContent ?? '').toContain('days old');
    });
  });

  it('does not nag about staleness for a run made today', () => {
    const today = new Date().toISOString().slice(0, 10);
    api.getSummary.mockResolvedValue({ ...SUMMARY, decision_date: today });
    api.getShadow.mockResolvedValue(page([row({ decision_date: today })]));

    return render().then(() => {
      expect(container.textContent ?? '').not.toContain('days old');
    });
  });

  it('flags a decision with no asset as a gap instead of rendering a bare zero', () => {
    api.getSummary.mockResolvedValue(SUMMARY);
    api.getShadow.mockResolvedValue(page([row({ id: 'gap', asset_count: 0 })]));

    return render().then(() => {
      expect(container.textContent ?? '').toContain('No asset');
    });
  });

  it('distinguishes an admin-only refusal from a broken panel', () => {
    // The Email tab is requireAgentManagerOrAdmin; Explorer Growth is requireAdmin. A manager who
    // is not an admin reaches this tab and is refused these calls, and that is not an error.
    api.getSummary.mockRejectedValue({ response: { status: 403 } });
    api.getShadow.mockRejectedValue({ response: { status: 403 } });

    return render().then(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('admin-only');
      expect(text).toContain('Nothing is wrong with this agent');
      expect(container.querySelector('.text-danger')).toBeNull();
    });
  });

  it('reports a real failure as a failure, and says the rest of the tab still works', () => {
    api.getSummary.mockRejectedValue({ response: { status: 500 } });
    api.getShadow.mockRejectedValue({ response: { status: 500 } });

    return render().then(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Could not load the Explorer Growth feed');
      expect(text).toContain('rest of this tab is unaffected');
      expect(text).not.toContain('admin-only');
    });
  });

  it('says so plainly when the run produced no actionable rows', () => {
    api.getSummary.mockResolvedValue({ ...SUMMARY, actionable: 0 });
    api.getShadow.mockResolvedValue(page([]));

    return render().then(() => {
      expect(container.textContent ?? '').toContain('No actionable, unsent decisions');
    });
  });

  it('reads only. The source carries no mutating call and no mailer import', () => {
    // THE POINT OF THIS TEST: the panel's "it cannot send" property should be checked, not
    // promised in a comment. Neither `noSendPaths.test.ts` covers this file - both scan backend
    // directory trees that exclude all of `frontend/` - so without this assertion nothing in the
    // repo would notice a write being added here.
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'AgentEmailExplorerPreview.tsx'), 'utf8',
    );

    // Control: a string that MUST be present, so a mis-aimed read cannot pass as a clean scan.
    expect(src).toContain('getShadow');

    for (const verb of ['api.post', 'api.put', 'api.patch', 'api.delete', '.post(', '.put(', '.patch(', '.delete(']) {
      expect(src).not.toContain(verb);
    }
    for (const mod of ['emailService', 'agentEmailApi', 'mandrill', 'nodemailer', 'sequenceService']) {
      expect(src).not.toContain(mod);
    }
  });

  it('calls exactly the two read endpoints and nothing else', () => {
    api.getSummary.mockResolvedValue(SUMMARY);
    api.getShadow.mockResolvedValue(page([row()]));

    return render().then(() => {
      expect(api.getSummary).toHaveBeenCalledTimes(1);
      expect(api.getShadow).toHaveBeenCalledTimes(1);
      expect(api.getShadow).toHaveBeenCalledWith({ limit: 10 });
      // Every other export of the client is untouched. `getWhy` would be a per-row fetch and
      // `getContentHealth` a second library call; neither is wanted on a preview panel.
      expect(Object.keys(api).filter((k) => (api[k] as jest.Mock)?.mock?.calls?.length)).toEqual(
        expect.arrayContaining(['getSummary', 'getShadow']),
      );
    });
  });
});
