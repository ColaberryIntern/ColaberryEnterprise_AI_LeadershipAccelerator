import { CONFIRM_Q, LABELS, needsConfirm, noActionsNote, stateLabel } from '../producerStripCopy';
import type { ProducerCommand } from '../../../services/broadcastProducer';

/**
 * The producer strip's words, tested as code — because two of them carry a consequence.
 *
 * The cancel confirmation is the last moment anyone can decide not to retire a class from
 * Colaberry Live, and the empty-command note is the only place the product admits that is what
 * happened. Both were sentences inside a render before; assertions on a rendered string are the
 * reason copy like that drifts without anyone noticing.
 *
 * `Object.keys(LABELS)` is the command list on purpose. `LABELS` is a
 * `Record<ProducerCommand, string>`, so the compiler will not let it be missing a command — which
 * makes it the one list in this file that cannot fall behind the wire contract.
 */
const ALL = Object.keys(LABELS) as ProducerCommand[];

describe('labels', () => {
  it('has a non-empty label for every command that exists', () => {
    expect(ALL.length).toBeGreaterThan(0);
    for (const c of ALL) expect(LABELS[c].trim().length).toBeGreaterThan(0);
  });
});

describe('which commands ask first', () => {
  it('asks before exactly the two irreversible ones', () => {
    expect(ALL.filter(needsConfirm).sort()).toEqual(['cancel', 'end']);
  });

  it('is derived from the questions, so neither can exist without the other', () => {
    // The drift this prevents: a command listed as needing a confirmation with no question
    // written, which renders an empty prompt and a live danger button.
    for (const c of ALL) expect(needsConfirm(c)).toBe(CONFIRM_Q[c] !== undefined);
  });

  it('does not ask before a reversible command', () => {
    expect(needsConfirm('enter_backstage')).toBe(false);
    expect(needsConfirm('go_live')).toBe(false);
  });
});

describe('the cancel confirmation', () => {
  /**
   * THE WHOLE POINT OF THIS CHANGE.
   *
   * "This cannot be undone" is a statement about the airing. What cancelling actually costs is
   * the CLASS: `cancelled` has no outbound transition and the session cannot be given a second
   * occurrence, so re-scheduling — the obvious next move, and the one a producer will reach for
   * — does nothing and reports nothing. The sentence has to reach past the airing or it is
   * telling the smaller truth.
   */
  it('warns about the class, not just this airing', () => {
    expect(CONFIRM_Q.cancel).toContain('class');
  });

  it('says that re-scheduling will not bring the broadcast back', () => {
    expect(CONFIRM_Q.cancel).toMatch(/re-scheduling/i);
    expect(CONFIRM_Q.cancel).toMatch(/cannot be put back on air/i);
  });

  it('still says plainly that ending cannot be undone', () => {
    // `end` is the one where that sentence was already the whole truth: an ended class goes on
    // to processing and a published replay, so what cannot be undone is the ending itself.
    expect(CONFIRM_Q.end).toMatch(/cannot be undone/i);
  });
});

describe('why there is nothing to do', () => {
  it('EXPLAINS A CANCELLED AIRING instead of shrugging at it', () => {
    const note = noActionsNote('cancelled');
    expect(note).toMatch(/re-scheduling/i);
    expect(note).toMatch(/not put it back on air/i);
    expect(note).not.toMatch(/Nothing to do from here/i);
  });

  it('does not send the producer to a screen that cannot fix it either', () => {
    // The admin page's re-schedule refuses in a server log nobody watches, so promising an
    // admin could sort this out would be worse than the shrug it replaces.
    expect(noActionsNote('cancelled')).toMatch(/flag it/i);
  });

  it('reads a published replay as the good news it is', () => {
    expect(noActionsNote('replay_ready')).toMatch(/replay is published/i);
  });

  it('falls back to the plain sentence for a state that is merely idle', () => {
    expect(noActionsNote('backstage')).toBe('Nothing to do from here.');
    expect(noActionsNote('processing')).toBe('Nothing to do from here.');
  });
});

describe('the state badge', () => {
  it('reads a broadcast as a broadcast', () => {
    expect(stateLabel('live')).toBe('ON AIR');
    expect(stateLabel('reconnecting')).toBe('RECONNECTING');
  });

  it('turns every other wire state into a readable one', () => {
    expect(stateLabel('scheduled')).toBe('SCHEDULED');
    expect(stateLabel('replay_ready')).toBe('REPLAY READY');
    expect(stateLabel('cancelled')).toBe('CANCELLED');
  });
});
