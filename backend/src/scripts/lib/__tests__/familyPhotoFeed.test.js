// The "never post a picture twice" rules of the Family Dashboard photo feed (Ali, 2026-11-13:
// "It's a one time thing per picture. No repeats or duplicates.").
const fs = require('fs');
const os = require('os');
const path = require('path');
const F = require('../familyPhotoFeed');

const item = (id, name, hash) => ({ id, name, file: { hashes: { sha1Hash: hash || `h-${id}` } } });
const fam = (ledger, ids, quality = 3) => { for (const id of ids) ledger.labels[id] = { family: true, quality, caption: 'kids at a game' }; return ledger; };
const TODAY = '2026-11-13';

describe('takenAt', () => {
  test('reads local capture time from the phone file name, not the mislabelled UTC field', () => {
    expect(F.takenAt({ name: '20261106_182436.jpg', photo: { takenDateTime: '2026-11-07T00:24:36Z' } })).toBe('2026-11-06T18:24:36');
  });
  test('falls back to the Graph field when the name has no timestamp', () => {
    expect(F.takenAt({ name: 'IMG_1.jpg', photo: { takenDateTime: '2026-11-06T10:00:00Z' } })).toBe('2026-11-06T10:00:00');
  });
});

describe('choosePicks', () => {
  test('a burst of near-identical shots yields exactly one photo, the best rated', () => {
    const items = ['182436', '182438', '182440'].map((t, i) => item(`b${i}`, `20261106_${t}.jpg`));
    const L = fam(F.emptyLedger(), ['b0', 'b2']);
    L.labels.b1 = { family: true, quality: 5 };
    const { picks } = F.choosePicks(items, L, TODAY);
    expect(picks.map((p) => p.id)).toEqual(['b1']);
  });

  test('receipts and other non-family photos are never picked', () => {
    const items = [item('r', '20261106_103530.jpg'), item('k', '20261107_130329.jpg')];
    const L = fam(F.emptyLedger(), ['k']);
    L.labels.r = { family: false, kind: 'document', quality: 5 };
    expect(F.choosePicks(items, L, TODAY).picks.map((p) => p.id)).toEqual(['k']);
  });

  test('unlabelled photos wait for a label instead of being guessed', () => {
    expect(F.choosePicks([item('u', '20261107_130329.jpg')], F.emptyLedger(), TODAY).picks).toEqual([]);
  });

  test('a photo posted on an earlier day is never picked again', () => {
    const p = item('k', '20261107_130329.jpg');
    const L = F.markPosted(fam(F.emptyLedger(), ['k']), [p], '2026-11-12');
    expect(F.choosePicks([p], L, TODAY).picks).toEqual([]);
  });

  test('a copy of a posted photo under another name is refused (same content hash)', () => {
    const L = F.markPosted(fam(F.emptyLedger(), ['a', 'copy']), [item('a', '20261101_090000.jpg', 'SAME')], '2026-11-02');
    expect(F.choosePicks([item('copy', '20261105_120000.jpg', 'SAME')], L, TODAY).picks).toEqual([]);
  });

  test('a late-syncing shot from an already-posted moment is refused', () => {
    const L = F.markPosted(fam(F.emptyLedger(), ['a', 'late']), [item('a', '20261107_130329.jpg')], '2026-11-12');
    expect(F.choosePicks([item('late', '20261107_130409.jpg')], L, TODAY).picks).toEqual([]);
  });

  test('a same-day re-run returns the same photos rather than burning new ones', () => {
    const a = item('a', '20261107_130329.jpg');
    const b = item('b', '20261111_182429.jpg');
    const L = F.markPosted(fam(F.emptyLedger(), ['a', 'b']), [a], TODAY);
    const r = F.choosePicks([a, b], L, TODAY);
    expect(r.reused).toBe(true);
    expect(r.picks.map((p) => p.id)).toEqual(['a']);
  });

  test('old backlog photos (before the feed start or outside the window) are never posted', () => {
    const items = [item('sept', '20260921_130604.jpg'), item('oct', '20261025_100000.jpg')];
    expect(F.choosePicks(items, fam(F.emptyLedger(), ['sept', 'oct']), TODAY).picks).toEqual([]);
  });

  test('videos are skipped', () => {
    expect(F.choosePicks([item('v', '20261106_180606.mp4')], fam(F.emptyLedger(), ['v']), TODAY).picks).toEqual([]);
  });

  test('caps the day at MAX_PER_DAY moments, oldest first, so the rest carry to tomorrow', () => {
    const items = Array.from({ length: 9 }, (_, i) => item(`m${i}`, `202611${String(4 + i).padStart(2, '0')}_120000.jpg`));
    const { picks } = F.choosePicks(items, fam(F.emptyLedger(), items.map((i) => i.id)), TODAY);
    expect(picks).toHaveLength(F.MAX_PER_DAY);
    expect(picks[0].id).toBe('m0');
  });

  test('two identical files in the same run are shown once', () => {
    const items = [item('x', '20261108_100000.jpg', 'DUP'), item('y', '20261110_100000.jpg', 'DUP')];
    expect(F.choosePicks(items, fam(F.emptyLedger(), ['x', 'y']), TODAY).picks).toHaveLength(1);
  });
});

describe('ledger file', () => {
  test('round-trips and a missing file starts empty', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'sub', 'l.json');
    expect(F.loadLedger(file).posted).toEqual({});
    F.saveLedger(F.markPosted(F.emptyLedger(), [item('a', '20261107_130329.jpg')], TODAY), file);
    expect(F.loadLedger(file).posted.a.postedOn).toBe(TODAY);
  });
  test('a corrupt ledger throws instead of silently allowing repeats', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'l.json');
    fs.writeFileSync(file, '{not json');
    expect(() => F.loadLedger(file)).toThrow();
  });
});
