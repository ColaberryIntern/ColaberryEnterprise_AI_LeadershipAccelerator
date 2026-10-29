/**
 * C91: an Explorer's next step is their first lesson before any setup ask (resume, referral); members are untouched.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useTodayNextStep, type TodayNextStep } from '../useTodayNextStep';
import type { TimelineFeedCard } from '../../../../components/timeline/TimelineCard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const lesson = { id: 'c1', title: 'First', status: 'available', week: 0, order: 1, bucket: 'learn' } as unknown as TimelineFeedCard;
const setup = { key: 'resume', title: 'Upload your resume or LinkedIn PDF', action: () => undefined };
type Params = Parameters<typeof useTodayNextStep>[0];
const base: Params = { isExplorer: true, curriculum: [lesson], buckets: ['learn'], setupRemaining: 2, nextSetupStep: setup, planFlagOn: false, refreshToken: 0 };

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); root = createRoot(container); });
afterEach(() => act(() => root.unmount()));

function stepFor(p: Partial<Params>): TodayNextStep {
  let out: TodayNextStep | null = null;
  const Probe = () => { out = useTodayNextStep({ ...base, ...p }); return null; };
  act(() => { root.render(<Probe />); });
  return out!;
}

it('an Explorer with a first lesson to do: that lesson comes before the resume ask', () => {
  expect(stepFor({ firstLesson: lesson })).toEqual({ kind: 'first-lesson', card: lesson });
});

it('once the first win is in (no firstLesson), the setup asks come back in their old order', () => {
  expect(stepFor({ firstLesson: null })).toMatchObject({ kind: 'setup', key: 'resume' });
  expect(stepFor({})).toMatchObject({ kind: 'setup', key: 'resume' });
});

it('a member never gets the first-lesson step, even if one is passed', () => {
  const week1 = { ...lesson, id: 'w1', week: 1 } as unknown as TimelineFeedCard;
  expect(stepFor({ isExplorer: false, curriculum: [week1], firstLesson: lesson })).toEqual({ kind: 'classroom', card: week1 });
});
