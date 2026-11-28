import { addDays, briefDueOn, classStart, classTimes, holidayOn, holidays, promotionSlots } from '../briefCalendar';
import { APPROVED_PHOTOS, renderBrief, type BriefFacts } from '../briefRender';
import { briefIssues } from '../briefSchema';
import { JACKIE_ID, sendToJackie, todoTitle, type SendDeps } from '../briefSend';
import { briefWriterPrompt } from '../briefPrompts';
import { sampleCopy } from './sampleCopy';

/** WL4.4 without a database: calendar edges, the copy rules, the rendered brief, and find-before-create. */
describe('calendar', () => {
  it('puts the class at 6:30 PM Central in all four zones, in standard and daylight time', () => {
    expect(classTimes('2026-12-07').map((t) => `${t.time} ${t.zone}`)).toEqual(['6:30 PM CT', '7:30 PM ET', '5:30 PM MT', '4:30 PM PT']);
    expect(classStart('2026-12-07').toISOString()).toBe('2026-12-08T00:30:00.000Z'); // CST, UTC-6
    expect(classStart('2027-06-07').toISOString()).toBe('2027-06-07T23:30:00.000Z'); // CDT, UTC-5
    expect(classTimes('2027-03-15').map((t) => t.time)).toEqual(['6:30 PM', '7:30 PM', '5:30 PM', '4:30 PM']); // the week after the switch
  });

  it('knows the holidays that move online attention', () => {
    expect([holidayOn('2026-11-26'), holidayOn('2026-11-27'), holidayOn('2026-11-30')]).toEqual(['Thanksgiving', 'Black Friday', 'Cyber Monday']);
    expect(holidays(2027).get('2027-01-18')).toBe('Martin Luther King Jr. Day');
    expect(holidays(2027).get('2027-05-31')).toBe('Memorial Day');
    expect(holidayOn('2026-12-08')).toBeNull();
  });

  it('fits a full promotion week: announce, four days, the day before, and three on the day', () => {
    const s = promotionSlots('2026-12-01', '2026-12-07');
    expect(s.map((x) => `${x.id}@${x.date}`)).toEqual(['announce@2026-12-01', 'day1@2026-12-02', 'day2@2026-12-03', 'day3@2026-12-04', 'day4@2026-12-05', 'tomorrow@2026-12-06', 'noon@2026-12-07', 'hour@2026-12-07', 'live@2026-12-07']);
    expect(s[s.length - 1].who).toBe('Ali');
  });

  it('a short runway keeps only the essentials, and names a holiday on its day', () => {
    expect(promotionSlots('2026-11-28', '2026-11-30').map((x) => x.id)).toEqual(['announce', 'tomorrow', 'noon', 'hour', 'live']);
    expect(promotionSlots('2026-11-28', '2026-11-30').find((x) => x.id === 'noon')!.holiday).toBe('Cyber Monday');
    expect(promotionSlots('2026-11-30', '2026-11-30').map((x) => x.id)).toEqual(['announce', 'noon', 'hour', 'live']);
    expect(() => promotionSlots('2026-12-08', '2026-12-07')).toThrow(RangeError);
  });

  it('a long runway still posts once a day for the last four days, not every day for weeks', () => {
    expect(promotionSlots('2026-11-01', '2026-12-07').filter((x) => /^day/.test(x.id)).map((x) => x.date)).toEqual(['2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05']);
  });

  it('Jackie is due two days after approval, never after the class', () => {
    expect(briefDueOn('2026-12-01', '2026-12-07')).toBe('2026-12-03');
    expect(briefDueOn('2026-12-06', '2026-12-07')).toBe('2026-12-07');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('the copy rules', () => {
  const ids = ['announce', 'day1', 'day2', 'day3', 'day4', 'tomorrow', 'noon', 'hour'];
  it('a complete copy passes', () => expect(briefIssues(sampleCopy(), ids)).toEqual([]));
  it.each<[string, (c: ReturnType<typeof sampleCopy>) => void, RegExp]>([
    ['a missing post', (c) => { c.posts.pop(); }, /posts missing for slots: hour/],
    ['a post for no slot', (c) => { c.posts.push({ slot: 'friday', text: 'x' }); }, /do not exist: friday/],
    ['a statistic on a thumbnail', (c) => { c.thumbnails[1].line = 'Reports fail 40% of the time'; }, /on_screen_stat at thumbnails\[1\]\.line/],
    ['the word free', (c) => { c.posts[0].text = 'Join us, it is free.'; }, /zero_price/],
    ['an em dash', (c) => { c.description[0] = 'Six in the morning — nothing ran.'; }, /dash/],
    ['three thumbnails', (c) => { c.thumbnails.pop(); }, /malformed at thumbnails/],
    ['a long summary', (c) => { c.summary = 'x'.repeat(141); }, /malformed at summary/],
  ])('refuses %s', (_n, breakIt, problem) => { const c = sampleCopy(); breakIt(c); expect(briefIssues(c, ids).join('\n')).toMatch(problem); });
  it('a cut-off answer is reported, not guessed', () => expect(briefIssues(null, ids)).toEqual(['The answer was cut off or was not a JSON object.']));
  it('the prompt lists only Jackie\'s slots, with holidays', () => {
    const p = briefWriterPrompt({ title: 'T', airLabel: 'Mon, Nov 30', week: 3, weekTheme: 'Claude API', spin: null, promise: null, hooks: [], parody: null, slots: promotionSlots('2026-11-28', '2026-11-30') });
    expect(p).toMatch(/- noon \(Mon, Nov 30 · noon, Cyber Monday\)/); expect(p).not.toMatch(/- live /);
  });
});

const FACTS: BriefFacts = {
  title: 'Stop Doing It Nightly', airLabel: 'Mon, Dec 7, 2026', times: classTimes('2026-12-07'), episodeLabel: 'Week 8', zoomLink: 'https://colaberry.zoom.us/j/8563379136',
  nextLabel: 'Monday, December 14', siteUrl: 'https://site.test', slots: promotionSlots('2026-12-01', '2026-12-07'), generatedFor: 'December 7, 2026',
};

describe('the brief', () => {
  const html = renderBrief(sampleCopy(), FACTS);
  it('is byte-identical for the same copy and facts', () => expect(renderBrief(sampleCopy(), FACTS)).toBe(html));
  it('has the facts from code, four thumbnails on the approved photos, and every post', () => {
    expect(html).toContain('6:30 PM CT · 7:30 PM ET · 5:30 PM MT · 4:30 PM PT');
    expect(html).toContain('https://colaberry.zoom.us/j/8563379136');
    expect((html.match(/<div class="th( rec)?">/g) || []).length).toBe(4);
    for (const p of APPROVED_PHOTOS) expect(html).toContain(`https://site.test${p.path}`);
    for (const id of ['announce', 'day1', 'tomorrow', 'noon', 'hour']) expect(html).toContain(`(${id})`);
    expect(html).toContain('Monday, December 14');
  });
  it('escapes what the writer wrote', () => {
    const c = sampleCopy(); c.eventName = '<script>alert(1)</script>';
    const out = renderBrief(c, FACTS);
    expect(out).not.toContain('<script>alert'); expect(out).toContain('&lt;script&gt;');
  });
});

describe('sending to Jackie', () => {
  const deps = (todos: { id: number; title: string; app_url: string; assignees?: { id: number }[] }[] = []): jest.Mocked<SendDeps> => ({
    pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF')), fetchPhoto: jest.fn().mockResolvedValue(Buffer.from('jpg')), listTodos: jest.fn().mockResolvedValue(todos),
    upload: jest.fn().mockImplementation(async (name: string) => `sgid-${name}`), createTodo: jest.fn().mockResolvedValue({ id: 99, title: 't', app_url: 'https://3.basecamp.com/x/todos/99' }),
  });
  const input = { title: todoTitle('Stop Doing It Nightly', 'Mon, Dec 7, 2026'), html: '<html></html>', slug: 'weekly-live-2026-12-07', summary: 'S', dueOn: '2026-12-03', siteUrl: 'https://site.test', approvedBy: 'ali@example.com' };

  it('uploads the PDF, the HTML and the four photos, then creates one to-do for Jackie', async () => {
    const d = deps();
    await expect(sendToJackie(input, d)).resolves.toEqual({ todoId: 99, url: 'https://3.basecamp.com/x/todos/99', adopted: false });
    expect(d.upload.mock.calls.map((c) => c[0])).toEqual(['weekly-live-2026-12-07-event-brief.pdf', 'weekly-live-2026-12-07-event-brief.html', 'ali-photo-1.jpg', 'ali-photo-2.jpg', 'ali-photo-3.jpg', 'ali-photo-4.jpg']);
    const body = d.createTodo.mock.calls[0][0];
    expect(body).toMatchObject({ content: input.title, assignee_ids: [JACKIE_ID], due_on: '2026-12-03' });
    expect((String(body.description).match(/<bc-attachment sgid=/g) || []).length).toBe(6);
    expect(d.fetchPhoto).toHaveBeenCalledWith('https://site.test/weekly-live/ali-photo-1.jpg');
  });

  it('adopts a to-do already in the list instead of making a second one', async () => {
    const d = deps([{ id: 7, title: input.title, app_url: 'https://3.basecamp.com/x/todos/7', assignees: [{ id: JACKIE_ID }] }]);
    await expect(sendToJackie(input, d)).resolves.toEqual({ todoId: 7, url: 'https://3.basecamp.com/x/todos/7', adopted: true });
    expect(d.createTodo).not.toHaveBeenCalled(); expect(d.upload).not.toHaveBeenCalled(); expect(d.pdf).not.toHaveBeenCalled();
  });

  it('a failed upload creates no to-do', async () => {
    const d = deps(); d.upload.mockRejectedValueOnce(Object.assign(new Error('503'), { name: 'UpstreamUnavailable' }));
    await expect(sendToJackie(input, d)).rejects.toThrow('503');
    expect(d.createTodo).not.toHaveBeenCalled();
  });
});
