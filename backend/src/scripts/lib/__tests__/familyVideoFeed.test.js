// Family videos as moving clips (Ali, 2026-11-16, option B): one a day, never repeated, with a
// "Watch the full video" button when a share link exists.
const F = require('../familyPhotoFeed');
const V = require('../familyVideoFeed');
const { renderPhotos, renderThrowbacks, sectionsText } = require('../renderFamilyDashboardSections');

const h = F.helpers;
const item = (id, name, hash) => ({ id, name, file: { hashes: { sha1Hash: hash || `h-${id}` } } });
const fam = (L, ids) => { for (const id of ids) L.labels[id] = { family: true, quality: 3, caption: 'kids playing' }; return L; };
const TODAY = '2026-11-16';
const WINDOW = '2026-11-02';
const kit = { C: { ink: '#111', muted: '#666', navy: '#123', lineSoft: '#eee' }, FONT: 'Arial', esc: (s) => String(s), chip: (t) => `[${t}]`, sectionOpen: (t) => `<section>${t}`, sectionClose: () => '</section>', hTitle: (a, b) => `<h2>${a}</h2><p>${b}</p>` };

describe('clip timing', () => {
  test('starts 30% in and never runs past the end', () => {
    expect(V.clipStart(83000)).toBe(24.9);
    expect(V.clipStart(7000)).toBeLessThanOrEqual(3);
    expect(V.clipStart(4000)).toBe(0);
    expect(V.clipStart(3000)).toBe(0);
    expect(V.clipStart(undefined)).toBe(0);
  });
  test('duration reads as minutes and seconds', () => {
    expect(V.fmtDuration(83000)).toBe('1:23');
    expect(V.fmtDuration(9000)).toBe('0:09');
  });
});

describe('chooseVideo', () => {
  test('a new family video wins over an older one, newest first', () => {
    const items = [item('old', '20251110_100000.mp4'), item('n2', '20261114_173852.mp4'), item('n1', '20261106_180606.mp4')];
    const L = fam(F.emptyLedger(), ['old', 'n1', 'n2']);
    expect(V.chooseVideo(items, L, TODAY, WINDOW, h)).toMatchObject({ section: 'new' });
    expect(V.chooseVideo(items, L, TODAY, WINDOW, h).item.id).toBe('n2');
  });
  test('with no new video, the closest-season older one is a Throw Back', () => {
    const items = [item('june', '20250601_100000.mp4'), item('nov', '20251118_100000.mp4')];
    const L = fam(F.emptyLedger(), ['june', 'nov']);
    expect(V.chooseVideo(items, L, TODAY, WINDOW, h)).toMatchObject({ section: 'throwback', item: { id: 'nov' } });
  });
  test('photos, unlabelled and non-family videos are never picked', () => {
    const items = [item('p', '20261114_173000.jpg'), item('u', '20261114_173852.mp4'), item('x', '20261113_100000.mp4')];
    const L = fam(F.emptyLedger(), ['p']);
    L.labels.x = { family: false, kind: 'screenshot', quality: 4 };
    expect(V.chooseVideo(items, L, TODAY, WINDOW, h)).toBeNull();
  });
  test('a posted video, a copy of it, and another clip from the same moment are never shown again', () => {
    const v = item('v', '20261114_173852.mp4', 'same');
    const L = fam(F.emptyLedger(), ['v', 'copy', 'next']);
    F.markPosted(L, [v], '2026-11-15', 'new');
    const items = [v, item('copy', '20261001_090000.mp4', 'same'), item('next', '20261114_174500.mp4')];
    expect(V.chooseVideo(items, L, TODAY, WINDOW, h)).toBeNull();
  });
  test('a posted photo does not block a video of the same moment (different memories)', () => {
    const photo = item('p', '20261114_173800.jpg');
    const vid = item('v', '20261114_173852.mp4');
    const L = fam(F.emptyLedger(), ['p', 'v']);
    F.markPosted(L, [photo], '2026-11-15', 'new');
    expect(V.chooseVideo([photo, vid], L, TODAY, WINDOW, h).item.id).toBe('v');
    expect(L.posted.p.media).toBe('photo');
  });
  test('a same-day resend reuses today\'s video', () => {
    const a = item('a', '20261106_180606.mp4');
    const b = item('b', '20261106_190000.mp4');
    const L = fam(F.emptyLedger(), ['a', 'b']);
    F.markPosted(L, [b], TODAY, 'new');
    expect(V.chooseVideo([a, b], L, TODAY, WINDOW, h)).toMatchObject({ reused: true, item: { id: 'b' } });
  });
});

describe('rendering', () => {
  const video = (extra) => ({ cid: 'v1', takenAt: '2026-11-14T17:38:52', caption: 'kids playing', duration: '1:23', section: 'new', ...extra });
  test('a new video shows its clip and a Watch button in Family Photos, even with no photos', () => {
    const html = renderPhotos({ photos: [], video: video({ shareUrl: 'https://1drv.ms/v/c/abc' }) }, kit);
    expect(html).toContain('cid:v1');
    expect(html).toContain('Watch the full video');
    expect(html).toContain('https://1drv.ms/v/c/abc');
  });
  test('without a share link the clip still shows, with no button', () => {
    const html = renderPhotos({ photos: [], video: video({ shareUrl: null }) }, kit);
    expect(html).toContain('cid:v1');
    expect(html).not.toContain('Watch the full video');
  });
  test('a throwback video lands in Throw Back Pics with its date', () => {
    const data = { throwbacks: [], video: video({ section: 'throwback', takenAt: '2025-11-18T10:00:00', shareUrl: 'https://1drv.ms/v/c/x' }) };
    expect(renderPhotos(data, kit)).toBe('');
    const html = renderThrowbacks(data, kit);
    expect(html).toContain('Throw Back video');
    expect(html).toContain('November 18, 2025');
    expect(sectionsText(data)).toContain('THROW BACK VIDEO (November 18, 2025, 1:23): https://1drv.ms/v/c/x');
  });
});
