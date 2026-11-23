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
  approveAgentReply: jest.fn(),
  rejectAgentReply: jest.fn(),
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

/* ── Agent comms (T12, 2026-11-22): identity, received mail, replies waiting on a person, calls ── */

const IDENTITY = { fromHeader: '"Maya" <maya@colaberry.com>', replyTo: 'maya@reply.colaberry.ai' };
const REPLY = {
  id: 'r-1', toAddress: 'pat@acme.com', subject: 'Re: Question about the pilot',
  body: '<p>Hi Pat,</p>\n<p>A pilot runs a few weeks &amp; we tailor it.</p>\n<p>Maya</p>',
  status: 'pending_approval', createdAt: '2026-11-22T15:00:00Z', expiresAt: null,
};

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

function buttonNamed(label: RegExp): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) => label.test(x.textContent ?? ''));
  if (!b) throw new Error(`no button ${label}`);
  return b as HTMLButtonElement;
}

describe('AgentEmailTab: agent comms', () => {
  it('the identity line shows who she sends as and where replies go', () => {
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox({ identity: IDENTITY, inbound: { items: [], reason: null } }));
    return render().then(() => {
      const line = container.querySelector('[data-testid="agent-identity"]')?.textContent ?? '';
      expect(line).toContain('"Maya" <maya@colaberry.com>');
      expect(line).toContain('maya@reply.colaberry.ai');
      expect(container.textContent).toContain('No replies yet.');
    });
  });

  it('received mail and calls render as rows; the number is never shown in full', () => {
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox({
      identity: IDENTITY,
      inbound: { reason: null, items: [{ id: 'i-1', fromAddress: 'pat@acme.com', subject: 'Question about the pilot', preview: 'How long is a pilot?', leadId: null, receivedAt: '2026-11-22T14:00:00Z', draftOutcome: 'queued', draftReason: null }] },
      calls: [{ id: 'c-1', leadId: 42, phoneLast4: '0142', status: 'delivered', purpose: 'Answer pilot questions', outcome: 'completed', summary: 'Pat asked about timing.', summaryState: 'summarized', createdAt: '2026-11-22T16:00:00Z' }],
    }));
    return render().then(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Received (1)');
      expect(text).toContain('How long is a pilot?');
      expect(text).toContain('Reply drafted, waiting on a person');
      expect(text).toContain('Calls (1)');
      expect(text).toContain('Pat asked about timing.');
      expect(text).toContain('Completed');
      expect(text).toContain('0142');
    });
  });

  it('a waiting reply shows the EXACT words to be sent; Approve sends it through the review endpoint and the row leaves', async () => {
    emailApi.getAgentEmailInbox.mockResolvedValueOnce(inbox({ identity: IDENTITY, pendingReplies: { items: [REPLY], reason: null } }))
      .mockResolvedValue(inbox({ identity: IDENTITY, pendingReplies: { items: [], reason: null } }));
    emailApi.approveAgentReply.mockResolvedValue({ ok: true, id: 'r-1', status: 'sent' });
    await render();
    const card = container.querySelector('[data-testid="pending-reply"]')?.textContent ?? '';
    expect(card).toContain('A pilot runs a few weeks & we tailor it.');
    expect(card).not.toContain('<p>');
    await act(async () => { buttonNamed(/Approve and send as Maya/).click(); });
    await flush();
    expect(emailApi.approveAgentReply).toHaveBeenCalledWith('r-1');
    expect(container.querySelector('[data-testid="pending-reply"]')).toBeNull();
  });

  it('a 403 (not Ali or a super admin) says so plainly and keeps the reply on screen', async () => {
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox({ identity: IDENTITY, pendingReplies: { items: [REPLY], reason: null } }));
    emailApi.approveAgentReply.mockRejectedValue({ response: { status: 403 } });
    await render();
    await act(async () => { buttonNamed(/Approve and send/).click(); });
    await flush();
    expect(container.textContent).toContain('Only Ali or a super admin can approve sending this reply. Nothing was sent.');
    expect(container.querySelector('[data-testid="pending-reply"]')).not.toBeNull();
  });

  it('Reject records a reason and removes the row', async () => {
    emailApi.getAgentEmailInbox.mockResolvedValue(inbox({ identity: IDENTITY, pendingReplies: { items: [REPLY], reason: null } }));
    emailApi.rejectAgentReply.mockResolvedValue({ ok: true, id: 'r-1', status: 'rejected' });
    await render();
    await act(async () => { buttonNamed(/^Reject$/).click(); });
    await flush();
    expect(emailApi.rejectAgentReply).toHaveBeenCalledWith('r-1', expect.any(String));
    expect(container.querySelector('[data-testid="pending-reply"]')).toBeNull();
  });
});
