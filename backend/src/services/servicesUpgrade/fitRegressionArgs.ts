/**
 * SV2.3 - pure argument parsing and output-path guard for compareCapabilityFitBaseline. Runs before any DB module is
 * imported, so `--help` and a bad argument have no side effects.
 *
 * OUT_DIR must be OUTSIDE the current working directory: the report holds pursuit titles and Gov AI verdicts, which
 * must never land in the repo (the repository is public). In the backend container cwd is /app and the default
 * OUT_DIR is /tmp/svc-regression.
 */
import path from 'path';

export const REGRESSION_USAGE =
  'Usage: node dist/scripts/compareCapabilityFitBaseline.js --baseline-fit <capability_fit_fresh_*.json> --baseline-catalog <catalog_*.json> [--help]\n' +
  '  env OUT_DIR (default /tmp/svc-regression, must be outside the working directory), RUNS (default 3, 1..5),\n' +
  '      REPORT_DATE (default today, YYYY-MM-DD).\n' +
  '  Re-runs the SV2 capability fit (no business data written; each LLM call writes its usual ai_events telemetry row) RUNS times per baseline pursuit, applies the proof rules with the\n' +
  '  downgrade flag OFF and ON from the same calls, and writes capability_fit_regression_<date>.json + .summary.txt.';

export class RegressionArgsError extends Error {
  constructor(message: string) { super(message); this.name = 'RegressionArgsError'; }
}

/** A run-time refusal (no container, wrong tenant, nothing succeeded), so the failure log never says plain 'Error'. */
export class RegressionRunError extends Error {
  constructor(message: string) { super(message); this.name = 'RegressionRunError'; }
}

export interface RegressionArgs {
  help: boolean;
  baselineFit: string;
  baselineCatalog: string;
  outDir: string;
  runs: number;
  reportDate: string;
}

const valueAfter = (argv: string[], flag: string): string | null => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

/** True when `child` is `parent` or inside it (case-insensitive on Windows paths). */
export function isInside(child: string, parent: string): boolean {
  const norm = (p: string): string => { const r = path.resolve(p); return process.platform === 'win32' ? r.toLowerCase() : r; };
  const rel = path.relative(norm(parent), norm(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function parseRegressionArgs(argv: string[], env: Record<string, string | undefined>, cwd: string, today: string): RegressionArgs {
  const help = argv.includes('--help') || argv.includes('-h');
  if (help) return { help, baselineFit: '', baselineCatalog: '', outDir: '', runs: 0, reportDate: today };
  const baselineFit = valueAfter(argv, '--baseline-fit');
  const baselineCatalog = valueAfter(argv, '--baseline-catalog');
  if (!baselineFit || !baselineCatalog) throw new RegressionArgsError('Both --baseline-fit and --baseline-catalog are required.');
  const runs = env.RUNS === undefined || env.RUNS === '' ? 3 : Number(env.RUNS);
  if (!Number.isInteger(runs) || runs < 1 || runs > 5) throw new RegressionArgsError('RUNS must be an integer from 1 to 5.');
  const reportDate = env.REPORT_DATE || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate)) throw new RegressionArgsError('REPORT_DATE must be YYYY-MM-DD.');
  const outDir = path.resolve(env.OUT_DIR || '/tmp/svc-regression');
  if (isInside(outDir, cwd)) throw new RegressionArgsError(`OUT_DIR must be outside the working directory (${cwd}); the report must never land in the repo.`);
  return { help, baselineFit, baselineCatalog, outDir, runs, reportDate };
}
