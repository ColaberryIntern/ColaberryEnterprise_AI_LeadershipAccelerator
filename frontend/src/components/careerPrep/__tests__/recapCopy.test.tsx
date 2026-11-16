import React from 'react';
import fs from 'fs';
import path from 'path';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import type { PrepDashboard, PrepRecap } from '../careerPrepApi';
import { centralTime, recapCards, recapText, reminderSetText, tonightOffered } from '../logic/recapCopy';
import { ProgressDashboard } from '../ProgressDashboard';

const recap: PrepRecap = {
  status: 'finished', minutes: 11, attempts: 2, firstName: 'Ali', readiness: { before: 64, after: 69, company: 'Meridian Freight' },
  skills: [{ key: 'few_fillers', label: 'Few filler words', before: 61, after: 64 }, { key: 'pace_clarity', label: 'Pace and clarity', before: 48, after: 57 }], streak: 5,
};

describe('the recap words (CP4.5)', () => {
  it('names the readiness move and the skill that moved most, from the recap only', () => {
    expect(recapText(recap)).toBe('Session done, Ali. Readiness for Meridian Freight: 64 → 69. "Pace and clarity" moved 48 → 57. I have added today\'s 11 minutes to your dashboard.');
  });
  it('a first score says "starts at", and nothing is said about a readiness the recap does not have', () => {
    const t = recapText({ status: 'ended', minutes: 1, attempts: 1, skills: [{ key: 'pace_clarity', label: 'Pace and clarity', after: 57 }], streak: 1 });
    expect(t).toBe('Session ended. "Pace and clarity" starts at 57. I have added today\'s 1 minute to your dashboard.');
    expect(t).not.toMatch(/Readiness/);
  });
  it('no scored answer says the numbers did not change', () => {
    expect(recapText({ status: 'finished', minutes: 20, attempts: 0, skills: [], streak: 2 })).toContain('No answer was scored this time');
  });
  it('the cards: dashboard, same time tomorrow at the session start in Central, another session', () => {
    const c = recapCards('2026-11-16T23:30:00.000Z');
    expect(c.map((x) => x.id)).toEqual(['tab:progress', 'remind:tomorrow', 'offer']);
    expect(c[1].line).toBe('5:30 PM CT, in the app and by email');
  });
  it('tonight is offered only before 6:00 PM Central, across DST', () => {
    expect(tonightOffered(new Date('2026-11-16T23:59:00Z'))).toBe(true); // 5:59 PM CST
    expect(tonightOffered(new Date('2026-11-17T00:00:00Z'))).toBe(false); // 6:00 PM CST
    expect(tonightOffered(new Date('2026-07-01T22:59:00Z'))).toBe(true); // 5:59 PM CDT
    expect(tonightOffered(new Date('2026-07-01T23:00:00Z'))).toBe(false); // 6:00 PM CDT
  });
  it('the reminder confirmation shows the real send time in Central', () => {
    expect(reminderSetText('2026-11-17T14:00:00.000Z')).toBe('Done. I will remind you at 8:00 AM Central, here and by email.');
    expect(centralTime('2026-11-17T00:00:00.000Z')).toBe('6:00 PM');
  });
});

describe('the dashboard marks what the session moved (CP4.5)', () => {
  let root: Root | null = null;
  afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } root = null; });
  it('a skill in newKeys reads New; the others do not', () => {
    const d: PrepDashboard = { interviews: [], sources: { video: 2, phone_mock: 0, real_interview: 0, training: 0, project: 0 }, weeklyMinutes: [], streak: 1, thisWeek: 11,
      skills: [{ key: 'pace_clarity', label: 'Pace and clarity', score: 57, count: 2, sources: ['video'] }, { key: 'few_fillers', label: 'Few filler words', score: 64, count: 2, sources: ['video'] }] } as PrepDashboard;
    const h = document.createElement('div');
    const r = createRoot(h);
    root = r;
    act(() => { r.render(<ProgressDashboard d={d} onAnchor={jest.fn()} onSkill={jest.fn()} newKeys={['pace_clarity']} />); });
    expect(h.querySelector('[data-testid="cp-new-pace_clarity"]')?.textContent).toBe(' New');
    expect(h.querySelector('[data-testid="cp-new-few_fillers"]')).toBeNull();
  });
});

describe('nothing in Career Prep reads a face (CP4.4)', () => {
  it('no face, eye contact, expression or accent wording in the Career Prep frontend (the CSS --accent color token is not speech)', () => {
    const roots = [path.join(__dirname, '..'), path.join(__dirname, '..', '..', '..', 'pages', 'portal', 'careerPrep')];
    const files = roots.flatMap((dir) => fs.readdirSync(dir, { recursive: true } as { recursive: true }) as string[])
      .map(String).filter((f) => /\.(tsx?|css)$/.test(f) && !f.includes('__tests__'));
    expect(files.length).toBeGreaterThan(20);
    const hits = roots.flatMap((dir) => files.filter((f) => fs.existsSync(path.join(dir, f)))
      .filter((f) => /\bfaces?\b|facial|eye contact|\bexpressions?\b|\b(?:an|your|their|speech|regional|spoken) accents?\b/i.test(fs.readFileSync(path.join(dir, f), 'utf8'))).map((f) => f));
    expect(hits).toEqual([]);
  });
});
