/**
 * coraStyleGate tests (BC #10109319420, "de-AI-ify" ask).
 *
 * Pins the concrete, mechanically-checkable AI tells listed on the ticket.
 * Pure function, no I/O.
 */
import { scoreCoraReplyStyle, STYLE_GATE_PASS_THRESHOLD } from '../coraStyleGate';

describe('scoreCoraReplyStyle', () => {
  it('happy path: a clean, on-brand human-sounding reply scores at/above the pass threshold', () => {
    const body =
      "Thanks for asking! The Founding Cohort starts July 23rd, and there are still a few seats left. " +
      "Let me know if you want the enrollment link, or if you had something else in mind.\n\nCora";

    const result = scoreCoraReplyStyle(body, 'cora');

    expect(result.score).toBeGreaterThanOrEqual(STYLE_GATE_PASS_THRESHOLD);
    expect(result.violations).toHaveLength(0);
  });

  it('flags an em dash', () => {
    const result = scoreCoraReplyStyle('The program runs 12 weeks — fully online.\n\nCora');
    expect(result.violations.some((v) => v.includes('em dash'))).toBe(true);
  });

  it('flags literal markdown bold leaking into plain text', () => {
    const result = scoreCoraReplyStyle('**Key Benefit:** you get certified.\n\nCora');
    expect(result.violations.some((v) => v.toLowerCase().includes('markdown'))).toBe(true);
  });

  it('flags emoji used as a bullet marker', () => {
    const result = scoreCoraReplyStyle('🚀 Fast-track your career\n\nCora');
    expect(result.violations.some((v) => v.toLowerCase().includes('emoji'))).toBe(true);
  });

  it('flags a numbered list', () => {
    const body = '1. First you enroll.\n2. Then you start class.\n\nCora';
    const result = scoreCoraReplyStyle(body);
    expect(result.violations.some((v) => v.toLowerCase().includes('numbered'))).toBe(true);
  });

  it('flags banned generic AI phrases', () => {
    const result = scoreCoraReplyStyle('I hope this message finds you well. Thanks!\n\nCora');
    expect(result.violations.some((v) => v.toLowerCase().includes('i hope this message finds you well'))).toBe(true);
  });

  it('flags corporate buzzwords', () => {
    const result = scoreCoraReplyStyle('We leverage a seamless, cutting-edge platform.\n\nCora');
    expect(result.violations.some((v) => v.toLowerCase().includes('buzzword'))).toBe(true);
  });

  it('flags stacked exclamation points', () => {
    const result = scoreCoraReplyStyle("That's amazing!! Welcome aboard!!\n\nCora");
    expect(result.violations.some((v) => v.toLowerCase().includes('exclamation'))).toBe(true);
  });

  it('flags a missing persona sign-off', () => {
    const result = scoreCoraReplyStyle('Thanks for reaching out, here is the information you asked for.', 'cory');
    expect(result.violations.some((v) => v.includes('Cory'))).toBe(true);
  });

  it('does not flag a present persona sign-off', () => {
    const result = scoreCoraReplyStyle('Thanks for reaching out, happy to help.\n\nCory', 'cory');
    expect(result.violations.some((v) => v.includes('Missing "Cory"'))).toBe(false);
  });

  it('boundary: score never drops below 0 even with many stacked violations', () => {
    const body =
      '**Key Benefit:** 🚀 leverage our seamless, cutting-edge, robust, game-changer platform — ' +
      "I hope this message finds you well!! It's important to note that we utilize and streamline everything!!\n" +
      '1. one\n2. two\n3. three';
    const result = scoreCoraReplyStyle(body, 'cora');
    expect(result.score).toBe(0);
    expect(result.violations.length).toBeGreaterThan(3);
  });

  it('does not false-positive on a normal multi-sentence reply with varied length', () => {
    const body =
      "Good question. The certification is issued through Anthropic once you finish the final project, " +
      "and most people wrap that up in the last two weeks of the cohort. If you get stuck, our team " +
      "is around during office hours to help.\n\nCora";
    const result = scoreCoraReplyStyle(body, 'cora');
    expect(result.score).toBeGreaterThanOrEqual(STYLE_GATE_PASS_THRESHOLD);
  });
});
