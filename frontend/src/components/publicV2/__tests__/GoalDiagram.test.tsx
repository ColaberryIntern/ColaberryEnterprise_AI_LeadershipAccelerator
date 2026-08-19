/**
 * GoalDiagram.test.tsx
 *
 * These figures sit directly under a recommended service, which makes them
 * claims as much as the prose is. What is asserted here is the boundary: a
 * diagram may draw the SHAPE of an engagement and must not assert an outcome.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GoalDiagram, { GoalKey } from '../GoalDiagram';
import { GOALS } from '../../../config/v2Content';

const html = (g: GoalKey): string => renderToStaticMarkup(<GoalDiagram goal={g} />);
const KEYS = GOALS.map((g) => g.key as GoalKey);

describe('GoalDiagram', () => {
  it('draws a figure for every goal the chooser can select', () => {
    // If a goal is added to the config without a diagram, this fails rather than
    // silently rendering nothing under that option.
    KEYS.forEach((k) => {
      const h = html(k);
      expect(h).toContain('<svg');
      expect(h).toContain('cbv2-gd--' + k);
    });
  });

  /**
   * THE CLAIM BOUNDARY. A figure under a service recommendation must not assert
   * an outcome, so no digit may appear anywhere in the drawing except in the
   * "Fig. 0n" caption. That rule is what keeps the ranked bars in the first
   * diagram honest: they show that ranking happens, not what anyone's ranking
   * came out as.
   */
  it('states no number, percentage or count inside the drawing', () => {
    KEYS.forEach((k) => {
      const h = html(k);
      const svg = h.slice(h.indexOf('<svg'), h.indexOf('</svg>'));
      const textInSvg = (svg.match(/>[^<>]+</g) || []).join(' ');
      expect(textInSvg).not.toMatch(/\d/);
      expect(textInSvg).not.toContain('%');
    });
  });

  /**
   * The drawing repeats words already present in the heading and explanation
   * beside it, so announcing it would make a screen reader read the same content
   * twice. The caption is real text and carries the summary.
   */
  it('hides the drawing from assistive tech but keeps the caption readable', () => {
    KEYS.forEach((k) => {
      const h = html(k);
      expect(h).toContain('aria-hidden="true"');
      expect(h).toContain('<figcaption');
      expect(h).toContain('Fig.');
    });
  });

  it('returns nothing for a goal it has no drawing for, rather than a broken frame', () => {
    expect(renderToStaticMarkup(<GoalDiagram goal={'nope' as GoalKey} />)).toBe('');
  });
});
