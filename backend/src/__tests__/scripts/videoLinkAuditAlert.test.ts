/**
 * Guards the alerting half of the curriculum video link watch.
 *
 * The property that matters is "alert on change, not on state". An alert that
 * re-fires every day about a dead link someone already triaged trains the
 * recipient to filter the sender, at which point the next real alert is invisible
 * too. These pin that, and pin that a resolved link closes the loop rather than
 * just going quiet.
 */

const { decideAlert, buildEmail } = require('../../../../scripts/videoLinkAuditAlert');

describe('decideAlert', () => {
  it('stays silent when nothing is dead', () => {
    expect(decideAlert([], [])).toEqual({ alert: false, appeared: [], cleared: [] });
  });

  it('alerts the first time a link goes dead', () => {
    const d = decideAlert([], ['card-a']);
    expect(d.alert).toBe(true);
    expect(d.appeared).toEqual(['card-a']);
    expect(d.cleared).toEqual([]);
  });

  it('does NOT re-alert while the same link stays dead', () => {
    expect(decideAlert(['card-a'], ['card-a'])).toEqual({ alert: false, appeared: [], cleared: [] });
  });

  it('alerts again when a second, different link goes dead', () => {
    const d = decideAlert(['card-a'], ['card-a', 'card-b']);
    expect(d.alert).toBe(true);
    expect(d.appeared).toEqual(['card-b']);
    expect(d.cleared).toEqual([]);
  });

  it('closes the loop when a dead link is fixed', () => {
    const d = decideAlert(['card-a'], []);
    expect(d.alert).toBe(true);
    expect(d.appeared).toEqual([]);
    expect(d.cleared).toEqual(['card-a']);
  });

  it('reports a simultaneous fix and new breakage as both', () => {
    const d = decideAlert(['card-a'], ['card-b']);
    expect(d.appeared).toEqual(['card-b']);
    expect(d.cleared).toEqual(['card-a']);
  });

  it('is order independent, so an ordering change is not mistaken for a change', () => {
    expect(decideAlert(['card-b', 'card-a'], ['card-a', 'card-b']).alert).toBe(false);
  });

  it('treats missing state as nothing-known-dead rather than throwing', () => {
    expect(decideAlert(undefined, ['card-a']).appeared).toEqual(['card-a']);
    expect(decideAlert(null, null).alert).toBe(false);
  });
});

describe('buildEmail', () => {
  const rows = [
    { id: 'card-a', title: 'Tool use with Claude', week: 3, bucket: 'learn', type: 'video', subtitle: 'Anthropic', video_id: 'abc123' },
  ];

  it('names the card, the week and why it blocks a student', () => {
    const { subject, html, text } = buildEmail(['card-a'], [], rows, 77);
    expect(subject).toBe('[Curriculum] 1 dead video link found');
    expect(html).toContain('Tool use with Claude');
    expect(html).toContain('Week 3');
    expect(html).toContain('abc123');
    expect(html).toMatch(/cannot be completed/);
    expect(text).toContain('card-a');
    expect(text).toContain('Checked 77');
  });

  it('warns that a seeded card must be fixed in the seed, not the row', () => {
    const { html } = buildEmail(['card-a'], [], rows, 77);
    expect(html).toMatch(/seed file/);
  });

  it('handles a card with no week without printing undefined', () => {
    const { html, text } = buildEmail(['card-a'], [], [{ ...rows[0], week: null }], 77);
    expect(html).toContain('no week');
    expect(html).not.toContain('undefined');
    expect(text).not.toContain('undefined');
  });

  it('sends a resolved-only notice when nothing new broke', () => {
    const { subject, html } = buildEmail([], ['card-a'], [], 77);
    expect(subject).toBe('[Curriculum] Dead video links resolved');
    expect(html).toMatch(/No action needed/);
  });

  it('pluralises rather than saying "1 videos"', () => {
    const two = [rows[0], { ...rows[0], id: 'card-b', title: 'Second' }];
    expect(buildEmail(['card-a', 'card-b'], [], two, 77).subject).toBe('[Curriculum] 2 dead video links found');
    expect(buildEmail(['card-a'], [], rows, 77).html).toMatch(/A curriculum video has/);
  });
});
