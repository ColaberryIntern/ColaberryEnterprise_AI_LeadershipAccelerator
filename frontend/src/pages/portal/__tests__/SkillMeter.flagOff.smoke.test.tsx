/**
 * SkillMeter.flagOff — CAPE Phase 5 flag-off byte-identical proof (design
 * doc §11, §16 Phase 5). `onSkillClick` is optional; when omitted, every
 * OTHER caller of this component (and this same caller when
 * CAPE_TODAY_PLAN_ENABLED is off) must render identically to before this
 * task. Uses the `renderToStaticMarkup` pattern proven in
 * frontend/src/components/admin/kitConfig/__tests__/panels.smoke.test.tsx.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SkillMeter from '../SkillMeter';
import type { LearnerSkillProfile } from '../../../services/capeApi';

function profile(): LearnerSkillProfile {
  return {
    overall_placement: 20, overall_proficiency: 35, weights_version: 1,
    skills: Array.from({ length: 10 }, (_, i) => ({
      skill_id: `skill_${i}`, name: `Skill ${i}`, axis_order: i,
      placement: 10, claim: 0, knowledge: 20, application: 15, judgment: 5,
      proficiency: 30 + i, confidence: i % 2 === 0 ? 0.6 : 0,
      next_review_at: null,
    })),
  };
}

describe('SkillMeter — no onSkillClick prop (flag-off / every other caller)', () => {
  it('renders without throwing and matches a committed snapshot (regression guard on the no-prop path)', () => {
    const html = renderToStaticMarkup(<SkillMeter profile={profile()} />);
    expect(html).toMatchSnapshot();
  });

  it('renders NO role="button", tabIndex, or onClick-driven cursor:pointer markers anywhere when onSkillClick is omitted', () => {
    const html = renderToStaticMarkup(<SkillMeter profile={profile()} />);
    expect(html).not.toMatch(/role="button"/);
    expect(html).not.toMatch(/tabindex="0"/i);
    expect(html).not.toMatch(/cursor:\s*pointer/);
  });

  it('the loading state (n===0, no skills yet) also renders without throwing, prop omitted', () => {
    expect(() => renderToStaticMarkup(<SkillMeter profile={null} />)).not.toThrow();
  });
});

describe('SkillMeter — WITH onSkillClick (positive control — proves the prop is what changes the output)', () => {
  it('the SAME fixture rendered WITH onSkillClick DOES carry the interactive markers', () => {
    const html = renderToStaticMarkup(<SkillMeter profile={profile()} onSkillClick={() => {}} />);
    expect(html).toMatch(/role="button"/);
    expect(html).toMatch(/tabindex="0"/i);
  });
});
