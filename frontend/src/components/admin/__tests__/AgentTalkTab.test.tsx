import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentTalkTab from '../AgentTalkTab';
import { Conversation } from '../../../services/agentManagerConversationApi';
import { ManagerDirective } from '../../../services/managerDirectiveApi';

// AI Agent Dashboard redesign, Checkpoint C (2026-09-02) — Talk tab: real
// conversation + Ask/Direct composer, where Direct creates a real
// ManagerDirective. No automated conflict detection exists, so this pins
// the honest alternative: the real active-directive count/list shown before
// every Direct submission, and the real "can only narrow" guarantee text —
// never a fabricated "no conflicts found" claim.

jest.mock('../../../services/agentManagerConversationApi', () => ({
  getConversation: jest.fn(),
  sendMessage: jest.fn(),
}));
jest.mock('../../../services/managerDirectiveApi', () => ({
  listDirectives: jest.fn(),
  createDirective: jest.fn(),
  revokeDirective: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getConversation, sendMessage } = require('../../../services/agentManagerConversationApi') as {
  getConversation: jest.Mock; sendMessage: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listDirectives, createDirective, revokeDirective } = require('../../../services/managerDirectiveApi') as {
  listDirectives: jest.Mock; createDirective: jest.Mock; revokeDirective: jest.Mock;
};

const EMPTY_CONVERSATION: Conversation = { conversationId: 'c1', agentId: 'agent-1', messages: [] };
const REAL_CONVERSATION: Conversation = {
  conversationId: 'c1', agentId: 'agent-1',
  messages: [
    { id: 'm1', role: 'manager', content: 'Should I hold escalations this week?', createdAt: '2026-09-01T00:00:00Z' },
    { id: 'm2', role: 'agent', content: 'Yes, budget is tight — hold anything under $50 impact.', createdAt: '2026-09-01T00:01:00Z' },
  ],
};

const ACTIVE_DIRECTIVE: ManagerDirective = {
  id: 'd1', directiveText: 'Hold anything under $50 impact until Friday.', status: 'active',
  createdByEmail: 'ali@colaberry.com', createdByOrgMemberId: null, createdAt: '2026-08-30T00:00:00Z',
  revokedAt: null, revokedByEmail: null,
};

let container: HTMLDivElement;
let root: Root;
let confirmSpy: jest.SpyInstance;

// React 18 tracks an input's previous value on the DOM node itself; setting
// `.value` directly and dispatching a plain Event bypasses the native
// setter React's change-detection relies on, so the synthetic onChange
// never fires. Going through the native prototype setter first is the
// standard workaround.
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  jest.clearAllMocks();
  getConversation.mockResolvedValue(EMPTY_CONVERSATION);
  listDirectives.mockResolvedValue([]);
  confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  confirmSpy.mockRestore();
  act(() => { root.unmount(); });
  container.remove();
});

async function renderTab() {
  await act(async () => {
    root.render(<AgentTalkTab agentId="agent-1" />);
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('AgentTalkTab — conversation history', () => {
  it('shows the honest empty state when there are no messages yet', async () => {
    await renderTab();
    expect(container.textContent).toContain('No messages yet — say hello.');
  });

  it('renders real messages from both roles', async () => {
    getConversation.mockResolvedValue(REAL_CONVERSATION);
    await renderTab();
    expect(container.textContent).toContain('Should I hold escalations this week?');
    expect(container.textContent).toContain('Yes, budget is tight — hold anything under $50 impact.');
  });

  it('discloses honestly that no per-message cost/model/trace is tracked', async () => {
    await renderTab();
    expect(container.textContent).toContain('Not tracked at that granularity today');
  });

  it('shows a real error when the conversation fails to load', async () => {
    getConversation.mockRejectedValue({ response: { data: { error: 'Conversation service unavailable' } } });
    await renderTab();
    expect(container.textContent).toContain('Conversation service unavailable');
  });
});

describe('AgentTalkTab — Ask mode', () => {
  it('sends a real message and renders the real updated conversation', async () => {
    sendMessage.mockResolvedValue(REAL_CONVERSATION);
    await renderTab();

    const input = container.querySelector('input.form-control') as HTMLInputElement;
    await act(async () => { typeInto(input, 'Should I hold escalations this week?'); });
    const sendButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Send')!;
    await act(async () => {
      sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(sendMessage).toHaveBeenCalledWith('agent-1', 'Should I hold escalations this week?');
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Yes, budget is tight');
  });

  it('never calls createDirective in Ask mode', async () => {
    sendMessage.mockResolvedValue(REAL_CONVERSATION);
    await renderTab();
    const input = container.querySelector('input.form-control') as HTMLInputElement;
    await act(async () => { typeInto(input, 'hello'); });
    const sendButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Send')!;
    await act(async () => { sendButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(createDirective).not.toHaveBeenCalled();
  });
});

describe('AgentTalkTab — Direct mode', () => {
  it('shows the real active-directive count before submission, never a fabricated conflict check', async () => {
    listDirectives.mockResolvedValue([ACTIVE_DIRECTIVE]);
    await renderTab();
    const directButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Direct'))!;
    await act(async () => { directButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toContain('1 other directive is already active');
  });

  it('confirms with the real "can only narrow" guarantee before creating a directive', async () => {
    createDirective.mockResolvedValue(ACTIVE_DIRECTIVE);
    await renderTab();

    const directButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Direct'))!;
    await act(async () => { directButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const input = container.querySelector('input.form-control') as HTMLInputElement;
    await act(async () => { typeInto(input, 'Hold anything under $50.'); });
    const addButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Add Directive')!;
    await act(async () => { addButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('can only narrow'));
    expect(createDirective).toHaveBeenCalledWith('agent-1', 'Hold anything under $50.');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('does not create a directive if the manager cancels the confirmation', async () => {
    confirmSpy.mockReturnValue(false);
    await renderTab();
    const directButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Direct'))!;
    await act(async () => { directButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const input = container.querySelector('input.form-control') as HTMLInputElement;
    await act(async () => { typeInto(input, 'x'); });
    const addButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Add Directive')!;
    await act(async () => { addButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(createDirective).not.toHaveBeenCalled();
  });
});

describe('AgentTalkTab — Standing Directives', () => {
  it('shows the honest empty state when nothing is active', async () => {
    await renderTab();
    expect(container.textContent).toContain('No standing directives active for this agent.');
  });

  it('renders a real active directive with its real author and revoke control', async () => {
    listDirectives.mockResolvedValue([ACTIVE_DIRECTIVE]);
    await renderTab();
    expect(container.textContent).toContain('Hold anything under $50 impact until Friday.');
    expect(container.textContent).toContain('Set by ali@colaberry.com');
  });

  it('revoke calls the real API and refreshes the list', async () => {
    listDirectives.mockResolvedValue([ACTIVE_DIRECTIVE]);
    revokeDirective.mockResolvedValue({ ...ACTIVE_DIRECTIVE, status: 'revoked' });
    await renderTab();

    const revokeButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Revoke')!;
    await act(async () => { revokeButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(revokeDirective).toHaveBeenCalledWith('agent-1', 'd1');
    expect(listDirectives).toHaveBeenCalledTimes(2); // once on mount, once after revoke
  });
});
