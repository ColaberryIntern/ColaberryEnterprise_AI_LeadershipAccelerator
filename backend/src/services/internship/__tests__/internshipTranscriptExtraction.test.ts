/**
 * Transcript extraction — the component most able to do real harm, because a
 * misattributed answer is a fabricated statement put in a real applicant's mouth
 * and shown to a reviewer as fact.
 *
 * So the tests below care far more about what it REFUSES to extract than about its
 * hit rate. A missing answer means the question gets asked again, which is
 * recoverable. A wrong answer is not.
 */
import { extractAnswersFromTranscript, parseTurns } from '../internshipTranscriptExtraction';
import { findQuestion } from '../internshipQuestionBank';

const t = (lines: string[]) => lines.join('\n');

describe('parseTurns', () => {
  it('splits labelled speaker turns', () => {
    const turns = parseTurns(t([
      'Agent: Why do you want to join the AI Internship?',
      'User: Because I want to build real things.',
    ]));
    expect(turns).toEqual([
      { speaker: 'agent', text: 'Why do you want to join the AI Internship?' },
      { speaker: 'applicant', text: 'Because I want to build real things.' },
    ]);
  });

  it('joins a wrapped turn rather than splitting it into two', () => {
    const turns = parseTurns(t([
      'User: I built a pipeline',
      'that scraped listings and ranked them.',
    ]));
    expect(turns).toHaveLength(1);
    expect(turns[0].text).toBe('I built a pipeline that scraped listings and ranked them.');
  });

  it('tolerates an unlabelled preamble without inventing a turn', () => {
    expect(parseTurns('call started\n')).toEqual([]);
  });

  it('accepts the alternate labels providers use', () => {
    const turns = parseTurns(t(['Assistant: Hello?', 'Caller: Hi.']));
    expect(turns.map((x) => x.speaker)).toEqual(['agent', 'applicant']);
  });
});

describe('every extracted answer is unconfirmed', () => {
  it('never writes a confident answer — always needs_followup', () => {
    // THE rule. Extraction feeds the applicant's review screen; it does not
    // produce answers of record. If this ever regresses, a model's guess reaches a
    // reviewer as though the applicant had typed it.
    const { answers } = extractAnswersFromTranscript({
      transcript: t([
        'Agent: To start, why do you want to join the AI Internship?',
        'User: I want to work on real AI systems instead of tutorials.',
        'Agent: The internship needs at least twenty-five hours a week. Can you commit to that?',
        'User: Yes, absolutely.',
      ]),
    });
    expect(answers.length).toBeGreaterThan(0);
    for (const a of answers) expect(a.state).toBe('needs_followup');
  });
});

describe('yes/no answers', () => {
  const ask = (reply: string) => extractAnswersFromTranscript({
    transcript: t([
      'Agent: The internship needs at least twenty-five hours a week. Can you commit to that?',
      `User: ${reply}`,
    ]),
    askedOnly: ['weekly_hours_commitment'],
  });

  it('reads a clear yes as a real boolean', () => {
    const { answers } = ask('Yes, that works for me.');
    expect(answers[0]).toMatchObject({ question_key: 'weekly_hours_commitment', answer_value: true });
  });

  it('reads a clear no as false', () => {
    const { answers } = ask('No, I could not manage that.');
    expect(answers[0]).toMatchObject({ answer_value: false });
  });

  it('refuses to guess an ambiguous answer', () => {
    // "Yes but actually no" is exactly the case a naive regex gets wrong and a
    // reviewer can never audit. Refusing means the question is asked again.
    const { answers, unmatched } = ask('Yes, well, no, I am not sure.');
    expect(answers).toHaveLength(0);
    expect(unmatched).toContain('weekly_hours_commitment');
  });

  it('refuses a non-answer', () => {
    const { answers } = ask('Hmm.');
    expect(answers).toHaveLength(0);
  });
});

describe('choice answers', () => {
  const ask = (reply: string) => extractAnswersFromTranscript({
    transcript: t([
      'Agent: Are you working at the moment — full time, part time, contract, or not currently employed?',
      `User: ${reply}`,
    ]),
    askedOnly: ['employment_status'],
  });

  it('maps each option', () => {
    expect(ask('I work part time at a shop.').answers[0]).toMatchObject({ answer_value: 'part_time' });
    expect(ask('I do contract work.').answers[0]).toMatchObject({ answer_value: 'contract' });
    expect(ask('I am employed full time right now.').answers[0]).toMatchObject({ answer_value: 'full_time' });
  });

  it('does not read "not employed full time" as full_time', () => {
    // The single most consequential misread available here: it flips the hard
    // eligibility gate against the applicant.
    expect(ask('I am not employed full time.').answers[0]).toMatchObject({ answer_value: 'not_employed' });
    expect(ask('Not working at the moment.').answers[0]).toMatchObject({ answer_value: 'not_employed' });
  });

  it('refuses an option it does not recognise', () => {
    const { answers, unmatched } = ask('It is complicated.');
    expect(answers).toHaveLength(0);
    expect(unmatched).toContain('employment_status');
  });

  it('only ever writes a declared option', () => {
    const q = findQuestion('employment_status')!;
    for (const reply of ['part time', 'contract', 'full time', 'not employed']) {
      const got = ask(reply).answers[0];
      if (got) expect(q.options).toContain(got.answer_value as string);
    }
  });
});

describe('free text', () => {
  it('captures the applicant\'s own words verbatim', () => {
    const said = 'I built a small agent that reconciles our invoices every night.';
    const { answers } = extractAnswersFromTranscript({
      transcript: t([
        'Agent: Tell me about something you have built — technical, analytical, automated, anything AI-related. Walk me through it.',
        `User: ${said}`,
      ]),
      askedOnly: ['built_something'],
    });
    // Their words, not a paraphrase — the applicant has to be able to recognise it.
    expect(answers[0].answer_text).toBe(said);
  });

  it('rejects a grunt as an answer to an open question', () => {
    const { answers } = extractAnswersFromTranscript({
      transcript: t([
        'Agent: Tell me about something you have built — technical, analytical, automated, anything AI-related.',
        'User: uh',
      ]),
      askedOnly: ['built_something'],
    });
    expect(answers).toHaveLength(0);
  });
});

describe('what it will not do', () => {
  it('extracts nothing from an empty or junk transcript', () => {
    expect(extractAnswersFromTranscript({ transcript: '' }).answers).toHaveLength(0);
    expect(extractAnswersFromTranscript({ transcript: 'beep beep' }).answers).toHaveLength(0);
  });

  it('never invents a question key outside the bank', () => {
    const { answers } = extractAnswersFromTranscript({
      transcript: t([
        'Agent: What is your mother\'s maiden name?',
        'User: Smith.',
      ]),
    });
    expect(answers).toHaveLength(0);
  });

  it('honours askedOnly, so a resumed call cannot overwrite a form answer', () => {
    // The applicant answered why_join online. The call asked something else. Even
    // though the transcript mentions both, only the asked question is extracted.
    const { answers } = extractAnswersFromTranscript({
      transcript: t([
        'Agent: To start, why do you want to join the AI Internship?',
        'User: This should not be captured.',
        'Agent: The internship needs at least twenty-five hours a week. Can you commit to that?',
        'User: Yes.',
      ]),
      askedOnly: ['weekly_hours_commitment'],
    });
    expect(answers.map((a) => a.question_key)).toEqual(['weekly_hours_commitment']);
  });

  it('takes the applicant\'s reply, not a later agent turn', () => {
    const { answers } = extractAnswersFromTranscript({
      transcript: t([
        'Agent: The internship needs at least twenty-five hours a week. Can you commit to that?',
        'Agent: Sorry, did you hear me?',
        'User: Yes I can.',
      ]),
      askedOnly: ['weekly_hours_commitment'],
    });
    expect(answers[0]).toMatchObject({ answer_value: true });
  });

  it('reports what it could not match rather than staying silent', () => {
    const { unmatched } = extractAnswersFromTranscript({ transcript: 'Agent: hello\nUser: hi' });
    // Everything unmatched means everything gets asked again — the safe outcome.
    expect(unmatched.length).toBeGreaterThan(15);
  });

  it('is deterministic — the same transcript extracts the same answers', () => {
    const transcript = t([
      'Agent: The internship needs at least twenty-five hours a week. Can you commit to that?',
      'User: Yes.',
    ]);
    const a = extractAnswersFromTranscript({ transcript });
    const b = extractAnswersFromTranscript({ transcript });
    expect(a).toEqual(b);
  });
});
