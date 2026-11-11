import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ClipMarkButton from '../ClipMarkButton';
import type { ClipMarkResult } from '../../../services/broadcastProducer';

/**
 * D10 — the control a producer presses when something worth cutting happens.
 *
 * EVERY TEST HERE IS ABOUT WHAT IT SAYS BACK, because that is the whole job. A press is a person
 * pressing a button and then looking at the screen, and the four outcomes lead to four different
 * next actions. Collapsing them into worked/did-not is the failure this is written against:
 *
 *   - a duplicate is a CORRECT press that created nothing. Reported as success, a producer who
 *     pressed twice believes they have two clips;
 *   - a failure must never be quiet. A producer who believes a moment was captured stops
 *     watching for it and finds out after the class that it is not in the list.
 */

let container: HTMLDivElement;
let root: Root;

async function render(over: {
  ready?: boolean; notReadyReason?: string; result?: ClipMarkResult; sendMark?: jest.Mock;
} = {}) {
  const sendMark = over.sendMark
    ?? jest.fn().mockResolvedValue(over.result ?? { outcome: 'marked', timecodeSeconds: 167, labelled: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <ClipMarkButton
        sessionId="s1"
        ready={over.ready ?? true}
        notReadyReason={over.notReadyReason}
        sendMark={sendMark}
      />,
    );
  });
  return sendMark;
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const press = async () => { await act(async () => { find('clip-mark')!.click(); }); };
const said = () => find('clip-mark-said')?.textContent || '';

describe('pressing it', () => {
  it('sends only the session id, and nothing about the moment', async () => {
    // The server decides the timecode. A client that could name its own could point a clip at
    // any second of any recording it could name.
    const sendMark = await render();
    await press();

    expect(sendMark).toHaveBeenCalledWith('s1');
    expect(sendMark).toHaveBeenCalledTimes(1);
  });

  it('names the timecode it landed on', async () => {
    await render({ result: { outcome: 'marked', timecodeSeconds: 167, labelled: true } });
    await press();

    expect(said()).toContain('02:47');
  });

  it('says when a mark has no label, without calling it a failure', async () => {
    // The moment is recorded either way. The producer should know it will read as a timecode
    // in the list rather than as a sentence, which is a thing to fix later, not now.
    await render({ result: { outcome: 'marked', timecodeSeconds: 167, labelled: false } });
    await press();

    expect(said()).toContain('02:47');
    expect(said()).toMatch(/no segment note/i);
  });
});

describe('the outcomes that are easy to get wrong', () => {
  it('does NOT report a duplicate as a new mark', async () => {
    await render({ result: { outcome: 'duplicate', timecodeSeconds: 167 } });
    await press();

    expect(said()).toMatch(/already marked/i);
    expect(said()).toMatch(/nothing added/i);
  });

  it('says plainly that a failure did NOT save', async () => {
    // The dangerous reading is "probably fine". It must say the moment is not in the list.
    await render({ result: { outcome: 'failed' } });
    await press();

    expect(said()).toMatch(/did not save/i);
    expect(said()).toMatch(/not in the clip list/i);
  });

  it('turns a refusal into a sentence, never a reason code', async () => {
    await render({ result: { outcome: 'refused', reason: 'no_content_anchor' } });
    await press();

    expect(said()).toMatch(/mark content started/i);
    expect(said()).not.toContain('no_content_anchor');
  });

  it('never prints an unknown reason code either', async () => {
    await render({ result: { outcome: 'refused', reason: 'something_new_from_the_server' } });
    await press();

    expect(said()).not.toContain('something_new_from_the_server');
    expect(said().length).toBeGreaterThan(0);
  });

  it('says something even when the client itself throws', async () => {
    const sendMark = jest.fn().mockRejectedValue(new Error('boom'));
    await render({ sendMark });
    await press();

    expect(said()).toMatch(/did not save/i);
  });
});

describe('before it can be pressed', () => {
  it('is disabled and SAYS WHY rather than disappearing', async () => {
    // A control that vanishes between one poll and the next is indistinguishable from one that
    // was never there - the lesson the strip's own authorization comment records.
    await render({ ready: false, notReadyReason: 'Press Mark content started first.' });

    expect((find('clip-mark') as HTMLButtonElement).disabled).toBe(true);
    expect(find('clip-mark-blocked')!.textContent).toBe('Press Mark content started first.');
  });

  it('sends nothing while it is disabled', async () => {
    const sendMark = await render({ ready: false, notReadyReason: 'Not yet.' });
    await press();

    expect(sendMark).not.toHaveBeenCalled();
  });

  it('CONTROL: it is enabled and does send when ready', async () => {
    const sendMark = await render({ ready: true });
    expect((find('clip-mark') as HTMLButtonElement).disabled).toBe(false);
    await press();
    expect(sendMark).toHaveBeenCalled();
  });
});
