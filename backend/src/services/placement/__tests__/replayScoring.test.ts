import { parseVtt, type VttCue } from '../../zoom/zoomTranscripts';
import { candidateSpeaker, MAX_QUESTIONS, MIN_ANSWER_WORDS, NO_ANSWERS, NO_SPEAKER, replayObservationRows, scoreTranscript, secondsOf, topicsOf, turnsOf, wordsOf } from '../replayScoring';
import { VTT } from './helpers/fakeReplayZoom';

/** CP9.2: the replay's scoring rules, pure (no I/O). */
const c = (speaker: string | null, start: string, end: string, text: string): VttCue => ({ speaker, start, end, text });
const LONG = 'I led the work end to end and we shipped it in two weeks with tests and a clear handoff to the team.';

describe('the candidate speaker', () => {
  const cues = [c('Pat Kim', '00:00:01.000', '00:00:02.000', 'Hi'), c('Ann Lee', '00:00:03.000', '00:00:04.000', 'Hello')];
  it('the full name, or failing that a unique first name, case and punctuation aside', () => {
    expect(candidateSpeaker(cues, 'ann lee')).toBe('Ann Lee');
    expect(candidateSpeaker([c('Ann (she/her)', '00:00:01.000', '00:00:02.000', 'x')], 'Ann Lee')).toBe('Ann (she/her)');
  });
  it('no match, two matches by first name, or no name: null (nothing is guessed)', () => {
    expect(candidateSpeaker(cues, 'Grace Hopper')).toBeNull();
    expect(candidateSpeaker([...cues, c('Ann Smith', '00:00:05.000', '00:00:06.000', 'x')], 'Ann Park')).toBeNull();
    expect(candidateSpeaker(cues, null)).toBeNull();
    expect(candidateSpeaker(cues, '   ')).toBeNull();
    expect(candidateSpeaker([], 'Ann Lee')).toBeNull();
  });
});

describe('turns, words, topics', () => {
  it('merges consecutive cues by one speaker, with their span in seconds', () => {
    const t = turnsOf(parseVtt(VTT));
    expect(t.map((x) => x.speaker)).toEqual(['Pat Kim', 'Ann Lee', 'Pat Kim', 'Ann Lee', 'Pat Kim', 'Ann Lee']);
    expect([t[1].start, t[1].end]).toEqual([7, 27]);
    expect(secondsOf('01:02:03.500')).toBe(3723.5);
    expect(secondsOf('nonsense')).toBe(0);
  });
  it('spreads each cue\'s words evenly across the cue', () => {
    const w = wordsOf(turnsOf([c('A', '00:00:10.000', '00:00:12.000', 'one two three four')])[0]);
    expect(w.map((x) => [x.start, x.end])).toEqual([[10, 10.5], [10.5, 11], [11, 11.5], [11.5, 12]]);
  });
  it('a question\'s key words: distinct, 4 letters or more, no common words, at most 6; none for no question', () => {
    expect(topicsOf('Tell me about a data pipeline you built and how you measured its impact.')).toEqual(['data', 'pipeline', 'built', 'measured', 'impact']);
    expect(topicsOf('What is it?')).toEqual([]);
    expect(topicsOf(null)).toEqual([]);
    expect(topicsOf('alpha bravo charlie delta echoes foxtrot golfing hotel')).toHaveLength(6);
  });
});

describe('scoreTranscript', () => {
  it('the fixture: two answers, each with its question, and one rounded score', () => {
    const r = scoreTranscript(parseVtt(VTT), 'Ann Lee');
    if (r.status !== 'scored') throw new Error('expected scored');
    expect(r.questions.map((q) => [q.n, q.at, q.seconds])).toEqual([[1, 7, 20], [2, 33, 12]]);
    expect(Number.isInteger(r.score) && r.score >= 0 && r.score <= 100).toBe(true);
  });
  it(`an answer under ${MIN_ANSWER_WORDS} words is not scored; no long answer at all = no_score`, () => {
    expect(scoreTranscript([c('Pat', '00:00:01.000', '00:00:02.000', 'Question?'), c('Ann Lee', '00:00:03.000', '00:00:04.000', 'Yes, I did that.')], 'Ann Lee'))
      .toEqual({ status: 'no_score', reason: NO_ANSWERS });
    expect(scoreTranscript([], 'Ann Lee')).toEqual({ status: 'no_score', reason: NO_SPEAKER });
  });
  it(`at most ${MAX_QUESTIONS} answers; an answer with no question before it has no content score`, () => {
    const cues = Array.from({ length: 40 }, (_, k) => c(k % 2 ? 'Ann Lee' : 'Pat', `00:${String(k).padStart(2, '0')}:00.000`, `00:${String(k).padStart(2, '0')}:08.000`, k % 2 ? LONG : 'Why?'));
    const r = scoreTranscript(cues, 'Ann Lee');
    expect(r.status === 'scored' && r.questions.length).toBe(MAX_QUESTIONS);
    const solo = scoreTranscript([c('Ann Lee', '00:00:01.000', '00:00:09.000', LONG)], 'Ann Lee');
    expect(solo.status === 'scored' && solo.questions[0]).toMatchObject({ question: null, content: null });
  });
  it('a very long answer is clipped for display; the score uses all of it', () => {
    const long = Array.from({ length: 400 }, () => 'word').join(' ');
    const r = scoreTranscript([c('Ann Lee', '00:00:01.000', '00:03:00.000', long)], 'Ann Lee');
    expect(r.status === 'scored' && r.questions[0].answer.length).toBe(1200);
  });
});

describe('observations', () => {
  it('pace -> pace_clarity, fillers -> few_fillers, source real_interview, ref replay:<id>:<n>, at the interview time', () => {
    const r = scoreTranscript(parseVtt(VTT), 'Ann Lee');
    if (r.status !== 'scored') throw new Error('expected scored');
    const at = new Date('2026-11-20T15:00:00Z');
    const rows = replayObservationRows('enr-ann', 'iv-1', r.questions, at);
    expect(rows.map((o) => [o.skill, o.source, o.sourceRef])).toEqual([['pace_clarity', 'real_interview', 'replay:iv-1:1'], ['few_fillers', 'real_interview', 'replay:iv-1:1'],
      ['pace_clarity', 'real_interview', 'replay:iv-1:2'], ['few_fillers', 'real_interview', 'replay:iv-1:2']]);
    expect(rows.every((o) => o.observedAt === at && o.value >= 0 && o.value <= 100)).toBe(true);
    expect(replayObservationRows('enr-ann', 'iv-1', [], at)).toEqual([]);
  });
});
