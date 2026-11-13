import fs from 'fs';
import os from 'os';
import path from 'path';
import { isInside, parseRegressionArgs, RegressionArgsError } from '../fitRegressionArgs';

const CWD = path.resolve(os.tmpdir(), 'repo-root-sim');
const OUTSIDE = path.resolve(os.tmpdir(), 'svc-regression-out');
const argv = ['--baseline-fit', 'fit.json', '--baseline-catalog', 'cat.json'];

describe('parseRegressionArgs', () => {
  it('--help needs nothing else and has no side effects', () => {
    expect(parseRegressionArgs(['--help'], {}, CWD, '2026-11-13').help).toBe(true);
  });

  it('defaults: 3 runs, today, /tmp/svc-regression', () => {
    const a = parseRegressionArgs(argv, {}, CWD, '2026-11-13');
    expect(a).toMatchObject({ baselineFit: 'fit.json', baselineCatalog: 'cat.json', runs: 3, reportDate: '2026-11-13', outDir: path.resolve('/tmp/svc-regression') });
  });

  it('reads OUT_DIR, RUNS and REPORT_DATE from the environment', () => {
    expect(parseRegressionArgs(argv, { OUT_DIR: OUTSIDE, RUNS: '5', REPORT_DATE: '2026-12-04' }, CWD, '2026-11-13'))
      .toMatchObject({ outDir: OUTSIDE, runs: 5, reportDate: '2026-12-04' });
  });

  it('refuses missing baseline files, bad RUNS and a bad date', () => {
    expect(() => parseRegressionArgs(['--baseline-fit', 'f.json'], {}, CWD, '2026-11-13')).toThrow(RegressionArgsError);
    expect(() => parseRegressionArgs(['--baseline-fit', '--baseline-catalog', 'c.json'], {}, CWD, '2026-11-13')).toThrow(RegressionArgsError);
    for (const RUNS of ['0', '6', '2.5', 'three']) expect(() => parseRegressionArgs(argv, { RUNS }, CWD, '2026-11-13')).toThrow(/RUNS/);
    expect(() => parseRegressionArgs(argv, { REPORT_DATE: '13/11/2026' }, CWD, '2026-11-13')).toThrow(/REPORT_DATE/);
  });

  it('refuses an OUT_DIR inside the working directory (the repo), including the directory itself', () => {
    expect(() => parseRegressionArgs(argv, { OUT_DIR: path.join(CWD, 'docs', 'out') }, CWD, '2026-11-13')).toThrow(/outside the working directory/);
    expect(() => parseRegressionArgs(argv, { OUT_DIR: CWD }, CWD, '2026-11-13')).toThrow(/outside the working directory/);
    expect(() => parseRegressionArgs(argv, { OUT_DIR: 'relative-out' }, process.cwd(), '2026-11-13')).toThrow(/outside the working directory/);
  });

  it('isInside does not confuse a sibling with a common prefix', () => {
    expect(isInside(`${CWD}-other`, CWD)).toBe(false);
    expect(isInside(path.join(CWD, 'a'), CWD)).toBe(true);
  });
});

describe('compareCapabilityFitBaseline script (source guards)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'scripts', 'compareCapabilityFitBaseline.ts'), 'utf8');
  it('flushes telemetry before closing the pool, and never calls a bare close', () => {
    expect(src).toMatch(/flushThenClose\(\(\) => sequelize\.close\(\)\)/);
    expect(src.replace(/flushThenClose\(\(\) => sequelize\.close\(\)\)/, '')).not.toMatch(/sequelize\.close\(\)/);
  });
  it('writes only under args.outDir and only through the shared Fit wrapper (no DB writes, no direct model calls)', () => {
    const writes = src.match(/writeFileSync\(([^,]+),/g) ?? [];
    expect(writes.length).toBe(2);
    expect(src).toMatch(/path\.join\(args\.outDir, `capability_fit_regression_/);
    expect(src).not.toMatch(/\.(create|update|destroy|upsert|bulkCreate)\(/);
    expect(src).not.toMatch(/getInstrumentedOpenAI|chat\.completions/);
    expect(src).toContain('assessCapabilityFitWithProof');
  });
});
