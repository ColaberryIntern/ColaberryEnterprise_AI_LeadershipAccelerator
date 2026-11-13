import {
  postShowCheck, handoffPackage, handoffNotice,
  type HandoffAiring, type HandoffClipSummary,
} from '../broadcastHandoffPolicy';

/**
 * D12 — the videographer handoff.
 *
 * THE ASSERTION THAT CARRIES THIS FILE is that `missing` and `not_built` never collapse into
 * each other. They look identical on a checklist and they lead to opposite actions:
 *
 *   - `missing` means go and do it;
 *   - `not_built` means stop waiting, nothing is going to produce this, it needs a ticket.
 *
 * DOC 07 says most of what a handoff owes a videographer is in the second category - no
 * transcript, no chapter markers, no retention field, no title or thumbnail drafts - and its own
 * summary is "two of fifteen outputs". A checklist of unticked boxes would invite somebody to
 * wait for a transcript that no code anywhere is going to write, and to read the delay as a
 * colleague being slow.
 */

const airing = (over: Partial<HandoffAiring> = {}): HandoffAiring => ({
  editorial_state: 'replay_ready',
  provider_session_id: 'ed843de347601f51d2ae57374a645b8a',
  provider_instance_uuid: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  content_started_at: '2026-10-24T14:00:00.000Z',
  ended_at: '2026-10-24T15:58:00.000Z',
  end_reason: 'producer',
  ...over,
});

const clips = (over: Partial<HandoffClipSummary> = {}): HandoffClipSummary => ({
  total: 41, live: 6, decided: 9, kept: 33, ...over,
});

const byKey = (items: ReturnType<typeof postShowCheck>, key: string) =>
  items.find((i) => i.key === key)!;

describe('the post-show check, while everyone is still in the room', () => {
  it('is four lines', () => {
    expect(postShowCheck(airing())).toHaveLength(4);
  });

  it('passes a clean airing', () => {
    expect(postShowCheck(airing()).every((i) => i.state === 'ready')).toBe(true);
  });

  /**
   * THE ONE THAT CANNOT BE FIXED LATER, which is why it is first and why its detail says so.
   * The health loop binds the recording WHILE the show runs. An airing that ends unbound cannot
   * be repaired from anything in this system.
   */
  it('leads with the recording, and says the window has closed', () => {
    const items = postShowCheck(airing({ provider_instance_uuid: null }));

    expect(items[0].key).toBe('recording_bound');
    expect(items[0].state).toBe('missing');
    expect(items[0].detail).toMatch(/cannot be recovered/i);
  });

  it('flags an airing that never had a provider input', () => {
    expect(byKey(postShowCheck(airing({ provider_session_id: null })), 'input_bound').state)
      .toBe('missing');
  });

  it('flags an airing with no end time, because the last clip has no out point', () => {
    const items = postShowCheck(airing({ ended_at: null }));

    expect(byKey(items, 'ended').state).toBe('missing');
    expect(byKey(items, 'ended').detail).toMatch(/no out point/i);
  });

  it('does not blame a running class for having no end REASON', () => {
    // It has not ended. Saying "no reason recorded" would read as data loss rather than as a
    // class that is still going.
    const items = postShowCheck(airing({ ended_at: null, end_reason: null }));

    expect(byKey(items, 'end_reason').detail).toMatch(/has not ended yet/i);
  });

  it('warns about the recording tail when the safety net ended it', () => {
    // A feed that stopped may have stopped before the class did, so the recording can be short.
    const items = postShowCheck(airing({ end_reason: 'auto_stream_gone' }));

    expect(byKey(items, 'end_reason').state).toBe('ready');
    expect(byKey(items, 'end_reason').detail).toMatch(/stop short of the class/i);
  });

  it('says plainly when no end reason was recorded on an ended airing', () => {
    const items = postShowCheck(airing({ end_reason: null }));

    expect(byKey(items, 'end_reason').state).toBe('missing');
    expect(byKey(items, 'end_reason').detail).not.toMatch(/has not ended yet/i);
  });
});

describe('the package, and the difference between missing and not built', () => {
  it('is six items', () => {
    expect(handoffPackage(airing(), clips())).toHaveLength(6);
  });

  /**
   * THE LOAD-BEARING ONE. These three are not a to-do list, and a checklist that showed them
   * as unticked boxes would have a videographer waiting on work nobody is doing.
   */
  it('marks the three DOC 07 says nothing produces as not_built, not missing', () => {
    const items = handoffPackage(airing(), clips());

    for (const key of ['transcript', 'retention', 'drafts']) {
      const item = byKey(items, key);
      expect(item.state).toBe('not_built');
      expect(item.state).not.toBe('missing');
    }
  });

  it('names a ticket for the ones that need building rather than doing', () => {
    // So the next question is "whose ticket", not "when will it arrive".
    const items = handoffPackage(airing(), clips());

    expect(byKey(items, 'transcript').detail).toMatch(/L8\.2/);
    expect(byKey(items, 'retention').detail).toMatch(/L8\.1/);
  });

  it('counts the clip list as READY, which is the thing that changed', () => {
    // DOC 07 called the ranked shortlist "the open design decision". A producer's presses and a
    // per-segment keep-or-cut closed it, and this is where that shows up.
    const item = byKey(handoffPackage(airing(), clips()), 'clip_list');

    expect(item.state).toBe('ready');
    expect(item.detail).toContain('41 moments');
    expect(item.detail).toContain('6 marked live');
  });

  it('says so when nobody has judged the list, without calling the list broken', () => {
    const items = handoffPackage(airing(), clips({ decided: 0 }));

    expect(byKey(items, 'decisions').state).toBe('missing');
    expect(byKey(items, 'decisions').detail).toMatch(/still on its default/i);
  });

  it('reports an airing with no moments at all as missing, not as not_built', () => {
    // The machinery exists and produced nothing, which is a real thing to go and look at.
    expect(byKey(handoffPackage(airing(), clips({ total: 0 })), 'clip_list').state).toBe('missing');
  });
});

describe('the notice counts the two kinds separately', () => {
  it('says both numbers, because one is a to-do list and the other is a scope gap', () => {
    const n = handoffNotice(handoffPackage(airing(), clips()));

    expect(n.warn).toBe(true);
    expect(n.notBuilt).toBe(3);
    expect(n.missing).toBe(0);
    expect(n.text).toMatch(/not built at all/i);
    expect(n.text).toMatch(/waiting will not produce/i);
  });

  it('distinguishes a package with real to-dos from one with only scope gaps', () => {
    const withTodo = handoffNotice(handoffPackage(airing({ provider_instance_uuid: null }), clips()));

    expect(withTodo.missing).toBeGreaterThan(0);
    expect(withTodo.text).toMatch(/can still be fixed/i);
  });

  it('does not warn when there is nothing outstanding', () => {
    // Reachable only for the post-show check, where every item is something this system does.
    const n = handoffNotice(postShowCheck(airing()));

    expect(n.warn).toBe(false);
    expect(n.text).toMatch(/everything this system can produce/i);
  });

  it('CONTROL: a single outstanding item reads in the singular', () => {
    const n = handoffNotice(postShowCheck(airing({ provider_instance_uuid: null })));

    expect(n.missing).toBe(1);
    expect(n.text).toMatch(/1 item is missing/);
  });
});
