import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import ProducerStrip from '../ProducerStrip';
import type {
  CommandAvailability, ProducerOccurrence, ProducerStateResult,
} from '../../../services/broadcastProducer';

/**
 * P4-02 — the producer's control.
 *
 * Two of these tests are the ones that matter, and both are about what is NOT rendered.
 *
 * It must render nothing for an ordinary viewer, because this page is public and students
 * load it. The strip asserting producer capability from anything other than the server's
 * answer would be a privilege decision made on the client.
 *
 * It must not offer a command the server did not say was available. The legality rules live in
 * the state machine; a component that decided for itself when Go Live is allowed would be the
 * second copy of "going live takes two keys" that this subsystem keeps being warned about.
 *
 * The third thing worth testing by machine is the blocked REASON being shown. A producer
 * waiting for the platform to see the feed previously had nothing to look at — backstage with
 * health never reaching ready looks identical to a stream that was never started.
 */

const occurrence = (over: Partial<ProducerOccurrence> = {}): ProducerOccurrence => ({
  id: 'occ-1',
  title: 'Week 8 — Build Day',
  editorial_state: 'scheduled',
  provider_health: 'unknown',
  version: 4,
  content_started_at: null,
  ended_at: null,
  end_reason: null,
  scheduled_start_at: '2026-07-23T23:30:00.000Z',
  ...over,
});

const cmds = (...list: Array<Partial<CommandAvailability> & { command: CommandAvailability['command'] }>): CommandAvailability[] =>
  list.map((c) => ({ available: false, ...c }));

const ok = (over: Partial<ProducerStateResult> = {}): ProducerStateResult => ({
  outcome: 'ok',
  found: true,
  occurrence: occurrence(),
  commands: cmds({ command: 'enter_backstage', available: true }),
  ...over,
});

let container: HTMLDivElement;
let root: Root;
let loadState: jest.Mock;
let sendCommand: jest.Mock;

async function render(
  state: ProducerStateResult = ok(),
  result: { outcome: string; currentVersion?: number } = { outcome: 'sent' },
) {
  loadState = jest.fn().mockResolvedValue(state);
  sendCommand = jest.fn().mockResolvedValue(result);

  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(<ProducerStrip sessionId="s1" loadState={loadState} sendCommand={sendCommand} />);
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
  jest.useRealTimers();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const tap = async (id: string) => { await act(async () => { find(id)!.click(); }); };
const text = () => container.textContent || '';

describe('who sees it', () => {
  it('renders NOTHING when the server says the viewer is not a producer', async () => {
    // The only thing standing between a student and a Go Live button.
    await render({ outcome: 'forbidden' });
    expect(find('producer-strip')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders nothing when live was never enabled for this session', async () => {
    await render({ outcome: 'ok', found: false, occurrence: null, commands: [] });
    expect(find('producer-strip')).toBeNull();
  });

  it('renders nothing when the feature is dark, which the service reports as forbidden', async () => {
    // The flag gate answers 404 before auth; from a producer's point of view that is the same
    // instruction as "not for you".
    await render({ outcome: 'forbidden' });
    expect(find('producer-strip')).toBeNull();
  });

  it('DOES NOT VANISH when a later poll says forbidden, having once said otherwise', async () => {
    // The control re-decides whether to exist on every poll tick. A token that expires
    // mid-class, or the flag being switched off, answers forbidden for reasons that have
    // nothing to do with who is watching — and the strip would disappear between one tick
    // and the next, mid-airing, with End being the thing most needed.
    await render();
    expect(find('producer-strip')).not.toBeNull();

    loadState.mockResolvedValue({ outcome: 'forbidden' } as ProducerStateResult);
    await tap('producer-cmd-enter_backstage');

    expect(find('producer-strip')).not.toBeNull();
    expect(find('producer-revoked')!.textContent).toContain('no longer available');
  });

  it('offers no commands once authorization is gone, because every one would fail', async () => {
    await render();
    loadState.mockResolvedValue({ outcome: 'forbidden' } as ProducerStateResult);
    await tap('producer-cmd-enter_backstage');

    expect(find('producer-cmd-enter_backstage')).toBeNull();
    expect(find('producer-state')).toBeNull();
  });

  it('says so too if the broadcast stops being attached to the session', async () => {
    await render();
    loadState.mockResolvedValue({ outcome: 'ok', found: false, occurrence: null, commands: [] });
    await tap('producer-cmd-enter_backstage');

    expect(find('producer-revoked')).not.toBeNull();
  });

  it('CONTROL: the silent hide stays silent for someone who was never a producer', async () => {
    // The security property this must not trade away. A viewer never gets a successful read,
    // so `everAuthorized` never becomes true for them and they never reach the explanation
    // above — no strip, no message, no trace that a control exists.
    await render({ outcome: 'forbidden' });

    expect(find('producer-strip')).toBeNull();
    expect(find('producer-revoked')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders for a producer, with the state, the feed health and the version', async () => {
    await render();
    expect(find('producer-strip')).not.toBeNull();
    expect(find('producer-state')!.textContent).toContain('SCHEDULED');
    expect(find('producer-health')!.textContent).toContain('unknown');
    expect(text()).toContain('v4');
  });
});

describe('what it offers', () => {
  it('offers exactly the commands the server called available', async () => {
    await render(ok({
      commands: cmds(
        { command: 'enter_backstage', available: true },
        { command: 'go_live', available: false, reason: 'provider_health is unknown, expected ready', error_class: 'ProviderNotReady' },
      ),
    }));
    expect(find('producer-cmd-enter_backstage')).not.toBeNull();
    // Not disabled — absent. A button that cannot work is not a button.
    expect(find('producer-cmd-go_live')).toBeNull();
  });

  it('SHOWS WHY go live is blocked, which is the whole pre-air wait', async () => {
    await render(ok({
      occurrence: occurrence({ editorial_state: 'backstage' }),
      commands: cmds({
        command: 'go_live',
        available: false,
        reason: 'provider_health is unknown, expected ready',
        error_class: 'ProviderNotReady',
      }),
    }));
    expect(find('producer-blocked-go_live')!.textContent).toContain('provider_health is unknown');
  });

  it('stays quiet about a command that is merely already done', async () => {
    // `no_change` carries no error_class, which is how "already backstage" is told apart from
    // "refused". Reporting it would read as a fault.
    await render(ok({
      occurrence: occurrence({ editorial_state: 'backstage' }),
      commands: cmds({ command: 'enter_backstage', available: false, reason: 'no_change' }),
    }));
    expect(find('producer-blocked-enter_backstage')).toBeNull();
    expect(find('producer-no-actions')).not.toBeNull();
  });

  it('marks an on-air occurrence as ON AIR rather than its wire state', async () => {
    await render(ok({
      occurrence: occurrence({ editorial_state: 'live', provider_health: 'ready', version: 7 }),
      commands: cmds({ command: 'end', available: true }),
    }));
    expect(find('producer-state')!.textContent).toContain('ON AIR');
  });
});

describe('sending a command', () => {
  it('sends the command with the version the server last reported', async () => {
    await render();
    await tap('producer-cmd-enter_backstage');
    expect(sendCommand).toHaveBeenCalledWith('occ-1', 'enter_backstage', 4);
  });

  it('re-reads after a command, so the next version is never guessed', async () => {
    await render();
    const before = loadState.mock.calls.length;
    await tap('producer-cmd-enter_backstage');
    expect(loadState.mock.calls.length).toBeGreaterThan(before);
  });

  it('ASKS FIRST before ending, because ending is irreversible', async () => {
    await render(ok({
      occurrence: occurrence({ editorial_state: 'live', provider_health: 'ready' }),
      commands: cmds({ command: 'end', available: true }),
    }));

    await tap('producer-cmd-end');
    // The first press must not have ended anything.
    expect(sendCommand).not.toHaveBeenCalled();
    expect(find('producer-confirm-end')!.textContent).toContain('cannot be undone');

    await tap('producer-confirm-yes-end');
    expect(sendCommand).toHaveBeenCalledWith('occ-1', 'end', 4);
  });

  it('asks first before cancelling too', async () => {
    await render(ok({ commands: cmds({ command: 'cancel', available: true }) }));
    await tap('producer-cmd-cancel');
    expect(sendCommand).not.toHaveBeenCalled();
    expect(find('producer-confirm-cancel')).not.toBeNull();
  });

  it('reports a conflict with the version that is actually current, and does not retry', async () => {
    await render(ok(), { outcome: 'conflict', currentVersion: 9 });
    await tap('producer-cmd-enter_backstage');
    expect(find('producer-notice')!.textContent).toContain('version 9');
    // Exactly one attempt. A blind retry on a version the server refused is a loop.
    expect(sendCommand).toHaveBeenCalledTimes(1);
  });

  it('says a conflict happened even when the server could not name a version', async () => {
    await render(ok(), { outcome: 'conflict' });
    await tap('producer-cmd-enter_backstage');
    expect(find('producer-notice')!.textContent).toContain('moved under you');
  });

  it('says nothing changed when the send failed', async () => {
    await render(ok(), { outcome: 'failed' });
    await tap('producer-cmd-enter_backstage');
    expect(find('producer-notice')!.textContent).toContain('Nothing changed');
  });

  it('KEEPS the outcome on screen through the re-read that follows it', async () => {
    // The bug this pins: every command is followed immediately by a successful re-read, and
    // when both shared one notice the re-read wiped the message the command had just set.
    // "This airing moved under you" appeared and vanished within the same tick, which is
    // worse than never showing it — the producer sees a flicker and learns nothing.
    await render(ok(), { outcome: 'conflict', currentVersion: 9 });
    await tap('producer-cmd-enter_backstage');

    expect(loadState.mock.calls.length).toBeGreaterThan(1); // the re-read did happen
    expect(find('producer-notice')!.textContent).toContain('version 9');
  });

  it('drops the previous outcome when a new command is issued', async () => {
    // A new command means a new outcome; leaving the old one up would describe something that
    // is no longer what happened.
    await render(ok(), { outcome: 'failed' });
    await tap('producer-cmd-enter_backstage');
    expect(find('producer-notice')).not.toBeNull();

    sendCommand.mockResolvedValue({ outcome: 'sent' });
    await tap('producer-cmd-enter_backstage');
    expect(find('producer-notice')).toBeNull();
  });
});

describe('when the read fails', () => {
  it('keeps the last good picture rather than blanking a control mid-sequence', async () => {
    await render();
    expect(find('producer-strip')).not.toBeNull();

    // The re-read after the command fails. A producer three commands into a showtime
    // sequence should not watch the control vanish.
    loadState.mockResolvedValue({ outcome: 'failed' } as ProducerStateResult);
    await tap('producer-cmd-enter_backstage');

    expect(find('producer-strip')).not.toBeNull();
    expect(find('producer-read-notice')!.textContent).toContain('still trying');
  });

  it('clears the read notice once a read succeeds again', async () => {
    await render();
    loadState.mockResolvedValue({ outcome: 'failed' } as ProducerStateResult);
    await tap('producer-cmd-enter_backstage');
    expect(find('producer-read-notice')).not.toBeNull();

    loadState.mockResolvedValue(ok());
    await tap('producer-cmd-enter_backstage');
    expect(find('producer-read-notice')).toBeNull();
  });

  it('renders nothing when the very first read fails, having nothing to show', async () => {
    await render({ outcome: 'failed' });
    expect(find('producer-strip')).toBeNull();
  });
});
