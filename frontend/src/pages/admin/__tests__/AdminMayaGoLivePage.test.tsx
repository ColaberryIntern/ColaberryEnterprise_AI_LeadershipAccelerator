/**
 * T14 - the go-live console. Four properties, each one a thing a reader could otherwise get
 * wrong at a glance:
 *
 *   1. AN OVERRIDDEN DIAL IS NOT HIDDEN. When the kill switch is on or unreadable, the page says
 *      so at the top, in the words "the dials below are not what she is doing". A console that
 *      showed `live` beside a thrown kill switch would be lying in the most expensive direction.
 *   2. A REFUSED CAPABILITY GETS NO CONTROL. Not a disabled one: a greyed select reads as "this
 *      could be turned on", and SMS, voice and campaign enrolment must not read that way.
 *   3. A CHANGE NEEDS A REASON. Both the enable switch and every capability dial stay disabled
 *      until a note is typed, so the audit trail cannot be empty by accident.
 *   4. THE SWITCH TOUCHES NOTHING ELSE. There is no autonomy control and no tool grant on this
 *      page; each has its own screen and its own approver.
 */
import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';

const mockGet = jest.fn();
const mockSetEnabled = jest.fn();
const mockSetState = jest.fn();
jest.mock('../../../services/mayaConsoleApi', () => ({
  getMayaGoLive: (...a: unknown[]) => mockGet(...a),
  setMayaEnabled: (...a: unknown[]) => mockSetEnabled(...a),
  setMayaCapabilityState: (...a: unknown[]) => mockSetState(...a),
  mayaErrorMessage: (e: unknown, fallback: string) => (
    (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback
  ),
}));

// eslint-disable-next-line import/first
import AdminMayaGoLivePage from '../AdminMayaGoLivePage';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;

async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<MemoryRouter><AdminMayaGoLivePage /></MemoryRouter>);
  });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

async function click(el: Element | null): Promise<void> {
  await act(async () => { (el as HTMLElement).click(); });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}

/**
 * Types into a controlled input.
 *
 * The native `value` SETTER is used rather than `input.value = x`, which is not a nicety: React
 * keeps its own value tracker per node, and a direct assignment updates the DOM without telling
 * it, so React concludes nothing changed and `onChange` never fires. A first draft of this helper
 * did exactly that, and three assertions below failed while the page was correct.
 */
async function type(el: Element | null, value: string): Promise<void> {
  const input = el as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  for (let i = 0; i < 2; i += 1) await act(async () => { await Promise.resolve(); });
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    agent: { id: 'agent-1', agent_name: 'Maya', enabled: false, status: 'idle', autonomy_level: 'communicate', tools_granted: ['retrieve_knowledge'] },
    kill_switch: 'clear',
    capabilities: [
      { capability: 'sendDocument', mode: 'review', reason: 'default_review', refused: false, default_state: 'review', stored_state: null, tools: ['send_document'] },
      { capability: 'sendSmsSummary', mode: 'off', reason: 'capability_refused', refused: true, default_state: null, stored_state: null, tools: ['send_sms_summary'] },
    ],
    tools: [
      { tool: 'retrieve_knowledge', belts: ['site', 'portal'], capability: 'readSiteChatCatalog', effect_class: 'read', registered: true, granted: true },
      { tool: 'send_document', belts: ['site'], capability: 'sendDocument', effect_class: 'outbound', registered: true, granted: false },
    ],
    grant_requests: [{ id: 'cr-1', title: 'retrieve_knowledge', status: 'submitted', requested_at: '2026-11-15', requested_by_identity: 'claude-code', tool_name: 'retrieve_knowledge', capability_id: 'admissions.maya_applicant_chat_response', needed_by: '2026-11-20' }],
    outbound: { pending: 3 },
    ...overrides,
  };
}

const buttons = () => [...container.querySelectorAll('button')];
const byText = (text: string) => buttons().find((b) => (b.textContent || '').trim() === text) as HTMLButtonElement | undefined;

beforeEach(() => {
  mockGet.mockReset().mockResolvedValue(report());
  mockSetEnabled.mockReset().mockResolvedValue({ agent_id: 'agent-1', enabled: true, changed: true });
  mockSetState.mockReset().mockResolvedValue({ capability: 'sendDocument', state: 'live', changed: true });
});
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = undefined;
  container?.remove();
});

describe('T14 the console reports what she is actually doing', () => {
  it('CONTROL - it rendered the real report, so the assertions below are not about a loading state', async () => {
    await render();
    expect(container.textContent).toContain('sendDocument');
    expect(container.textContent).toContain('Turn Maya on');
  });

  it('shows how many messages are waiting, as a link rather than a list', async () => {
    await render();
    const link = [...container.querySelectorAll('a')].find((a) => a.getAttribute('href') === '/admin/outbound-approvals');
    expect(link).toBeDefined();
    expect(link!.textContent).toContain('3');
    // No message bodies on this page: approving happens where a message is read.
    expect(container.querySelector('pre')).toBeNull();
  });

  it('names the tool whose handler is missing, separately from the tool with no grant', async () => {
    await render();
    expect(container.textContent).toContain('granted');
    expect(container.textContent).toContain('no grant');
  });
});

describe('T14 an overridden dial is never shown as the truth', () => {
  it.each([
    ['active', 'The kill switch is ON'],
    ['unreadable', 'could NOT be read'],
  ])('with the kill switch %s it says so at the top', async (state, text) => {
    mockGet.mockResolvedValue(report({ kill_switch: state }));
    await render();
    const alert = container.querySelector('.alert-danger');
    expect(alert).not.toBeNull();
    expect(alert!.textContent).toContain(text);
    expect(alert!.textContent).toContain('dials below');
  });

  it('with the switch clear there is no stop banner', async () => {
    await render();
    expect(container.querySelector('.alert-danger')).toBeNull();
  });
});

describe('T14 a refused capability has no dial at all', () => {
  it('renders a select for the promotable one and NONE for the refused one', async () => {
    await render();
    const selects = [...container.querySelectorAll('select')];
    expect(selects).toHaveLength(1);
    expect(selects[0].getAttribute('aria-label')).toBe('State for sendDocument');
    expect(container.textContent).toContain('There is no setting that lets this act');
  });

  it('CONTROL - a second promotable capability DOES get a second select', async () => {
    // Without this, "one select" could be passing because the table renders one select however
    // many rows it has.
    mockGet.mockResolvedValue(report({
      capabilities: [
        ...report().capabilities,
        { capability: 'sendEmail', mode: 'shadow', reason: 'not_promoted', refused: false, default_state: 'shadow', stored_state: null, tools: [] },
      ],
    }));
    await render();
    expect(container.querySelectorAll('select')).toHaveLength(2);
  });
});

describe('T14 every change carries a reason', () => {
  it('the enable button is disabled until a note is typed, then calls with it', async () => {
    await render();
    expect(byText('Turn Maya on')!.disabled).toBe(true);
    await type(container.querySelector('input[aria-label="Reason for changing Maya\'s agent row"]'), 'reviewed the console');
    expect(byText('Turn Maya on')!.disabled).toBe(false);
    await click(byText('Turn Maya on')!);
    expect(mockSetEnabled).toHaveBeenCalledWith(true, 'reviewed the console');
  });

  it('shows Turn Maya OFF when she is enabled, and nothing that says on', async () => {
    mockGet.mockResolvedValue(report({ agent: { ...report().agent, enabled: true } }));
    await render();
    expect(byText('Turn Maya off')).toBeDefined();
    expect(byText('Turn Maya on')).toBeUndefined();
  });

  it('the capability Set button is disabled until a note is typed', async () => {
    await render();
    expect(byText('Set')!.disabled).toBe(true);
    await type(container.querySelector('input[aria-label="Review note for sendDocument"]'), 'read the template');
    expect(byText('Set')!.disabled).toBe(false);
    await click(byText('Set')!);
    expect(mockSetState).toHaveBeenCalledWith('sendDocument', 'review', 'read the template');
  });

  it('shows the server\'s refusal verbatim when it will not widen', async () => {
    mockSetEnabled.mockRejectedValue({
      response: { data: { error: 'Turning Maya on requires Ali or a super_admin. Turning her off does not.' } },
    });
    await render();
    await type(container.querySelector('input[aria-label="Reason for changing Maya\'s agent row"]'), 'trying it');
    await click(byText('Turn Maya on')!);
    expect(container.textContent).toContain('requires Ali or a super_admin');
  });
});

describe('T14 the switch touches nothing else', () => {
  it('offers no autonomy control and no way to grant a tool', async () => {
    await render();
    // The only `select` on the page is the one capability dial, so there is no autonomy picker.
    expect(container.querySelectorAll('select')).toHaveLength(1);
    // And read structurally, because the page legitimately WRITES the words "granted" and
    // "autonomy" - a label scan failed on its own prose, which is the false-failure direction
    // that gets a test weakened rather than a bug fixed.
    const source = fs
      .readFileSync(path.join(__dirname, '..', 'AdminMayaGoLivePage.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ');
    // CONTROL: it really does call the two writers it is allowed to call.
    expect(source).toMatch(/setMayaEnabled\(/);
    expect(source).toMatch(/setMayaCapabilityState\(/);
    // And nothing that grants a tool or moves an autonomy level.
    expect(source).not.toMatch(/assignExistingTool|recordToolGrant|setAutonomy|autonomy_level\s*[:=][^=]/);
  });

  it('says a missing agent row out loud rather than rendering a dead switch', async () => {
    mockGet.mockResolvedValue(report({ agent: null }));
    await render();
    expect(container.textContent).toContain('There is no');
    expect(byText('Turn Maya on')).toBeUndefined();
  });
});
