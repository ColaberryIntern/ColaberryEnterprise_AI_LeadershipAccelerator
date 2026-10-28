import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentEmailTab from '../AgentEmailTab';
import type { AgentEmailInbox } from '../../../../services/agentEmailApi';

/**
 * The first tests this component has ever had. It shipped on 2026-10-26 with none, which is how
 * the Explorer preview below came to be added to a surface whose existing behaviour was unpinned -
 * so these cover what was already there as well as what this change adds.
 *
 * The pair that matters most is "shows the panel for Maya" / "does not show it for Reese". That is
 * the assertion the `explorerPreviewAgents` allowlist exists to make possible, and the one that
 * would have caught the employee-facts defect if its Reese-only gate had ever been written as data.
 */

// See the note in AgentEmailExplorerPreview.test.tsx: this repo sets the flag per test file.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../../services/agentEmailApi', () => ({
  getAgentEmailInbox: jest.fn(),
  approveAgentEmailDraft: jest.fn(),
  discardAgentEmailDraft: jest.fn(),
}));

jest.mock('../../../../services/explorerGrowthApi', () => ({
  getSummary: jest.fn(),
  getShadow: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const emailApi = require('../../../../services/agentEmailApi');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const explorerApi = require('../../../../services/explorerGrowthApi');

function inbox(over: Partial<AgentEmailInbox> = {}): AgentEmailInbox {
  return {
    agentName: 'Maya',
    drafts: [],
    sent: [],
    inbound: { items: [], reason: 'no_agent_address' },
    ...over,
  };
}

const DRAFT = {
  id: 'draft-1',
  toEmail: 'learner@example.com',
  subject: 'Your next step',
  body: 'Body text',
  status: 'agent_draft',
  draftReason: 'transport_not_wired',
  createdAt: '2026-10-27T15:00:00Z',
  approvedBy: null,
};

let container: HTMLDivElement;
let root: Root;

async function render(agentId = 'maya-id'): Promise<void> {
  await act(async () => {
    root.render(<AgentEmailTab agentId={agentId} />);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
  explorerApi.getSummary.mockResolvedValue({
    decision_date: '2026-09-02', modes: ['SHADOW'], total: 153, waited: 11,
    actionable: 142, with_content: 130, executed: 0, gaps: 12, learners_with_profile: 647,
  });
  explorerApi.getShadow.mockResolvedValue({
    rows: [], total: 0, limit: 10, offset: 0, decision_date: '2026-09-02',
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('AgentEmailTab', () => {
  it('states on the surface that approving does not send', () => {
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox());
    return render().then(() => {
      expect(container.textContent ?? '').toContain('Approving does not send');
    });
  });

  it('shows the Explorer Growth preview for Maya', () => {
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox({ agentName: 'Maya' }));
    return render().then(() => {
      expect(container.textContent ?? '').toContain('Explorer Growth');
      expect(explorerApi.getSummary).toHaveBeenCalledTimes(1);
    });
  });

  it('does NOT show it for Reese, and does not even call the endpoints', () => {
    // Not merely hidden: an agent off the allowlist must not issue the requests at all, so the
    // panel cannot become a silent extra admin call on every other agent's Email tab.
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox({ agentName: 'Reese' }));
    return render('reese-id').then(() => {
      expect(container.textContent ?? '').not.toContain('what the journey decided');
      expect(explorerApi.getSummary).not.toHaveBeenCalled();
      expect(explorerApi.getShadow).not.toHaveBeenCalled();
    });
  });

  it('explains an absent mailbox instead of rendering an empty reply list', () => {
    // "Nobody replied" and "she has no address to be replied to" lead to opposite actions.
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox());
    return render().then(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('no email address yet');
      expect(text).not.toContain('No replies yet');
    });
  });

  it('separates a draft needing configuration from one needing a decision', () => {
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox({ drafts: [DRAFT] }));
    return render().then(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Needs configuration');
      expect(text).toContain('Cleared every check; sending is not switched on yet');
      expect(text).not.toContain('Needs a decision');
    });
  });

  it('labels an autonomy block as a decision a human can actually clear', () => {
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox({
      drafts: [{ ...DRAFT, draftReason: 'autonomy_insufficient:observe' }],
    }));
    return render().then(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Needs a decision');
      expect(text).toContain('only "communicate" may send');
    });
  });

  it('reports a load failure without claiming the agent has no email', () => {
    emailApi.getAgentEmailInbox.mockRejectedValue(new Error('boom'));
    return render().then(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Could not load');
      expect(text).not.toContain('No email for this agent');
    });
  });
});
