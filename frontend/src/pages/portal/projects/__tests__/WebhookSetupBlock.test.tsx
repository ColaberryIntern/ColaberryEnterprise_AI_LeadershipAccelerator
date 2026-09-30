/**
 * The setup checklist, state by state.
 *
 * The property worth the most: EVERY TICK IS SERVER TRUTH. "Registered" means we
 * have actually received a delivery from this repo, never that the student
 * pressed a button — a setup step that claims done when it is not is the same
 * class of lie as an acceptance checkbox that does.
 *
 * The second: the block must be OPEN while there is anything to do, and reduce
 * to one line once there is not. Ali expects people to set this once and never
 * touch it.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let mockSetup: Record<string, unknown> | null = null;

jest.mock('../../../../services/workspaceRepoApi', () => ({
  __esModule: true,
  getWebhookSetup: () => (
    mockSetup ? Promise.resolve(mockSetup) : Promise.reject(new Error('not configured'))
  ),
}));

import WebhookSetupBlock from '../WebhookSetupBlock';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => {
  act(() => { root.unmount(); });
  document.body.removeChild(container);
  mockSetup = null;
});

async function mount() {
  await act(async () => {
    root = createRoot(container);
    root.render(<WebhookSetupBlock projectId="p1" repoLabel="ColaberryIntern/AcceleratorTesting" />);
  });
}

const setup = (over: Record<string, unknown> = {}) => ({
  supported: true,
  owner: 'ColaberryIntern',
  repo: 'AcceleratorTesting',
  payload_url: 'https://enterprise.colaberry.ai/api/webhook/github',
  secret: 's3cr3t',
  content_type: 'json',
  events: ['push'],
  gh_command: 'HOOK_ID=$(gh api ...); fi',
  settings_url: 'https://github.com/ColaberryIntern/AcceleratorTesting/settings/hooks/new',
  last_delivery_at: null,
  last_push_at: null,
  ...over,
});

const steps = () => Array.from(container.querySelectorAll('.rt-hook-step'));
const stepState = (i: number) => steps()[i].className.replace('rt-hook-step', '').trim();

describe('nothing set up yet', () => {
  beforeEach(() => { mockSetup = setup(); });

  it('is OPEN, not a collapsed teaser, so Copy command is reachable immediately', async () => {
    await mount();
    // The prompt tells the student to "find the panel and press Copy command".
    // It must not sit behind a disclosure click.
    expect(container.querySelector('.rt-hook.settled')).toBeNull();
    expect(container.textContent).toContain('Copy command');
  });

  it('shows all three steps at once, with the first already done', async () => {
    await mount();
    expect(steps()).toHaveLength(3);
    expect(stepState(0)).toBe('done');           // repo connected
    expect(stepState(1)).toBe('waiting_you');    // webhook — their turn
    expect(stepState(2)).toBe('waiting_github'); // pushes — not yet
    expect(container.querySelector('.rt-hook-count')!.textContent).toBe('1 of 3');
  });

  it('names whose turn it is, rather than showing an ambiguous grey dot', async () => {
    await mount();
    expect(container.querySelector('.rt-hook-tag.you')!.textContent).toBe('Your turn');
    expect(container.querySelector('.rt-hook-tag.gh')!.textContent).toBe('Waiting on GitHub');
  });

  it('keeps the do-not-commit warning on screen while the command is', async () => {
    await mount();
    const warn = container.querySelector('.rt-hook-warn')!;
    expect(warn.textContent).toContain('Do not save this command to a file');
    expect(warn.textContent).toContain('your repo is public');
  });
});

describe('webhook registered — the ping landed', () => {
  beforeEach(() => {
    // A ping counts. This is what turns step 2 green seconds after the command
    // runs, instead of leaving the student waiting on their next push.
    mockSetup = setup({ last_delivery_at: new Date().toISOString(), last_push_at: null });
  });

  it('COLLAPSES to a single line, because the student is done here', async () => {
    await mount();
    const settled = container.querySelector('.rt-hook.settled');
    expect(settled).toBeTruthy();
    expect(settled!.textContent).toContain('ColaberryIntern/AcceleratorTesting');
  });

  it('says plainly that it is waiting for a first push, rather than claiming one', async () => {
    await mount();
    expect(container.querySelector('.rt-hook-when')!.textContent)
      .toBe('webhook registered, waiting for your first push');
  });

  /**
   * THE MILLION ABATE CASE.
   *
   * Their agent asked them to paste the command; the ping had already landed, so
   * the panel had collapsed and the command was gone from the page. The only
   * control was labelled "Change", which is not what a student looks for when
   * they have been told to find a command.
   *
   * A ping means the hook EXISTS. It does not mean the student will never need
   * the command again — re-running it is the documented fix for a hook pointing
   * at a stale URL, and the agent asks for it by name.
   */
  it('names the command on the collapsed line, so a student told to paste it can find it', async () => {
    await mount();
    const btn = container.querySelector('.rt-hook.settled .rt-btn')!;
    expect(btn.textContent).toBe('Show command');
  });

  it('expands to the command itself, not to a panel that has tidied it away', async () => {
    await mount();
    await act(async () => {
      (container.querySelector('.rt-hook.settled .rt-btn') as HTMLButtonElement).click();
    });
    expect(container.querySelectorAll('.rt-hook-cmd')).toHaveLength(1);
    expect(container.querySelector('.rt-hook-cmd')!.textContent).toBe('HOOK_ID=$(gh api ...); fi');
  });

  it('keeps the do-not-commit warning attached to the command it is about', async () => {
    await mount();
    await act(async () => {
      (container.querySelector('.rt-hook.settled .rt-btn') as HTMLButtonElement).click();
    });
    // The command carries a signing secret whenever it is on screen — so the
    // warning travels with it, not with the first-run state it used to sit in.
    expect(container.querySelectorAll('.rt-hook-warn')).toHaveLength(1);
  });

  /**
   * A ping is GitHub saying "I can reach you", nothing more. Ticking "Pushes
   * arriving" off the back of one would tell a student their work was flowing
   * through the loop before any of it had.
   */
  it('does not tick "pushes arriving" on the strength of a ping', async () => {
    await mount();
    await act(async () => {
      (container.querySelector('.rt-hook.settled .rt-btn') as HTMLButtonElement).click();
    });
    expect(stepState(1)).toBe('done');            // the hook exists
    expect(stepState(2)).toBe('waiting_github');  // nothing has been pushed
    expect(container.querySelector('.rt-hook-count')!.textContent).toBe('2 of 3');
  });

  it('withholds the finished check until pushes actually arrive', async () => {
    await mount();
    // The collapsed tick is the page's "this is done" mark. On a ping alone the
    // student's part is done but the loop is not yet closed, and the summary
    // must not claim otherwise.
    expect(container.querySelectorAll('.rt-hook.settled .rt-hook-check.on')).toHaveLength(0);
  });

  it('closes again with Done', async () => {
    await mount();
    await act(async () => {
      (container.querySelector('.rt-hook.settled .rt-btn') as HTMLButtonElement).click();
    });
    expect(container.querySelector('.rt-hook.settled')).toBeNull();
    expect(steps()).toHaveLength(3);
    expect(container.querySelector('.rt-hook-h .rt-btn')!.textContent).toBe('Done');
  });
});

describe('pushes arriving — fully set up', () => {
  beforeEach(() => {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    mockSetup = setup({ last_delivery_at: twoMinutesAgo, last_push_at: twoMinutesAgo });
  });

  it('reduces to one quiet line with a TRUE relative timestamp', async () => {
    await mount();
    expect(container.querySelector('.rt-hook-when')!.textContent).toBe('last push 2 minutes ago');
  });

  it('earns the finished check, which only a real push can turn on', async () => {
    await mount();
    expect(container.querySelectorAll('.rt-hook.settled .rt-hook-check.on')).toHaveLength(1);
  });

  it('still offers the command — a working hook is not a reason to hide it', async () => {
    await mount();
    expect(container.querySelector('.rt-hook.settled .rt-btn')!.textContent).toBe('Show command');
  });

  it('marks all three steps done once expanded', async () => {
    await mount();
    await act(async () => {
      (container.querySelector('.rt-hook.settled .rt-btn') as HTMLButtonElement).click();
    });
    expect(steps().every((_, i) => stepState(i) === 'done')).toBe(true);
    expect(container.querySelector('.rt-hook-count')!.textContent).toBe('3 of 3');
  });
});

describe('degradation', () => {
  it('renders nothing at all when the platform has no webhook URL configured', async () => {
    mockSetup = setup({ supported: false, gh_command: null });
    await mount();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the endpoint fails, leaving the student the Sync button', async () => {
    mockSetup = null;   // the mock rejects
    await mount();
    expect(container.innerHTML).toBe('');
  });
});
