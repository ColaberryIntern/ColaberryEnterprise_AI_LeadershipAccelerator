import { scaffoldPlan } from '../composerAi';
import { checkDependencies } from '../dependencyEngine';
import { estimateEvidence } from '../evidenceEngine';
import { validateCurriculum } from '../validationEngine';
import { journeyContribution } from '../architectJourney';
import { deriveDna } from '../curriculumDna';
import { recommend } from '../optimizationEngine';
import { PlanCard } from '../types';

const BP = { title: 'Prompt Engineering', week: 4, difficulty: 'core', competencies: ['prompt_engineering', 'context_engineering', 'testing', 'github'], architect_domains: ['prompt_engineering', 'architecture'] };

describe('scaffoldPlan', () => {
  it('assembles a 13-card week from real registry types with all deps satisfied', () => {
    const plan = scaffoldPlan(BP, 'week');
    expect(plan.cards.length).toBe(13);
    expect(plan.cards.every((c) => typeof c.type === 'string')).toBe(true);
    expect(checkDependencies(plan.cards).ok).toBe(true);   // canonical sequence is dependency-clean
    expect(plan.cards[0].type).toBe('announcement');
  });
  it('shrinks for smaller scopes', () => {
    expect(scaffoldPlan(BP, 'lesson').cards.length).toBe(2);
    expect(scaffoldPlan(BP, 'certification_module').cards.some((c) => c.type === 'certification_exercise')).toBe(true);
  });
  it('includes ONLY approved activities when an approved set is given', () => {
    const approved = new Set(['announcement', 'video', 'reflection']);
    const plan = scaffoldPlan(BP, 'week', approved);
    expect(plan.cards.length).toBe(3);
    expect(plan.cards.every((c) => approved.has(c.type))).toBe(true);
  });
});

describe('dependencyEngine', () => {
  const card = (type: string): PlanCard => ({ type, title: type, bucket: 'learn', week: 1, difficulty: 'core', estimated_time: 15, points: { learning: 0, builder: 0, community: 0 }, competencies: [] });
  it('flags a Prompt Lab with no Video before it', () => {
    const r = checkDependencies([card('prompt_lab')]);
    expect(r.ok).toBe(false);
    expect(r.issues[0].missing.sort()).toEqual(['video']);
  });
  it('is satisfied when prerequisites appear earlier', () => {
    expect(checkDependencies([card('video'), card('prompt_lab')]).ok).toBe(true);
  });
  it('order matters — a prereq AFTER the dependent does not satisfy it', () => {
    expect(checkDependencies([card('prompt_lab'), card('video')]).ok).toBe(false);
  });
});

describe('evidenceEngine', () => {
  it('estimates github + portfolio + xp from the plan', () => {
    const ev = estimateEvidence(scaffoldPlan(BP, 'week').cards);
    expect(ev.github.commits).toBeGreaterThan(0);
    expect(ev.github.repos).toBeGreaterThan(0);
    expect(ev.portfolio.entries).toBeGreaterThan(0);
    expect(ev.xp.builder).toBeGreaterThan(0);
    expect(ev.architect_readiness).toBeGreaterThan(0);
    expect(ev.architect_readiness).toBeLessThanOrEqual(1);
  });
});

describe('validationEngine', () => {
  it('passes + is publishable for the canonical week', () => {
    const v = validateCurriculum(scaffoldPlan(BP, 'week').cards, BP);
    expect(v.publishable).toBe(true);
    expect(v.quality).toBeGreaterThan(60);
    expect(v.checks.find((c) => c.key === 'dependencies')!.status).toBe('pass');
  });
  it('is NOT publishable when a hard check fails (lone Prompt Lab)', () => {
    const lone: PlanCard[] = [{ type: 'prompt_lab', title: 'x', bucket: 'practice', week: 1, difficulty: 'core', estimated_time: 45, points: { learning: 0, builder: 40, community: 0 }, competencies: ['prompt_engineering'] }];
    const v = validateCurriculum(lone, BP);
    expect(v.publishable).toBe(false);
    expect(v.checks.some((c) => c.status === 'fail')).toBe(true);
  });
});

describe('architectJourney + DNA', () => {
  it('names the stage the plan advances', () => {
    const j = journeyContribution(scaffoldPlan(BP, 'week').cards);
    expect(j.stages.length).toBe(7);
    expect(j.stages.some((s) => s.contributes)).toBe(true);
    expect(j.why).toMatch(/Architect/);
  });
  it('derives a DNA fingerprint', () => {
    const cards = scaffoldPlan(BP, 'week').cards;
    const dna = deriveDna(BP, cards, validateCurriculum(cards, BP));
    expect(dna.competencies.length).toBeGreaterThan(0);
    expect(dna.focus_stage).toBeTruthy();
    expect(dna.estimated_completion_hours).toBeGreaterThan(0);
  });
});

describe('optimizationEngine', () => {
  it('recommends adding GitHub evidence when there is none', () => {
    const noGh: PlanCard[] = [
      { type: 'deep_dive', title: 'o', bucket: 'learn', week: 1, difficulty: 'intro', estimated_time: 15, points: { learning: 10, builder: 0, community: 0 }, competencies: [] },
      { type: 'video', title: 'v', bucket: 'learn', week: 1, difficulty: 'intro', estimated_time: 15, points: { learning: 15, builder: 0, community: 0 }, competencies: [] },
    ];
    const recs = recommend(noGh, BP, validateCurriculum(noGh, BP));
    expect(recs.some((r) => r.area === 'github')).toBe(true);
    expect(recs[0].rank).toBe(1);
  });
});
