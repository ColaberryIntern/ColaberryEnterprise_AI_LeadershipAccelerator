/**
 * The scanner, and the guard that keeps its committed output honest.
 *
 * The drift test is the important one. The scan is a file in the repository, and a file in
 * the repository goes stale the moment someone adds a timer and does not regenerate it. A
 * stale scan does not fail loudly — it quietly stops reporting the newest untracked timer,
 * which is precisely the one most likely to be wrong.
 */
import fs from 'fs';
import path from 'path';
import { scanSource, scanTimers } from '../scanTimers';
import { render } from '../../../scripts/scanUntrackedTimers';
import { TIMER_SCAN } from '../../../data/platformOperations/timerScan';

const BACKEND_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');
const SOURCE_ROOT = path.join(BACKEND_ROOT, 'src');
const OUT_FILE = path.join(SOURCE_ROOT, 'data', 'platformOperations', 'timerScan.ts');

describe('scanSource', () => {
  it('finds a bare cron.schedule and reports that it names nothing', () => {
    const sites = scanSource('x.ts', "cron.schedule('*/5 * * * *', async () => { await doIt(); });");
    expect(sites).toEqual([
      { file: 'x.ts', line: 1, kind: 'cron', schedule: '*/5 * * * *', reportsAs: null },
    ]);
  });

  it('attributes a cron that instruments itself', () => {
    const sites = scanSource('x.ts',
      "cron.schedule('0 2 * * *', () => instrumentCronJob('Schema drift detection', run));");
    expect(sites[0]).toMatchObject({ kind: 'cron', reportsAs: 'Schema drift detection' });
  });

  it('reads a setInterval delay from the second argument', () => {
    const sites = scanSource('x.ts', 'setInterval(tick, 60000);');
    expect(sites[0]).toMatchObject({ kind: 'interval', schedule: '60000 ms' });
  });

  it('refuses to guess a computed schedule', () => {
    const sites = scanSource('x.ts', 'cron.schedule(EVERY_FIVE, run);');
    expect(sites[0].schedule).toBeNull();
  });

  /**
   * Both of these were real false findings from earlier versions of this scanner: first a
   * regex scan matched its own prose, then a comment-blanking pass was defeated by a quote
   * inside a regex literal. A scanner that miscounts its own source cannot be trusted to
   * count the server's, so the cases stay as tests.
   */
  it('ignores a timer written in a comment', () => {
    expect(scanSource('x.ts', "// we call setInterval(fn, 1000) here one day\nconst a = 1;")).toEqual([]);
    expect(scanSource('x.ts', "/* cron.schedule('* * * * *', fn) */\nconst a = 1;")).toEqual([]);
  });

  it('ignores a timer written inside a string or a regex literal', () => {
    expect(scanSource('x.ts', "const s = \"cron.schedule('* * * * *', fn)\";")).toEqual([]);
    expect(scanSource('x.ts', "const re = /setInterval\\s*\\(/g;\nconst q = /(['\"])/;")).toEqual([]);
  });

  it('does not treat an unrelated .schedule() as a cron', () => {
    expect(scanSource('x.ts', 'queue.schedule(job);')).toEqual([]);
  });
});

describe('the committed scan', () => {
  it('describes the source as it stands right now', () => {
    // Line endings are normalized on both sides. The repo has no `text=auto` rule for this
    // path, so on Windows `core.autocrlf` hands back CRLF while the generator writes LF: a
    // byte comparison failed on a developer machine and passed in CI, which is the worst
    // way for a guard to behave. What this test is actually for is a timer that was added
    // and not rescanned, and that survives normalization.
    const norm = (t: string) => t.split('\r\n').join('\n');
    const fresh = norm(render(scanTimers(SOURCE_ROOT, REPO_ROOT)));
    const committed = norm(fs.readFileSync(OUT_FILE, 'utf8'));
    expect(committed).toBe(fresh);
    // The message a person needs when this fails, since a 900-line diff does not say it:
    //   npx ts-node backend/src/scripts/scanUntrackedTimers.ts
  });

  it('is sorted and free of duplicates, so a diff reads as a real change', () => {
    const keys = TIMER_SCAN.sites.map((s) => `${s.file}:${String(s.line).padStart(6, '0')}`);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not report the scanner itself as a timer', () => {
    const own = TIMER_SCAN.sites.filter((s) => s.file.includes('services/platformOperations/'));
    expect(own).toEqual([]);
  });

  it('still finds timers that report under no name, which is the point of the panel', () => {
    expect(TIMER_SCAN.sites.filter((s) => !s.reportsAs).length).toBeGreaterThan(0);
  });
});
