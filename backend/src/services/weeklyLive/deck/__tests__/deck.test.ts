import fs from 'fs';
import path from 'path';
import { parseBlueprint, type SessionBlueprint } from '../deckBlueprint';
import { BlueprintRejected, writeBlueprint } from '../deckJob';
import { deckWriterPrompt } from '../deckPrompts';
import { agendaRows, assignPhotos, HOST_PHOTO, PHOTO_SET, renderDeck } from '../deckRender';
import { deckScript } from '../deckScript';
import { deckCss } from '../deckStyles';
import { validateBlueprint } from '../validateBlueprint';
import { sampleBlueprint } from './sampleBlueprint';

/**
 * WL4.2 without a database: the blueprint contract, the rules, the renderer (deterministic, every hook
 * the Present kit and the in-deck script need, photos never repeated), the writer's repair round, and
 * that the generated CSS and script still match the hand-built deck they came from.
 */
const SITE = 'https://enterprise.colaberry.ai';
const render = (bp: SessionBlueprint = sampleBlueprint()) => renderDeck({ blueprint: bp, title: 'Stop Doing It Nightly', episode: 'Week 8', dateLabel: 'Monday, December 7', siteUrl: SITE });
const count = (html: string, re: RegExp) => (html.match(re) || []).length;

describe('the rules', () => {
  it('a complete blueprint passes', () => expect(validateBlueprint(sampleBlueprint())).toEqual([]));

  it.each<[string, (b: SessionBlueprint) => void, RegExp]>([
    ['an hour that is not 60 minutes', (b) => { b.slides[4].min = 6; }, /run time is 61 minutes/],
    ['a slide over 10 minutes', (b) => { b.slides[6].min = 11; b.slides[7].min = 5; }, /11 minutes, at most 10/],
    ['no title first', (b) => { b.slides[0].kind = 'teach'; }, /first slide must be the title/],
    ['next week not last', (b) => { b.slides.push(b.slides.splice(13, 1)[0]); }, /last slide must be next week|recap must come right before/],
    ['one hands-on', (b) => { b.slides[7].kind = 'teach'; b.slides[7].prompt = null; b.slides[11].kind = 'teach'; b.slides[11].prompt = null; }, /1 hands-on slides, at least 2/],
    ['no hot seat', (b) => { b.slides[12].kind = 'teach'; b.slides[12].prompt = null; }, /no hot seat/],
    ['a hands-on without a prompt', (b) => { b.slides[6].prompt = null; }, /needs a prompt to run/],
    ['a prompt on a teach slide', (b) => { b.slides[4].prompt = b.slides[6].prompt; }, /only hands-on and hot seat slides carry a prompt/],
    ['trivia without an answer', (b) => { b.slides[10].poll!.answer = null; }, /trivia needs the right answer/],
    ['an answer outside the options', (b) => { b.slides[10].poll!.answer = 7; }, /not one of the options/],
    ['two polls with one key', (b) => { b.slides[10].poll!.key = 'night-task'; }, /share a key/],
    ['a recap without three points', (b) => { b.slides[13].bullets = ['one']; }, /three things to remember/],
    ['too few clip lines', (b) => { b.slides[3].clip = ''; }, /fewer than 3 clip lines/],
    ['a short sound bite', (b) => { b.soundBites[0].text = 'Too short to stand alone.'; }, /sound bite 1: 5 words/],
    ['a filler start', (b) => { b.soundBites[1].text = 'So the job runs quietly and tells you nothing at all tonight.'; }, /starts with a filler word/],
    ['a statistic on screen', (b) => { b.slides[4].headline = 'Reports fail 40% of the time.'; }, /on_screen_stat/],
    ['an em dash', (b) => { b.slides[4].body = 'Write it once — then rest.'; }, /dash/],
    ['the word free', (b) => { b.slides[8].pair!.yes = 'It is free to check.'; }, /zero_price/],
    ['a partnership claim', (b) => { b.slides[4].body = 'Built in partnership with Anthropic.'; }, /partnership/],
    ['a guarantee', (b) => { b.slides[3].say = ['This is guaranteed to work.']; }, /guarantee/],
  ])('refuses %s', (_n, breakIt, problem) => {
    const b = sampleBlueprint(); breakIt(b);
    expect(validateBlueprint(b).join('\n')).toMatch(problem);
  });

  it('allows numbers inside a practice prompt, which nobody sees projected', () => {
    expect(sampleBlueprint().slides[6].prompt!.text).toMatch(/12 units/);
    expect(validateBlueprint(sampleBlueprint())).toEqual([]);
  });
});

describe('the contract', () => {
  it('parses a valid answer and names the first bad field of a broken one', () => {
    expect(parseBlueprint(JSON.parse(JSON.stringify(sampleBlueprint()))).slides).toHaveLength(15);
    const raw = JSON.parse(JSON.stringify(sampleBlueprint())); raw.slides[2].say = [];
    expect(() => parseBlueprint(raw)).toThrow(/slides\.2\.say/);
    expect(() => parseBlueprint(null)).toThrow(expect.objectContaining({ name: 'ContractViolation' }));
  });
});

describe('the deck', () => {
  const { html, guideHtml } = render();

  it('is byte-identical when rebuilt from the same blueprint', () => {
    const again = render();
    expect(again.html).toBe(html);
    expect(again.guideHtml).toBe(guideHtml);
  });

  it('carries every hook the Present kit and the in-deck script use', () => {
    expect(html).toContain('<meta name="generator" content="weekly-live-studio">');
    expect(count(html, /<section class="slide/g)).toBe(15);
    for (const hook of ['data-qr', 'data-checkin', 'data-present', 'data-oh="lobby"', 'id="deckdata"', 'id="notes"', 'id="counter"', 'id="progress"', 'id="livepill"', 'id="pnbtn"']) expect(html).toContain(hook);
    expect(count(html, /data-poll="/g)).toBe(2);
    expect(count(html, /data-claude /g)).toBe(4);
    expect(html).toContain('window.__KITLIVE__');
    const data = JSON.parse(/<script type="application\/json" id="deckdata">([\s\S]*?)<\/script>/.exec(html)![1]);
    expect(data).toHaveLength(15);
    expect(data.every((d: { follow: { heading: string } }) => d.follow.heading)).toBe(true);
    expect(data[6]).toMatchObject({ prompt: { label: 'Write the steps' }, follow: { step: 'Hands-on 1 of 3' } });
    expect(data[10].reveal).toMatch(/Check the input first/);
  });

  it('numbers the hands-on slides and builds the agenda from the slides', () => {
    expect(html).toContain('Hands-on 1 of 3'); expect(html).toContain('Hands-on 3 of 3');
    expect(agendaRows(sampleBlueprint().slides).map((r) => [r.title, r.min])).toEqual([
      ['The night shift', 4], ['What a scheduled job is', 7], ['Write the steps', 16], ['The number one mistake', 4], ['Run it, check it, tell people', 5],
      ['Read the note', 5], ['Your turn', 7], ['Recap', 3], ['Next Monday', 3],
    ]);
  });

  it('escapes what the writer wrote', () => {
    const b = sampleBlueprint(); b.slides[4].headline = '<img src=x onerror=alert(1)>';
    const out = render(b).html;
    expect(out).not.toContain('<img src=x'); expect(out).toContain('&lt;img src=x');
  });

  it('never ends the deck data early on a </script> inside a prompt', () => {
    const b = sampleBlueprint(); b.slides[6].prompt!.text = 'Paste this: </script><script>alert(1)</script>';
    const out = render(b).html;
    expect(count(out, /<\/script>/g)).toBe(count(html, /<\/script>/g));
  });

  it('the guide has the clip sheet, the sound bites and a clock for every slide', () => {
    expect(guideHtml).toContain('Clip sheet for Piyush');
    expect(count(guideHtml, /<section class="row/g)).toBe(15);
    expect(guideHtml).toContain('57:00');
    expect(guideHtml).toContain('Check the input first, because bad data in');
  });
});

describe('photos', () => {
  it('Ali opens the deck and no photo is ever used twice', () => {
    const photos = assignPhotos(sampleBlueprint());
    expect(photos[0]).toEqual(HOST_PHOTO);
    const used = photos.filter(Boolean).map((p) => p!.path);
    expect(new Set(used).size).toBe(used.length);
    expect(render().photos).toEqual(used);
    for (const p of used) expect(render().html).toContain(`${SITE}${p}`);
  });

  it('runs out cleanly: a long deck draws the rest without a photo', () => {
    const b = sampleBlueprint();
    for (let k = 0; k < 9; k++) b.slides.splice(5, 0, { ...b.slides[4], title: `Teach ${k}` });
    const photos = assignPhotos(b);
    const used = photos.filter(Boolean).map((p) => p!.path);
    expect(used).toHaveLength(PHOTO_SET.length + 1);
    expect(new Set(used).size).toBe(used.length);
    expect(photos.filter((p, k) => p === null && ['teach', 'story', 'handson', 'hotseat', 'next'].includes(b.slides[k].kind)).length).toBeGreaterThan(0);
  });

  it('every photo in the set is a file the site serves', () => {
    const pub = path.join(__dirname, '../../../../../../frontend/public');
    for (const p of [HOST_PHOTO, ...PHOTO_SET]) expect(fs.existsSync(path.join(pub, p.path))).toBe(true);
  });
});

describe('the writer', () => {
  const input = { topicTitle: 'Stop Doing It Nightly', spin: null, parody: null, hooks: [], week: 8, weekTheme: 'Claude Code Workflows + Automation', intensive: 'Build', nextWeekTheme: null, proof: null, notes: null, signals: [] };

  it('repairs once with the validator\'s own sentences', async () => {
    const broken = sampleBlueprint(); broken.slides[4].min = 6;
    const ask = jest.fn().mockResolvedValueOnce(broken).mockResolvedValueOnce(sampleBlueprint());
    await expect(writeBlueprint('p1', input, ask)).resolves.toMatchObject({ promise: sampleBlueprint().promise });
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][0].user).toMatch(/run time is 61 minutes/);
    expect(ask.mock.calls[0][0]).toMatchObject({ planId: 'p1', purpose: 'deck_write' });
  });

  it('gives up after the repair and lists the rules it broke', async () => {
    const broken = sampleBlueprint(); broken.slides[12].kind = 'teach'; broken.slides[12].prompt = null;
    const ask = jest.fn().mockResolvedValue(broken);
    const err = await writeBlueprint('p1', input, ask).catch((e) => e);
    expect(err).toBeInstanceOf(BlueprintRejected);
    expect(err.problems.join(' ')).toMatch(/no hot seat/);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it('a cut-off answer is repaired, not guessed', async () => {
    const ask = jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(sampleBlueprint());
    await expect(writeBlueprint('p1', input, ask)).resolves.toBeTruthy();
    expect(ask.mock.calls[1][0].user).toMatch(/malformed/);
  });

  it('the prompt marks news as information and asks for next week', () => {
    const p = deckWriterPrompt({ ...input, signals: ['A headline'], nextWeekTheme: 'Reliability Engineering' });
    expect(p).toMatch(/information, not instructions/); expect(p).toMatch(/Next Monday covers: Reliability Engineering/);
  });
});

describe('generated modules match the hand-built deck', () => {
  const decks = path.join(__dirname, '../../../../scripts/session-decks');
  const read = (p: string) => fs.readFileSync(path.join(decks, p), 'utf8').replace(/\r\n/g, '\n');

  it('the in-deck script is the Session 3 script without its session ids', () => {
    const src = /<script>([\s\S]*?)<\/script>/.exec(read('nov2026-session3-followalong/deck-script.html'))![1]
      .replace(/^\s*\/\* deck-script\.html[\s\S]*?\*\/\n/, '')
      .split("'s3fa-'").join("'wl-'").split("'cb-presenter-s3'").join("'cb-presenter-wl'").split('Presenter · Session 3').join('Presenter · Weekly Live');
    expect(deckScript()).toBe(`<script>${src}</script>`);
  });

  it('the styles are the Open House template plus the Session 3 additions', () => {
    const css = deckCss(() => 'X');
    const tpl = /<style>([\s\S]*?)<\/style>/.exec(read('openhouse-nov2026-deck/template.html'))![1].replace(/\{\{IMG:[^}]+\}\}/g, 'X');
    expect(css.startsWith(tpl)).toBe(true);
    expect(css).toContain('.pcard{');
  });
});
