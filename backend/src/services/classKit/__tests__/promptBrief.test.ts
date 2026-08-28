import { promptBrief, splitScript } from '../kitHtml';
import type { KitSlide } from '../kitSpec';

/**
 * promptBrief.test.ts — the one-glance answer the instructor's phone shows the
 * moment they land on a slide: is there something to run here, and what will it
 * do?
 *
 * Added 2026-08-27 after Ali test-drove the Session 11 deck: "Also tell me here
 * if there is a prompt to run on this step … make the 1st message for steps with
 * prompts about the prompt — what it will do and how it works — before I
 * actually dive into reading the prompt."
 *
 * The brief is DERIVED from fields the slide already authors rather than being
 * a second, hand-written copy, so the rules worth pinning are (a) it is never
 * silent — "no prompt" is itself information mid-class — and (b) it never
 * fabricates a field the slide did not author.
 */

const base = (over: Partial<KitSlide> = {}): KitSlide => ({
  id: 's1', kind: 'teach', title: 'A slide', segmentId: 'guided-build',
  segmentLabel: 'Guided build', segStartMin: 0, segEndMin: 10,
  ...over,
} as KitSlide);

describe('promptBrief', () => {
  it('says so plainly when a step has no prompt, rather than returning nothing', () => {
    // Silence would read identically to "the phone has not updated yet".
    expect(promptBrief(base())).toBe('○ No prompt on this step — talk to the diagram.');
  });

  it('leads with the fact that there IS a prompt, and where it runs', () => {
    const out = promptBrief(base({
      prompt: { kind: 'paste', label: 'Scaffold my server', pasteWhere: 'Claude Code', code: 'x' },
    } as Partial<KitSlide>));
    expect(out.split('\n')[0]).toBe('▶ PROMPT ON THIS STEP — runs in Claude Code');
  });

  it('names the Claude Code mode when the slide authors one', () => {
    const out = promptBrief(base({
      prompt: { kind: 'paste', pasteWhere: 'Claude Code', ccMode: 'Plan Mode', code: 'x' },
    } as Partial<KitSlide>));
    expect(out.split('\n')[0]).toBe('▶ PROMPT ON THIS STEP — runs in Claude Code (Plan Mode)');
  });

  it('defaults the target to Claude Code when pasteWhere is not authored', () => {
    const out = promptBrief(base({ prompt: { kind: 'paste', code: 'x' } } as Partial<KitSlide>));
    expect(out).toContain('runs in Claude Code');
  });

  it('carries what it produces, when it is done, and the rescue — in that order', () => {
    const out = promptBrief(base({
      prompt: {
        kind: 'paste', label: 'CP1, the tool', pasteWhere: 'Claude Code', code: 'x',
        expectedResult: 'A constrained tool.',
        stopCondition: 'The docstring says WHEN to use it.',
        rescue: 'Ask for type annotations.',
      },
    } as Partial<KitSlide>));
    const lines = out.split('\n');
    expect(lines[1]).toBe('What it is: CP1, the tool');
    expect(lines[2]).toBe('What it produces: A constrained tool.');
    expect(lines[3]).toBe('Done when: The docstring says WHEN to use it.');
    expect(lines[4]).toBe('If it misfires: Ask for type annotations.');
  });

  it('omits lines the slide did not author instead of printing empty labels', () => {
    const out = promptBrief(base({
      prompt: { kind: 'paste', pasteWhere: 'your TERMINAL (not Claude Code)', code: 'x' },
    } as Partial<KitSlide>));
    expect(out).not.toContain('What it produces:');
    expect(out).not.toContain('Done when:');
    expect(out).not.toContain('If it misfires:');
    // The terminal case must still not be described as something to type into
    // Claude Code — the deck already distinguishes the two everywhere else.
    expect(out).toContain('runs in your TERMINAL (not Claude Code)');
  });

  it('marks a read-along block as nothing to paste', () => {
    const out = promptBrief(base({
      prompt: { kind: 'review', label: 'server.py — read it', code: 'x' },
    } as Partial<KitSlide>));
    expect(out).toContain('READ-ALONG on this step — nothing to paste.');
    expect(out).not.toContain('PROMPT ON THIS STEP');
  });
});

/**
 * splitScript — the SAY / DO / NOTE separation. Ali, 2026-08-27, presenting
 * from the un-split version: "I don't know if I'm supposed to read any of it
 * and it is really hard to follow. Trying to read it when the new slide comes
 * on and trying not to take a long pause is hard to do."
 *
 * The load-bearing property is that neither screen ever mixes the two roles —
 * a spoken line must never appear in the direction, and direction must never
 * appear where the instructor is reading aloud.
 */
describe('splitScript', () => {
  it('gives the arrival screen the whole tagged script, and the read screen only the spoken lines', () => {
    const r = splitScript(
      'SAY: Read this out.\nDO: Put it on screen.\nNOTE: Watch the clock.',
      'the body paragraph',
    );
    expect(r.say).toBe('the body paragraph');
    expect(r.setup).toBe('SAY: Read this out.\nDO: Put it on screen.\nNOTE: Watch the clock.');
  });

  it('strips the SAY tag from the read screen but keeps every tag on arrival for colouring', () => {
    const r = splitScript('SAY: Hello.\nDO: Click it.', undefined);
    expect(r.say).not.toMatch(/SAY:/);
    expect(r.setup).toBe('SAY: Hello.\nDO: Click it.');
  });

  it('keeps multiple spoken lines separated so they read as separate beats', () => {
    const r = splitScript('SAY: First beat.\nDO: Something.\nSAY: Second beat.', undefined);
    expect(r.say).toBe('First beat.\n\nSecond beat.');
  });

  it('never lets direction reach the read screen', () => {
    const r = splitScript('DO: Run it.\nNOTE: Then wait.\nSAY: Only this.', 'The paragraph.');
    expect(r.say).toBe('The paragraph.');
    expect(r.say).not.toMatch(/DO:|NOTE:/);
  });

  it('degrades cleanly for an untagged script: body is spoken, script is context', () => {
    // Every week except the one authored against this is untagged, and must
    // keep behaving exactly as it did before the tags existed.
    const r = splitScript('Walk the diagram node by node.', 'The paragraph they read.');
    expect(r.say).toBe('The paragraph they read.');
    expect(r.setup).toBe('NOTE: Walk the diagram node by node.\nSAY: The paragraph they read.');
  });

  it('falls back to the script’s SAY cues when a slide has no paragraph of its own', () => {
    const r = splitScript('DO: Just run it.\nSAY: The only spoken cue.', undefined);
    expect(r.say).toBe('The only spoken cue.');
  });

  it('handles a slide with neither script nor body without throwing', () => {
    expect(splitScript(undefined, undefined)).toEqual({ say: '', setup: '' });
  });
});
