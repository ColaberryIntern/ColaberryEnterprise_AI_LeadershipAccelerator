import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import SessionClipList from '../SessionClipList';

/**
 * The clip list's first reader (§8 finding 2, R7's first brick).
 *
 * The test that matters most is the one asserting NOTHING renders. Most classes are taught
 * without being broadcast, and this panel lives on the Class Kit — the single screen an
 * instructor opens with a room waiting. An empty "Clips from this airing" heading on every
 * ordinary class would be noise on the worst possible surface.
 *
 * After that: an empty list must say WHICH empty it is. The route sends `content_started_at`
 * for exactly that reason, and a producer who never pressed Mark content started is a fixable
 * mistake, while a class that aired with nothing worth marking is not a mistake at all. Showing
 * the same blank for both is how the first one goes unnoticed for a term.
 */

const clip = (over: Partial<Record<string, unknown>> = {}) => ({
  clip: 1,
  slide_index: 0,
  in_seconds: 0,
  out_seconds: 95,
  duration_seconds: 95,
  in_timecode: '00:00',
  out_timecode: '01:35',
  duration_timecode: '01:35',
  candidate: true,
  label: 'The moment the demo lands',
  segment_label: 'Build Bay',
  slide_title: 'Live build',
  ...over,
});

const aired = (over: Partial<Record<string, unknown>> = {}) => ({
  aired: true,
  occurrence_id: 'occ-1',
  editorial_state: 'ended',
  content_started_at: '2026-11-01T14:00:00.000Z',
  ended_at: null,
  clips: [clip()],
  ...over,
});

let container: HTMLDivElement;
let root: Root;
let load: jest.Mock;
let download: jest.Mock;

async function render(result: unknown = aired(), rejectLoad = false) {
  load = rejectLoad
    ? jest.fn().mockRejectedValue(new Error('nope'))
    : jest.fn().mockResolvedValue(result);
  download = jest.fn().mockResolvedValue({ blob: new Blob(['a']), filename: 'clips.csv' });

  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => {
    root = createRoot(container);
    root.render(
      <SessionClipList sessionId="11111111-2222" load={load} download={download} />,
    );
  });
}

afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  jest.clearAllMocks();
});

const find = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const text = () => container.textContent || '';

describe('when there is nothing to show', () => {
  it('renders NOTHING for a class that was never broadcast', async () => {
    await render({ aired: false, occurrence_id: null, clips: [] });
    expect(container.textContent).toBe('');
  });

  it('says so quietly when the read fails, rather than vanishing', async () => {
    // A silently absent panel is indistinguishable from a class that never aired, so a broken
    // endpoint would look exactly like correct behavior.
    await render(undefined, true);
    expect(text()).toContain('Could not load the clip list');
  });
});

describe('an airing with no clips', () => {
  it('NAMES THE MISSING ANCHOR when content was never marked as started', async () => {
    await render(aired({ clips: [], content_started_at: null }));

    const note = find('clip-empty')!.textContent || '';
    expect(note).toContain('Mark content started');
    // And specifically NOT the other sentence: the two causes must not be interchangeable.
    expect(note).not.toContain('no moments were marked');
  });

  it('says plainly that an anchored airing had nothing marked', async () => {
    await render(aired({ clips: [] }));

    const note = find('clip-empty')!.textContent || '';
    expect(note).toContain('no moments were marked');
    expect(note).not.toContain('Mark content started');
  });
});

describe('the clips', () => {
  it('lists the authored clip notes with their timecodes', async () => {
    await render();

    const rows = find('clip-candidates')!.querySelectorAll('tr');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('00:00');
    expect(rows[0].textContent).toContain('The moment the demo lands');
  });

  it('KEEPS PLAIN ADVANCES OUT OF THE TABLE but counts them', async () => {
    // Every advance writes a marker, so a 38-minute class produces dozens. Listing all of them
    // leaves an editor scrubbing anyway, which is the cost this feature exists to remove.
    await render(aired({
      clips: [
        clip(),
        clip({ clip: 2, candidate: false, label: 'Build Bay', in_timecode: '02:30' }),
        clip({ clip: 3, candidate: false, label: 'Build Bay', in_timecode: '04:10' }),
      ],
    }));

    expect(find('clip-candidates')!.querySelectorAll('tr')).toHaveLength(1);
    const summary = find('clip-summary')!.textContent || '';
    expect(summary).toContain('1 clip note');
    expect(summary).toContain('2 more markers with no note');
  });

  it('offers no table at all when nothing was authored, and says why', async () => {
    await render(aired({
      clips: [clip({ candidate: false, label: 'Build Bay' })],
    }));

    expect(find('clip-candidates')).toBeNull();
    expect(find('clip-summary')!.textContent).toContain('none with a clip note');
  });

  it('SHOWS NO LENGTH rather than a zero for a clip with no recorded end', async () => {
    // The last clip of an airing whose occurrence has no `ended_at` — which real production
    // rows do not — has no length. `00:00` would read as a clip with nothing in it.
    await render(aired({
      clips: [clip({
        in_timecode: '12:30',
        out_seconds: null,
        duration_seconds: null,
        out_timecode: '',
        duration_timecode: '',
      })],
    }));

    const row = find('clip-candidates')!.querySelector('tr')!;
    expect(row.textContent).toContain('12:30');
    expect(row.textContent).toContain('—');
    expect(row.textContent).not.toContain('00:00');
  });
});

describe('the download', () => {
  it('fetches the file through the authorized client', async () => {
    // Not an <a href>: the admin JWT is a Bearer header from localStorage, so a plain link
    // reaches the route with no Authorization at all and gets a 401.
    const createObjectURL = jest.fn().mockReturnValue('blob:x');
    const revokeObjectURL = jest.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    await render();
    await act(async () => { find('clip-csv-download')!.click(); });

    expect(download).toHaveBeenCalledWith('11111111-2222');
    expect(createObjectURL).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('reports a failed build instead of appearing to have saved something', async () => {
    await render();
    download.mockRejectedValue(new Error('boom'));

    await act(async () => { find('clip-csv-download')!.click(); });

    expect(text()).toContain('Could not build the clip file');
  });
});
