import * as fs from 'fs';
import * as path from 'path';
import { interviewMethodLines, writtenBriefLines, conversationWithWrittenBrief, WRITTEN_BRIEF_MAX } from '../interviewMethod';
import { buildInterviewPrompt } from '../flotationInterviewService';
import { buildFlotationCallPrompt } from '../../voiceCallPrompt';

/**
 * ONE interview, typed or spoken.
 *
 * WHAT WENT WRONG. On 2026-09-17 Ali pasted a 2,300-character brief - team, hours,
 * workflow, pain, target - and asked to be called. The agent opened with "could you walk
 * me through how your team handles that work today, step by step?". He said "I just gave
 * you this step by step information". It apologised and asked again. He hung up at 37
 * seconds, and a project was built from a one-item understanding.
 *
 * The typed interviewer would not have done that - "A QUESTION YOU COULD HAVE ANSWERED
 * YOURSELF IS A FAILURE" is its central rule. The voice script had its own five-item list
 * and none of those rules, and the old code literally instructed "Ask them to walk you
 * through it". Two interviews wearing one name.
 *
 * These tests hold the two prompts to the same method, and hold the voice prompt to
 * treating a written brief as ANSWERED rather than as an opening topic.
 */

const BRIEF = 'Build an AI Proposal Assistant for Patriot AI Solutions. Our five-person sales team spends 15-20 hours preparing each proposal.';

describe('the method is one thing', () => {
  const typed = buildInterviewPrompt({ name: 'Ali', company: 'Patriot AI Solutions', role: null }, 0);
  const spoken = buildFlotationCallPrompt({ name: 'Ali', company: 'Patriot AI Solutions', message: BRIEF });

  it.each(interviewMethodLines().filter((l) => l.trim()).map((l) => [l.slice(0, 60), l]))(
    'both prompts carry it verbatim: %s',
    (_label, line) => {
      expect(typed).toContain(line);
      expect(spoken).toContain(line);
    },
  );

  it('neither prompt keeps its own private list of what to ask', () => {
    // The voice script's old numbered list is what drifted. A numbered agenda in either
    // prompt is the shape of the bug, not a style preference.
    for (const prompt of [typed, spoken]) {
      expect(prompt).not.toMatch(/^\s*\d\.\s+What the workflow actually is today/m);
    }
  });

  it('both are composed from the shared module rather than copying it', () => {
    const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, '..', '..', ...p), 'utf8');
    const typedSrc = read('delivery', 'flotationInterviewService.ts');
    const voiceSrc = read('voiceCallPrompt.ts');
    for (const src of [typedSrc, voiceSrc]) {
      expect(src).toMatch(/interviewMethod'/);
      expect(src).toContain('...interviewMethodLines(),');
      // The rule itself must not be pasted into either file.
      expect(src).not.toContain('A QUESTION YOU COULD HAVE ANSWERED YOURSELF IS A FAILURE');
    }
  });
});

describe('a written brief is already answered', () => {
  it('never tells the agent to ask them to walk through what they wrote', () => {
    const prompt = buildFlotationCallPrompt({ name: 'Ali', message: BRIEF });
    // The old instruction, verbatim. It is gone; the phrase survives only in the ban.
    expect(prompt).not.toContain('Open by referring to THIS, not to a generic script. Ask them to walk you through it.');
    expect(prompt).not.toMatch(/generic script/);
    expect(prompt).toMatch(/ALREADY ANSWERED/);
    expect(prompt).toMatch(/Do not ask them to walk you through it, repeat it, or "start from the beginning"/);
  });

  it('carries their words and tells the agent to open by naming the specific thing', () => {
    const prompt = buildFlotationCallPrompt({ message: BRIEF });
    expect(prompt).toContain(BRIEF);
    expect(prompt).toMatch(/Open with ONE sentence that shows you read it/);
    expect(prompt).toMatch(/ask the one thing it does not cover/);
  });

  it('lets the agent stop early when the brief already covers everything', () => {
    expect(buildFlotationCallPrompt({ message: BRIEF })).toMatch(/you may have enough/);
  });

  it('falls back to finding out the work when nothing was written', () => {
    const lines = writtenBriefLines('   ');
    expect(lines).toEqual(['They have not described anything yet, so your first job is to find out what the work is.']);
    expect(buildFlotationCallPrompt({})).toMatch(/have not described anything yet/);
  });

  it('bounds a brief so one paste cannot become the whole prompt', () => {
    const huge = 'x'.repeat(WRITTEN_BRIEF_MAX + 5_000);
    expect(writtenBriefLines(huge)[1]).toHaveLength(WRITTEN_BRIEF_MAX + 2); // the quotes
  });
});

describe('conversationWithWrittenBrief - the extractor sees what they wrote too', () => {
  // The call transcript alone is what the extractor used to get. On 2026-09-17 that was
  // 381 characters of "hello / I'm an AI / I just told you that" for a project described
  // in full, in writing, minutes earlier.
  it('puts the brief in front of the transcript, marked as written', () => {
    const out = conversationWithWrittenBrief(BRIEF, 'bot: Hello.\nhuman: Hi.');
    expect(out.startsWith('human (written before the call): ')).toBe(true);
    expect(out).toContain(BRIEF);
    expect(out.endsWith('bot: Hello.\nhuman: Hi.')).toBe(true);
  });

  it('is just the transcript when nothing was written', () => {
    expect(conversationWithWrittenBrief(null, 'bot: Hello.')).toBe('bot: Hello.');
  });

  it('is just the brief when the call produced nothing', () => {
    expect(conversationWithWrittenBrief(BRIEF, '')).toBe(`human (written before the call): ${BRIEF}`);
  });

  it('bounds the brief here too', () => {
    expect(conversationWithWrittenBrief('x'.repeat(WRITTEN_BRIEF_MAX + 100), 'bot: Hi.')).toHaveLength(
      'human (written before the call): '.length + WRITTEN_BRIEF_MAX + 1 + 'bot: Hi.'.length,
    );
  });
});
