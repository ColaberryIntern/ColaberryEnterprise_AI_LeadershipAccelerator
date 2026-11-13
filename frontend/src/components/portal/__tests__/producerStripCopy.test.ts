import {
  CONFIRM_Q, LABELS, needsConfirm, noActionsNote, stateLabel,
  roomChip, stuckChip, audienceChip, endReasonCopy,
} from '../producerStripCopy';
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

/**
 * THE COUNTS, AND THE ONE RULE THEY ALL OBEY (D8).
 *
 * A number nobody can stand behind is not shown as a number. The failure this guards is a
 * fabricated `0`: it reads as an empty room, and a producer who believes the room is empty may
 * end a class people are sitting in.
 *
 * The distinction asserted here is between UNMEASURABLE and ZERO, which is the part that is
 * easy to get wrong in the generous direction. A genuine zero is a real reading and must render
 * as a digit; "nobody is measuring" must never render as a digit at all.
 */
describe('the room and stuck counts', () => {
  it('shows a measured count as a number', () => {
    expect(roomChip({ present: 23 }, false, false)).toEqual({ state: 'ok', text: '23 in the room' });
  });

  it('shows a genuine ZERO as a number, because it is a real reading', () => {
    // The opposite error to the one below, and just as wrong: hiding a true zero would leave a
    // producer unable to tell "nobody has scanned yet" from "the count is broken".
    expect(roomChip({ present: 0 }, false, false)).toEqual({ state: 'ok', text: '0 in the room' });
  });

  it('NEVER shows a number when nothing is measuring', () => {
    const chip = roomChip(null, true, false);
    expect(chip).toEqual({ state: 'unknown', text: 'room not measured' });
    expect(chip!.text).not.toMatch(/\d/);
  });

  it('keeps the last good number and says it is not updating', () => {
    // A producer mid-show needs the stale figure more than an empty panel, as long as the
    // screen admits it is stale.
    expect(roomChip({ present: 23 }, false, true))
      .toEqual({ state: 'stale', text: '23 in the room · not updating' });
  });

  it('says "no answer" when a request failed and there was never a good one', () => {
    expect(roomChip(null, false, true)).toEqual({ state: 'failed', text: 'no answer' });
  });

  it('renders nothing at all before the first answer arrives', () => {
    // Not an error state. An empty chip in the first second would flicker for every producer.
    expect(roomChip(null, false, false)).toBeNull();
  });

  it('raises the stuck count only when somebody is actually stuck', () => {
    expect(stuckChip({ stuck: 3 }, false, false)).toEqual({ state: 'ok', text: '3 stuck', raised: true });
    expect(stuckChip({ stuck: 0 }, false, false)).toEqual({ state: 'ok', text: '0 stuck', raised: false });
  });

  it('does NOT raise an unmeasurable stuck count, which would invent an alarm', () => {
    // "stuck not measured" is a gap in instrumentation, not a room full of stuck people.
    // Coloring it would send a producer looking for a problem that no measurement reported.
    const chip = stuckChip(null, true, false);
    expect(chip).toEqual({ state: 'unknown', text: 'stuck not measured', raised: false });
  });

  it('shows no audience count at all when nothing is on air', () => {
    // A viewer count on a scheduled occurrence is a count of nothing, and one left up after
    // the class is a stale claim about a broadcast that is over.
    expect(audienceChip(false, { outcome: 'ok', watchingNow: 9 }, false)).toBeNull();
  });

  it('CONTROL: the audience chip does render while on air', () => {
    expect(audienceChip(true, { outcome: 'ok', watchingNow: 9 }, false))
      .toEqual({ state: 'ok', text: '9 watching' });
  });
});

/**
 * WHO ENDED IT (D8). The value was on the wire from the first day and nothing rendered it.
 *
 * The two reasons call for opposite next actions, which is why showing neither was a real gap:
 * a producer pressing End is finished, and the watchdog firing means the feed broke and the
 * recording may stop short of the class.
 */
describe('the end reason', () => {
  it('says a human did it', () => {
    expect(endReasonCopy('ended', 'producer')).toBe('Ended by a producer.');
  });

  it('says the safety net did it, and what that means for the recording', () => {
    const copy = endReasonCopy('ended', 'auto_stream_gone')!;
    expect(copy).toMatch(/automatically/i);
    // The consequence is the useful half. Naming the cause without it leaves a producer
    // publishing a replay that ends where the feed died.
    expect(copy).toMatch(/recording/i);
  });

  it('admits when the reason was not recorded rather than guessing a producer', () => {
    // Reachable, not hypothetical: every occurrence that ended before the column existed
    // carries null. Guessing `producer` would assert a colleague did something they did not.
    const copy = endReasonCopy('ended', null)!;
    expect(copy).toMatch(/no end reason was recorded/i);
    expect(copy).not.toMatch(/producer/i);
  });

  it('says nothing at all while the class has not ended', () => {
    for (const s of ['scheduled', 'backstage', 'live', 'reconnecting']) {
      expect(endReasonCopy(s, 'producer')).toBeNull();
    }
  });

  it('says nothing for a called-off airing, which never ended because it never aired', () => {
    expect(endReasonCopy('cancelled', null)).toBeNull();
  });

  it('still shows after processing and once the replay is up', () => {
    // The question "who ended this" outlives the ending; it is asked afterwards, not during.
    expect(endReasonCopy('processing', 'producer')).toBe('Ended by a producer.');
    expect(endReasonCopy('replay_ready', 'producer')).toBe('Ended by a producer.');
  });

  it('prints an unrecognized reason rather than hiding it', () => {
    expect(endReasonCopy('ended', 'some_new_reason')).toBe('Ended: some new reason.');
  });
});
