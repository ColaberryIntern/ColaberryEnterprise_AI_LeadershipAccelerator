import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import LivePromptCard from '../LivePromptCard';
import type { BroadcastPrompt } from '../../../services/onboardingApi';

/**
 * One Prompt Drop on two surfaces.
 *
 * THE POINT OF THESE TESTS IS THE DIFFERENCE, not the sameness. `pasteWhere`, `ccMode` and
 * `rescue` have been in the payload since the instructor deck started sending them and NO
 * surface has ever rendered any of them — which is the kind of gap that stays invisible
 * forever, because nothing errors and the card looks complete. The phone must keep dropping
 * them (one thumb, a moving class) and the laptop must now show them, so both halves are
 * pinned: the desktop card shows them, and the CONTROL is that the phone card still does not.
 */

const PROMPT: BroadcastPrompt = {
  label: 'Build the dashboard',
  prompt: 'Create a dashboard that shows last month by region.',
  pasteWhere: 'Claude Code',
  ccMode: 'Plan Mode',
  expectedResult: 'a chart appears',
  stopCondition: 'it errors twice',
  rescue: 'Press Escape and paste it again.',
};

let container: HTMLDivElement;
let root: Root;
let copy: jest.Mock;

async function render(props: Partial<React.ComponentProps<typeof LivePromptCard>> = {}) {
  copy = jest.fn().mockResolvedValue(undefined);
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<LivePromptCard prompt={PROMPT} copy={copy} {...props} />);
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = () => container.textContent || '';

describe('what every surface shows', () => {
  it('keeps the testid the phone deck\'s own suite already asserts', async () => {
    // The card moved out of CompanionDeck; its contract with that suite did not.
    await render();

    expect(find('companion-prompt')).not.toBeNull();
  });

  it('shows the prompt, what to expect and when to stop', async () => {
    await render();

    expect(text()).toContain('Create a dashboard that shows last month by region.');
    expect(text()).toContain('a chart appears');
    expect(text()).toContain('it errors twice');
  });
});

describe('the three fields a phone drops', () => {
  it('shows which tool and which mode on the desktop workspace', async () => {
    await render({ full: true });

    expect(find('prompt-tools')).not.toBeNull();
    expect(text()).toContain('Claude Code');
    expect(text()).toContain('Plan Mode');
  });

  it('shows the rescue line on the desktop workspace', async () => {
    await render({ full: true });

    expect(find('prompt-rescue')).not.toBeNull();
    expect(text()).toContain('Press Escape and paste it again.');
  });

  it('CONTROL: the phone card still shows none of the three', async () => {
    // Not an oversight being preserved — a one-thumb card that scrolls the prompt off the
    // screen to make room for metadata is worse on the surface it was designed for.
    await render({ full: false });

    expect(find('prompt-tools')).toBeNull();
    expect(find('prompt-rescue')).toBeNull();
    expect(text()).not.toContain('Plan Mode');
  });

  it('omits the tool strip entirely when the week declared neither field', async () => {
    await render({
      full: true,
      prompt: { label: 'Try it', prompt: 'do the thing' },
    });

    expect(find('prompt-tools')).toBeNull();
  });
});

describe('copying the prompt', () => {
  it('copies the prompt text and says so', async () => {
    await render();
    await act(async () => { find('prompt-copy')!.click(); });

    expect(copy).toHaveBeenCalledWith('Create a dashboard that shows last month by region.');
    expect(find('prompt-copy')!.textContent).toBe('Copied');
  });

  it('says copying is blocked rather than claiming it worked', async () => {
    // `navigator.clipboard` is absent on an insecure origin and in several in-app browsers.
    // A button that flashes "Copied" over an empty clipboard is the worst of the options.
    await render();
    copy.mockRejectedValue(new Error('NoClipboard'));
    await act(async () => { find('prompt-copy')!.click(); });

    expect(find('prompt-copy')!.textContent).toBe('Copy prompt');
    expect(text()).toContain('Copying is blocked in this browser');
  });
});

describe('it looks like Colaberry', () => {
  it('uses semantic tokens rather than hardcoded colors, so dark mode holds', async () => {
    await render();
    const css = container.querySelector('style')?.textContent || '';

    expect(css).toContain('var(--surface-card)');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
