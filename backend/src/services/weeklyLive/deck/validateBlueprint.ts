import { lintFields, tagObject, type FieldKind, type LintContext } from '../contentLint';
import type { SessionBlueprint } from './deckBlueprint';

/**
 * The rules a session blueprint must pass before a deck is built from it (WL4.2). They port the
 * hand-built deck's build-time lint (backend/src/scripts/session-decks/.../build.js) and the
 * run-of-show rules of the plan-live-session skill (scripts/validate_blueprint.js) that apply to a
 * slide deck: one hour, a cold open, at least two hands-on builds, a hot seat, a recap that names next
 * week, ten or more scored sound bites, and the content rules on everything the audience sees.
 *
 * Pure. Returns every problem as a sentence, so a failed generation can be shown and fixed, not guessed.
 */
export const CLASS_MINUTES = 60;
export const MAX_SLIDE_MINUTES = 10;
export const TITLE_HEADLINE_WORDS = 7;
export const HEADLINE_WORDS = 12;
export const HIGHLIGHT_WORDS = 6;
const BAD_START = /^(and|so|it|this)\b/i;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** What each field is for the content lint: projected and streamed text is public on-screen copy. */
function kindOf(path: string): FieldKind | null {
  if (/\.(do|prompt\.text|prompt\.expect)$/.test(path) || /\.poll\.(key|kind)$/.test(path) || /\.kind$/.test(path)) return 'asset';
  if (/\.(say\[\d+\]|read|clip)$/.test(path) || /^soundBites/.test(path)) return 'voiceover';
  return 'onScreen';
}

export function validateBlueprint(bp: SessionBlueprint, ctx: LintContext = {}): string[] {
  const bad: string[] = [];
  const s = bp.slides;
  const at = (k: number) => `slide ${k + 1} (${s[k].title})`;

  const minutes = s.reduce((n, x) => n + x.min, 0);
  if (minutes !== CLASS_MINUTES) bad.push(`run time is ${minutes} minutes, expected ${CLASS_MINUTES}`);
  if (s[0]?.kind !== 'title') bad.push('the first slide must be the title');
  if (!s.slice(0, 3).some((x) => x.kind === 'lobby')) bad.push('a lobby slide (check-in QR) must be in the first three');
  if (s.filter((x) => x.kind === 'agenda').length !== 1) bad.push('exactly one agenda slide');
  if (s[s.length - 1]?.kind !== 'next') bad.push('the last slide must be next week');
  if (s[s.length - 2]?.kind !== 'recap') bad.push('the recap must come right before next week');
  const coldOpen = s.findIndex((x) => x.kind === 'story' || x.kind === 'statement');
  if (coldOpen < 0 || coldOpen > 4) bad.push('a story or statement cold open must come in the first five slides');
  else if (s[coldOpen].min > 5) bad.push(`${at(coldOpen)}: the cold open runs over 5 minutes`);

  const handsOn = s.filter((x) => x.kind === 'handson');
  if (handsOn.length < 2) bad.push(`${handsOn.length} hands-on slides, at least 2 needed`);
  if (!s.some((x) => x.kind === 'hotseat')) bad.push('no hot seat slide');
  const polls = s.filter((x) => x.poll);
  if (polls.length < 2) bad.push(`${polls.length} live votes, at least 2 needed`);
  const keys = polls.map((x) => x.poll!.key);
  if (new Set(keys).size !== keys.length) bad.push('two polls share a key');
  if (s.filter((x) => x.clip).length < 3) bad.push('fewer than 3 clip lines for the Shorts');

  s.forEach((x, k) => {
    if (x.min > MAX_SLIDE_MINUTES) bad.push(`${at(k)}: ${x.min} minutes, at most ${MAX_SLIDE_MINUTES}`);
    // Headlines are projected in very large type: past these they overflow the slide (seen on a live run).
    const hw = words(x.headline); const lw = x.highlight ? words(x.highlight) : 0;
    const maxH = x.kind === 'title' ? TITLE_HEADLINE_WORDS : HEADLINE_WORDS;
    if (hw > maxH) bad.push(`${at(k)}: headline is ${hw} words, at most ${maxH}`);
    if (lw > HIGHLIGHT_WORDS) bad.push(`${at(k)}: highlight is ${lw} words, at most ${HIGHLIGHT_WORDS}`);
    if ((x.kind === 'handson' || x.kind === 'hotseat') && !x.prompt) bad.push(`${at(k)}: needs a prompt to run`);
    if (x.kind !== 'handson' && x.kind !== 'hotseat' && x.prompt) bad.push(`${at(k)}: only hands-on and hot seat slides carry a prompt`);
    if ((x.kind === 'poll') !== Boolean(x.poll)) bad.push(`${at(k)}: ${x.kind === 'poll' ? 'a poll slide needs its poll' : 'only a poll slide carries a poll'}`);
    if (x.poll) {
      const { answer, options, kind } = x.poll;
      if (kind === 'trivia' && answer === null) bad.push(`${at(k)}: trivia needs the right answer`);
      if (answer !== null && answer >= options.length) bad.push(`${at(k)}: the answer is not one of the options`);
    }
    if (x.kind === 'mistake' && !x.pair) bad.push(`${at(k)}: needs the wrong and right versions`);
    if (x.kind === 'chain' && x.steps.length !== 3) bad.push(`${at(k)}: needs three steps`);
    if (x.kind === 'recap' && x.bullets.length !== 3) bad.push(`${at(k)}: needs three things to remember`);
  });

  if (bp.soundBites.length < 10) bad.push(`${bp.soundBites.length} sound bites, at least 10 needed`);
  bp.soundBites.forEach((b, k) => {
    const n = words(b.text);
    if (n < 8 || n > 25) bad.push(`sound bite ${k + 1}: ${n} words, needs 8 to 25`);
    if (BAD_START.test(b.text)) bad.push(`sound bite ${k + 1}: starts with a filler word`);
    if (b.slide >= s.length) bad.push(`sound bite ${k + 1}: points at a slide that does not exist`);
  });

  for (const v of lintFields(tagObject(bp, kindOf), ctx)) bad.push(`content rule ${v.rule} at ${v.field}: "${v.match}"`);
  const everything = JSON.stringify(bp);
  if (/\bguarant(ee|eed)\b/i.test(everything)) bad.push('the word "guarantee" is not allowed');
  return bad;
}
