const { schoolOf, cleanBody, normaliseItems } = require('../familySchoolNews');
const { validateBeforeSend } = require('../mandrillPreflight');
const { renderFamilyDashboardEmail, renderFamilyDashboardEmailText } = require('../renderFamilyDashboardEmail');

describe('schoolOf', () => {
  test('the ParentSquare footer decides the school', () => {
    expect(schoolOf({ subject: 'Wylie ISD | Weekly Grade Update for Addison', body_text: 'x\nYou received this email because you are a Wylie ISD Connect user in Harrison Intermediate. If' }).child).toBe('Addison');
  });
  test('digest subjects map Watkins to Creed and district posts to Family', () => {
    expect(schoolOf({ subject: 'Nov 12, 2026 Digest: 2 new messages from Watkins Elementary today', body_text: '' }).child).toBe('Creed');
    expect(schoolOf({ subject: 'Nov 9, 2026 Digest: 1 new message from Wylie Independent School District today', body_text: '' }).child).toBe('Family');
  });
  test('Naaman Forest maps to Jayce; unrelated mail maps to nothing', () => {
    expect(schoolOf({ subject: 'Naaman Forest senior night', body_text: '' }).child).toBe('Jayce');
    expect(schoolOf({ subject: 'Your order shipped', body_text: 'thanks' })).toBeNull();
  });
});

test('cleanBody drops signed ParentSquare links and the unsubscribe footer', () => {
  const out = cleanBody('Lunch Nov 18.\nhttps://www.parentsquare.com/feeds/1?s=SECRET\nYou received this email because you are a user. https://x');
  expect(out).toContain('Lunch Nov 18.');
  expect(out).not.toMatch(/SECRET|received this email/);
});

describe('normaliseItems', () => {
  const today = '2026-11-13';
  test('drops past events, unknown children and ParentSquare links; strips dashes; sorts by date', () => {
    const out = normaliseItems([
      { child: 'Creed', date: '2026-11-19', title: 'Balloon project — due', link: 'https://www.parentsquare.com/x' },
      { child: 'Addison', date: '2026-11-16', title: 'Thanksgiving lunch form', link: 'https://docs.google.com/forms/abc' },
      { child: 'Creed', date: '2026-11-01', title: 'Old event' },
      { child: 'Bob', date: '2026-11-20', title: 'Not ours' },
    ], today);
    expect(out.map((i) => i.title)).toEqual(['Thanksgiving lunch form', 'Balloon project, due']);
    expect(out[0].link).toBe('https://docs.google.com/forms/abc');
    expect(out[1].link).toBeNull();
  });
  test('junk model output gives an empty list, not a crash', () => {
    expect(normaliseItems(undefined, today)).toEqual([]);
    expect(normaliseItems([{ child: 'Creed', date: 'next week', title: 'x' }], today)[0].date).toBeNull();
  });
});

describe('rendered newsletter sections', () => {
  const base = () => ({
    generatedAt: '2026-11-13T12:00:00Z',
    kpis: { dueThisWeek: 1, overdue: 0, newSinceYesterday: 0, moneyPendingTotal: 0, sourcesConnected: 3, sourcesTotal: 3 },
    weekLoad: [], basecampHealth: [], newSinceYesterday: [], moneyItems: [], sources: [], risks: [],
  });

  test('with photos and school items the email embeds each photo by cid and passes the Mandrill preflight', () => {
    const data = { ...base(),
      photos: [{ cid: 'photo-1@family', caption: 'Team photo — after the game', takenAt: '2026-11-06T18:24:36' }],
      school: { items: [{ child: 'Creed', date: '2026-11-20', title: 'Kindergarten Feast', detail: 'Families invited — 1:30 PM', action: 'Sign up', link: 'https://www.signupgenius.com/go/x' }], coverage: [{ child: 'Jayce', school: 'Naaman Forest High School', emails: 0 }], fallback: false } };
    const html = renderFamilyDashboardEmail(data);
    expect(html).toContain('src="cid:photo-1@family"');
    expect(html).toContain('Kindergarten Feast');
    expect(html).toContain('Jayce is not covered yet');
    expect(() => validateBeforeSend(html, renderFamilyDashboardEmailText(data))).not.toThrow();
  });

  test('with no photos and no school feed both sections are absent, not empty boxes', () => {
    const html = renderFamilyDashboardEmail({ ...base(), photos: [], school: null });
    expect(html).not.toContain('Family Photos');
    expect(html).not.toContain('From the kids');
  });
});
