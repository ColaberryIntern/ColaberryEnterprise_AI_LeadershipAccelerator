// The Guided outline for step 1 of the intake ("Your idea").
//
// The brain-dump box asks a beginner to know what a build plan needs. Most do
// not, so they write one sentence and step 2 has to ask about everything. The
// outline names the ten things the plan needs, in plain words, and lets them
// fill what they can in any order.
//
// It is a PRESENTATION of the same input, not a second pipeline. Whatever is
// filled in is folded into one block of text by composeIdea() and sent as
// `idea`, exactly where the brain-dump text went before — so step 2 (question
// generation), step 3 (preview) and the build itself read it unchanged. With
// the outline empty, composeIdea() returns the brain-dump text untouched, so
// a student who never opens the outline sends byte-for-byte what they sent
// before this existed.

export interface Outline {
  produce: string;     // 1. what it produces, and for whom
  users: string;       // 2. who uses it, how comfortable they are
  trigger: string;     // 3. what makes it start (one of TRIGGERS)
  volume: string;      // 3. how many, normal week vs busiest
  tools: string[];     // 4. tools it reads from / writes to
  call: string;        // 5. the judgement being handed over
  check: string;       // 6. what they would look at before it goes out
  unsure: string;      // 7. what it does when unsure (one of UNSURE)
  autonomy: string[];  // 8. what they need to see before it runs alone
  today: string;       // 9. how long it takes / how often it goes wrong today
  good: string;        // 9. what good would look like
  standout: string;    // 10. the "I didn't know it could do that" moment
  cut: string;         // 10. what they would drop to get it
}

export const EMPTY_OUTLINE: Outline = {
  produce: '', users: '', trigger: '', volume: '', tools: [], call: '', check: '',
  unsure: '', autonomy: [], today: '', good: '', standout: '', cut: '',
};

export const TRIGGERS = ['Someone asks', 'Something arrives', 'A time of day'];
export const TOOLS = ['Gmail', 'Outlook', 'Slack', 'Google Sheets', 'HubSpot', 'Salesforce', 'A shared drive'];
export const UNSURE = ['Flag it for me', 'Ask me', 'Make its best guess and show its reasoning', 'Stop'];
export const AUTONOMY = [
  'Show me everything it prepared before it sends',
  'Let me undo it after',
  'Tell me in plain words why it decided that',
  'Send me a summary at the end of the day',
];

/** The ten sections, in order, with the short name the side outline shows. */
export const SECTIONS: { id: string; short: string; filled: (o: Outline) => boolean }[] = [
  { id: 'q1', short: "What it's for", filled: (o) => has(o.produce) },
  { id: 'q2', short: 'Who uses it', filled: (o) => has(o.users) },
  { id: 'q3', short: 'What starts it', filled: (o) => has(o.trigger) || has(o.volume) },
  { id: 'q4', short: 'Tools it works with', filled: (o) => o.tools.length > 0 },
  { id: 'q5', short: 'The call it makes', filled: (o) => has(o.call) },
  { id: 'q6', short: "What you'd check", filled: (o) => has(o.check) },
  { id: 'q7', short: "When it isn't sure", filled: (o) => has(o.unsure) },
  { id: 'q8', short: 'Running on its own', filled: (o) => o.autonomy.length > 0 },
  { id: 'q9', short: "How you'll measure it", filled: (o) => has(o.today) || has(o.good) },
  { id: 'q10', short: 'The standout, and the cut', filled: (o) => has(o.standout) || has(o.cut) },
];

function has(s: string): boolean {
  return s.trim().length > 0;
}

export function filledCount(o: Outline): number {
  return SECTIONS.filter((s) => s.filled(o)).length;
}

/**
 * Fold the outline and the free text into the single `idea` string the rest of
 * the intake already consumes. Each filled answer becomes one labelled line in
 * the student's voice, so the question writer in step 2 can see which angles
 * are covered and skip them. Empty answers are left out entirely — a line
 * saying "Who uses it: (blank)" would read as an answer.
 */
export function composeIdea(o: Outline, freeText: string): string {
  const lines: string[] = [];
  const add = (label: string, value: string) => { if (has(value)) lines.push(`${label}: ${value.trim()}`); };

  add('What it should produce, and for whom', o.produce);
  add('Who uses it, and how comfortable they are with tools like this', o.users);
  add('What makes it start', o.trigger);
  add('How many, in a normal week and on the busiest', o.volume);
  if (o.tools.length) add('Tools it needs to read from or write to', o.tools.join(', '));
  add('The call I am handing over, and what I look at to make it', o.call);
  add('What I want to look at myself before it goes out', o.check);
  add("When it isn't sure, it should", o.unsure);
  if (o.autonomy.length) add("Before I'd let it run on its own, I'd need it to", o.autonomy.join('; '));
  add('How long it takes today, or how often it goes wrong', o.today);
  add('What good would look like', o.good);
  add('What would make someone say "I didn\'t know it could do that"', o.standout);
  add("What I'd drop to get it", o.cut);

  if (lines.length === 0) return freeText;
  const free = freeText.trim();
  return free ? `${lines.join('\n')}\n\nAnything else:\n${free}` : lines.join('\n');
}
