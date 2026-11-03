import {
  encodeMeetingUuid,
  localHhMm,
  localDate,
  selectInstanceNearestLocalTime,
  pickTranscriptFile,
  parseVtt,
  renderTranscript,
  speakerExchange,
  type ZoomPastInstance,
  type ZoomRecordingFileLite,
} from '../zoomTranscripts';

const CHICAGO = 'America/Chicago';

function instance(uuid: string, startUtc: string): ZoomPastInstance {
  return { uuid, start_time: startUtc };
}
function file(fileType: string, extra: Partial<ZoomRecordingFileLite> = {}): ZoomRecordingFileLite {
  return { file_type: fileType, download_url: `https://example.test/${fileType}`, ...extra };
}

describe('encodeMeetingUuid — Zoom double-encoding rule', () => {
  it('encodes once for an ordinary uuid', () => {
    expect(encodeMeetingUuid('abc123==')).toBe('abc123%3D%3D');
  });

  it('encodes TWICE when the uuid starts with a slash', () => {
    // Single-encoding this 404s. That is the whole bug class.
    expect(encodeMeetingUuid('/abc==')).toBe(encodeURIComponent(encodeURIComponent('/abc==')));
  });

  it('encodes TWICE when the uuid contains a double slash', () => {
    expect(encodeMeetingUuid('ab//cd')).toBe(encodeURIComponent(encodeURIComponent('ab//cd')));
  });

  it('a double-encoded slash uuid is NOT the same as a single-encoded one', () => {
    // The negative control: if these were equal the rule above would be pointless.
    expect(encodeMeetingUuid('/abc==')).not.toBe(encodeURIComponent('/abc=='));
  });
});

describe('local time conversion straddles the DST change', () => {
  // US DST ended 2026-11-01. The SAME UTC instant is a different wall clock either side of it,
  // which is why a hardcoded -5 or -6 offset is wrong for half the year.
  it('16:00Z is 11:00 in Chicago during CDT (late October)', () => {
    expect(localHhMm('2026-10-27T16:00:00Z', CHICAGO)).toBe('11:00');
  });

  it('16:00Z is 10:00 in Chicago during CST (3 November)', () => {
    expect(localHhMm('2026-11-03T16:00:00Z', CHICAGO)).toBe('10:00');
  });

  it('gives the local calendar date, which can differ from the UTC date', () => {
    // 02:30Z on the 4th is still the evening of the 3rd in Chicago.
    expect(localDate('2026-11-04T02:30:00Z', CHICAGO)).toBe('2026-11-03');
  });

  it('throws on an unparseable instant rather than silently returning 00:00', () => {
    expect(() => localHhMm('not-a-date', CHICAGO)).toThrow(/unparseable/);
  });
});

describe('selectInstanceNearestLocalTime', () => {
  // Shaped after the real six-instance incident recorded in zoomService: several throwaway starts
  // before the meeting that matters.
  const instances = [
    instance('u-early-1', '2026-11-03T15:27:00Z'), // 09:27 CST — a test start
    instance('u-early-2', '2026-11-03T15:40:00Z'), // 09:40 CST — another
    instance('u-real', '2026-11-03T16:02:00Z'), //    10:02 CST — the meeting
    instance('u-later', '2026-11-03T19:00:00Z'), //   13:00 CST — a different meeting
  ];

  it('picks the instance nearest the requested local time', () => {
    const sel = selectInstanceNearestLocalTime(instances, '2026-11-03', '10:00', CHICAGO);
    expect(sel.chosen?.uuid).toBe('u-real');
    expect(sel.reason).toContain('10:02');
  });

  it('reports every candidate it considered, not just the winner', () => {
    const sel = selectInstanceNearestLocalTime(instances, '2026-11-03', '10:00', CHICAGO);
    expect(sel.considered).toHaveLength(4);
    expect(sel.considered.map((c) => c.uuid)).toContain('u-early-1');
    // Sorted by drift, so the chosen one leads.
    expect(sel.considered[0].uuid).toBe('u-real');
  });

  it('does NOT pick a 13:00 meeting for a 10:00 request — it refuses', () => {
    const only = [instance('u-later', '2026-11-03T19:00:00Z')];
    const sel = selectInstanceNearestLocalTime(only, '2026-11-03', '10:00', CHICAGO);
    expect(sel.chosen).toBeNull();
    expect(sel.reason).toContain('over the 120 min limit');
  });

  it('a wider drift allowance DOES accept it — proving the refusal came from the limit', () => {
    const only = [instance('u-later', '2026-11-03T19:00:00Z')];
    const sel = selectInstanceNearestLocalTime(only, '2026-11-03', '10:00', CHICAGO, 240);
    expect(sel.chosen?.uuid).toBe('u-later');
  });

  it('ignores instances on a different local date', () => {
    const sel = selectInstanceNearestLocalTime(
      [instance('u-yesterday', '2026-11-02T16:00:00Z')], '2026-11-03', '10:00', CHICAGO,
    );
    expect(sel.chosen).toBeNull();
    expect(sel.reason).toContain('no instance on 2026-11-03');
  });

  it('rejects a malformed target time instead of coercing it', () => {
    expect(() => selectInstanceNearestLocalTime(instances, '2026-11-03', '10am', CHICAGO))
      .toThrow(/expected HH:MM/);
  });
});

describe('pickTranscriptFile', () => {
  it('prefers TRANSCRIPT', () => {
    const picked = pickTranscriptFile([file('MP4'), file('CC'), file('TRANSCRIPT')]);
    expect(picked?.kind).toBe('TRANSCRIPT');
  });

  it('falls back to CC and says so', () => {
    const picked = pickTranscriptFile([file('MP4'), file('CC')]);
    expect(picked?.kind).toBe('CC');
  });

  it('returns null when neither exists, rather than handing back the MP4', () => {
    expect(pickTranscriptFile([file('MP4'), file('M4A')])).toBeNull();
  });

  it('is case-insensitive on file_type', () => {
    expect(pickTranscriptFile([file('transcript')])?.kind).toBe('TRANSCRIPT');
  });

  it('handles an undefined file list', () => {
    expect(pickTranscriptFile(undefined)).toBeNull();
  });
});

describe('parseVtt', () => {
  const VTT = [
    'WEBVTT',
    '',
    '1',
    '00:00:05.000 --> 00:00:08.000',
    'Ali Muwwakkil: Good morning everyone',
    '',
    '2',
    '00:00:08.500 --> 00:00:12.000',
    'Ali Muwwakkil: Lets start with the RFP breakdown',
    '',
    '3',
    '00:00:12.500 --> 00:00:16.000',
    'Akiwam: I split the human tasks from the agent tasks',
    '',
  ].join('\n');

  it('parses cues with speaker and text', () => {
    const cues = parseVtt(VTT);
    expect(cues).toHaveLength(3);
    expect(cues[0].speaker).toBe('Ali Muwwakkil');
    expect(cues[0].text).toBe('Good morning everyone');
    expect(cues[2].speaker).toBe('Akiwam');
  });

  it('accepts a comma millisecond separator', () => {
    const cues = parseVtt('00:00:01,000 --> 00:00:02,000\nAli: hello');
    expect(cues).toHaveLength(1);
    expect(cues[0].start).toBe('00:00:01.000');
  });

  it('does NOT treat a mid-sentence colon as a speaker', () => {
    const cues = parseVtt('00:00:01.000 --> 00:00:02.000\nWe agreed on this: the human does review');
    expect(cues[0].speaker).toBeNull();
    expect(cues[0].text).toContain('We agreed on this:');
  });

  it('joins a caption wrapped across lines', () => {
    const cues = parseVtt('00:00:01.000 --> 00:00:04.000\nAkiwam: the first half\nand the second half');
    expect(cues).toHaveLength(1);
    expect(cues[0].text).toBe('the first half and the second half');
  });

  it('rescues a LOWERCASE display name that recurs at least three times', () => {
    const body = Array.from({ length: 3 }, (_, i) => `00:00:0${i}.000 --> 00:00:0${i}.500\nakiwam aps: line ${i}\n`).join('\n');
    const cues = parseVtt(body);
    expect(cues).toHaveLength(3);
    expect(cues.every((c) => c.speaker === 'akiwam aps')).toBe(true);
  });

  it('a repeated SENTENCE fragment under the recurrence floor is still not a speaker', () => {
    // Twice is not three times, and it is not title case — so it stays caption text.
    const body = [
      '00:00:01.000 --> 00:00:02.000',
      'we agreed on this: the human reviews',
      '',
      '00:00:03.000 --> 00:00:04.000',
      'we agreed on this: the agent drafts',
      '',
    ].join('\n');
    const cues = parseVtt(body);
    expect(cues.map((c) => c.speaker)).toEqual([null, null]);
  });

  it('returns an empty array for an empty body rather than throwing', () => {
    expect(parseVtt('')).toEqual([]);
    expect(parseVtt('WEBVTT\n\n')).toEqual([]);
  });

  it('skips a cue with timing but no text', () => {
    expect(parseVtt('00:00:01.000 --> 00:00:02.000\n\n')).toEqual([]);
  });
});

describe('renderTranscript', () => {
  it('merges consecutive cues from the same speaker into one paragraph', () => {
    const cues = parseVtt([
      '00:00:05.000 --> 00:00:08.000',
      'Ali: first',
      '',
      '00:00:08.500 --> 00:00:12.000',
      'Ali: second',
      '',
      '00:00:12.500 --> 00:00:16.000',
      'Akiwam: reply',
      '',
    ].join('\n'));
    const text = renderTranscript(cues);
    expect(text).toContain('[00:00:05.000] Ali: first second');
    expect(text).toContain('[00:00:12.500] Akiwam: reply');
    // Two paragraphs, not three — the merge happened.
    expect(text.split('\n\n')).toHaveLength(2);
  });

  it('labels an unattributed cue UNKNOWN rather than dropping it', () => {
    const cues = parseVtt('00:00:01.000 --> 00:00:02.000\njust some words');
    expect(renderTranscript(cues)).toContain('UNKNOWN: just some words');
  });
});

describe('speakerExchange', () => {
  const cues = parseVtt(
    Array.from({ length: 9 }, (_, i) => {
      const who = i === 4 ? 'Akiwam' : 'Ali';
      return `00:00:0${i}.000 --> 00:00:0${i}.500\n${who}: line ${i}\n`;
    }).join('\n'),
  );

  it('returns the match plus context either side, so a reply reads with its question', () => {
    const slice = speakerExchange(cues, /akiwam/i, 2);
    // indices 2..6 around the single match at 4
    expect(slice).toHaveLength(5);
    expect(slice.some((c) => c.speaker === 'Akiwam')).toBe(true);
    expect(slice[0].text).toBe('line 2');
  });

  it('clamps context at the start and end of the transcript', () => {
    const firstMatch = speakerExchange(cues, /^ali$/i, 3);
    expect(firstMatch.length).toBeGreaterThan(0);
    expect(firstMatch.length).toBeLessThanOrEqual(cues.length);
  });

  it('returns nothing when the speaker never appears', () => {
    expect(speakerExchange(cues, /nobody-here/i, 2)).toEqual([]);
  });
});
