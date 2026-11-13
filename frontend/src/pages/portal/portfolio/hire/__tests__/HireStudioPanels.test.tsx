import React from 'react';
import HireInterviewTimes from '../HireInterviewTimes';
import HireCaseStudyOrder from '../HireCaseStudyOrder';
import HireAboutYou from '../HireAboutYou';
import * as api from '../../../../../services/hireStudioApi';
import * as H from '../../../../admin/__fixtures__/domHarness';

/** The three editing panels: the grid toggles, the reorder and star, and About you's limits. */
jest.mock('../../../../../services/hireStudioApi', () => ({
  ...jest.requireActual('../../../../../services/hireStudioApi'),
  saveAvailability: jest.fn(), saveCaseStudyOrder: jest.fn(), saveHireIntro: jest.fn(),
}));
const m = api as jest.Mocked<typeof api>;
afterEach(() => { H.unmount(); jest.clearAllMocks(); });

const OFF: api.InterviewAvailability = { enabled: false, tz: 'America/Chicago', blocks: [], formats: ['intro'], maxPerWeek: 5, minNoticeHours: 24, autoConfirm: false };

describe('Interview times', () => {
  it('toggles 44px grid cells with aria-pressed and saves exactly what was picked', async () => {
    m.saveAvailability.mockImplementation(async (a) => a);
    const onSaved = jest.fn();
    H.mount(<HireInterviewTimes loaded={{ value: OFF, failed: false }} onSaved={onSaved} onRetry={jest.fn()} />, '/');
    const cell = H.el('hs-cell-Tue-afternoon');
    expect(cell.getAttribute('aria-label')).toBe('Tue afternoon');
    expect(cell.getAttribute('aria-pressed')).toBe('false');
    H.click('hs-cell-Tue-afternoon');
    expect(H.el('hs-cell-Tue-afternoon').getAttribute('aria-pressed')).toBe('true');
    H.toggle('hs-enabled');
    H.click('hs-format-walkthrough');
    H.setValue('hs-max', 'none');
    H.click('hs-times-save');
    await H.settle();
    expect(m.saveAvailability).toHaveBeenCalledWith({ ...OFF, enabled: true, blocks: ['Tue-afternoon'], formats: ['intro', 'walkthrough'], maxPerWeek: null });
    expect(onSaved).toHaveBeenCalled();
  });

  it('offers Confirm automatically, off by default, and saves it', async () => {
    m.saveAvailability.mockImplementation(async (a) => a);
    H.mount(<HireInterviewTimes loaded={{ value: { ...OFF, enabled: true, blocks: ['Mon-morning'] }, failed: false }} onSaved={jest.fn()} onRetry={jest.fn()} />, '/');
    expect((H.el('hs-auto') as HTMLInputElement).checked).toBe(false);
    H.toggle('hs-auto');
    H.click('hs-times-save');
    await H.settle();
    expect(m.saveAvailability).toHaveBeenCalledWith(expect.objectContaining({ autoConfirm: true }));
  });

  it('will not turn booking on with no blocks, or save with no format', async () => {
    H.mount(<HireInterviewTimes loaded={{ value: { ...OFF, enabled: true }, failed: false }} onSaved={jest.fn()} onRetry={jest.fn()} />, '/');
    H.click('hs-times-save');
    expect(H.el('hs-times-msg').textContent).toContain('Mark at least one time block');
    H.click('hs-format-intro');
    H.click('hs-cell-Mon-morning');
    H.click('hs-times-save');
    expect(H.el('hs-times-msg').textContent).toContain('at least one interview format');
    expect(m.saveAvailability).not.toHaveBeenCalled();
  });
});

describe('Case studies', () => {
  const order: api.CaseStudyOrder = { slugs: ['b'], cases: ['a', 'b', 'c'].map((s) => ({ slug: s, title: `Case ${s}`, coverImageUrl: null })), talentSlug: 'k' };

  it('lists the saved order first, stars one to the top, moves with labelled buttons, and saves', async () => {
    m.saveCaseStudyOrder.mockImplementation(async (s) => s);
    H.mount(<HireCaseStudyOrder loaded={{ value: order, failed: false }} onSaved={jest.fn()} onRetry={jest.fn()} />, '/');
    const titles = () => H.queryAll('hs-case').map((li) => li.querySelector('.hs-case-t')!.firstChild!.textContent);
    expect(titles()).toEqual(['Case b', 'Case a', 'Case c']);
    expect(H.el('hs-star-c').getAttribute('aria-label')).toBe('Make “Case c” your signature');
    H.click('hs-star-c');
    expect(titles()).toEqual(['Case c', 'Case b', 'Case a']);
    H.click('hs-down-b');
    expect(titles()).toEqual(['Case c', 'Case a', 'Case b']);
    expect((H.el('hs-up-c') as HTMLButtonElement).disabled).toBe(true);
    H.click('hs-cases-save');
    await H.settle();
    expect(m.saveCaseStudyOrder).toHaveBeenCalledWith(['c', 'a', 'b']);
  });

  it('says plainly when nothing is published yet', () => {
    H.mount(<HireCaseStudyOrder loaded={{ value: { slugs: [], cases: [], talentSlug: null }, failed: false }} onSaved={jest.fn()} onRetry={jest.fn()} />, '/');
    expect(H.query('hs-cases-empty')).not.toBeNull();
  });
});

describe('About you', () => {
  const intro: api.HireIntro = { headlineDraft: null, answers: [], roles: [], setups: [], location: null, earliestStart: null, workAuth: null, video: null };

  it('saves trimmed answers, chips and the internal work authorization', async () => {
    m.saveHireIntro.mockImplementation(async (i) => i as api.HireIntro);
    H.mount(<HireAboutYou loaded={{ value: intro, failed: false }} onSaved={jest.fn()} onRetry={jest.fn()} />, '/');
    H.setValue('hs-q-team', '  Pairing, then writing it down  ');
    H.click('hs-setup-remote');
    H.setValue('hs-role-input', 'Prompt Engineer');
    H.click('hs-role-add');
    H.setValue('hs-auth', 'Will need sponsorship');
    H.click('hs-about-save');
    await H.settle();
    expect(m.saveHireIntro).toHaveBeenCalledWith(expect.objectContaining({
      answers: [{ key: 'team', text: 'Pairing, then writing it down' }], setups: ['remote'], roles: ['Prompt Engineer'], workAuth: 'Will need sponsorship',
    }));
    expect(H.text()).toContain('never shown on Hire');
  });

  it('stops at five roles', () => {
    H.mount(<HireAboutYou loaded={{ value: { ...intro, roles: ['a', 'b', 'c', 'd', 'e'] }, failed: false }} onSaved={jest.fn()} onRetry={jest.fn()} />, '/');
    H.setValue('hs-role-input', 'f');
    H.click('hs-role-add');
    expect(H.el('hs-about-msg').textContent).toContain('up to 5');
  });
});
