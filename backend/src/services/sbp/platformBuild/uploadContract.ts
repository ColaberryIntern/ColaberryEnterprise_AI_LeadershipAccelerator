/**
 * platformBuild/uploadContract - what the build runner may hand back, decided before any write. PURE.
 *
 * The runner is a model with a shell. Whatever it uploads is untrusted until this module says
 * otherwise, and this module is the ONLY place that decides. It answers three questions:
 *
 *   1. Is every path one the platform will serve?   index.html, command-center/**, demo/demo-spec.json
 *   2. Is every file a type nginx will route to us?  .html .css .js .json .md (see prompts.ts)
 *   3. Is it small enough, and is the demo a demo?   size caps, and the demo spec's own contract
 *
 * A refusal lists every problem, not the first, so one failed run says everything that was wrong.
 *
 * The Command Center is REQUIRED (no index.html means nothing to serve). The demo is OPTIONAL:
 * a run that built a good Command Center and a broken demo keeps the Command Center and reports
 * the demo's problems, because throwing away paid-for work to make a point helps nobody.
 */
import { z } from 'zod';
import { validateDemoSpecShape } from '../demoSpec/contract';

/** Under nginx's 1 MB default body size once JSON-escaped; the runner checks the same number. */
export const PLATFORM_BUILD_MAX_CC_BYTES = 700_000;
export const PLATFORM_BUILD_MAX_DEMO_BYTES = 200_000;
export const PLATFORM_BUILD_MAX_FILE_BYTES = 300_000;
export const PLATFORM_BUILD_MAX_FILES = 80;

export const CC_ENTRY_PATH = 'index.html';
export const CC_DIR = 'command-center/';
export const DEMO_SPEC_UPLOAD_PATH = 'demo/demo-spec.json';

const ALLOWED_EXTENSIONS = /\.(html|css|js|json|md)$/;
/** Lowercase letters, digits, dot, dash, underscore and forward slash. Nothing that needs decoding. */
const SAFE_PATH = /^[a-z0-9._\-/]+$/;

export const UploadBodySchema = z.object({
  files: z.record(z.string(), z.string()),
  cost_usd: z.number().nonnegative().max(1000).optional(),
}).strict();

export type UploadBody = z.infer<typeof UploadBodySchema>;

export interface UploadProblem {
  path: string | null;
  problem: string;
}

export interface AcceptedUpload {
  commandCenter: Record<string, string>;
  commandCenterBytes: number;
  demoSpec: unknown | null;
  demoBytes: number;
  /** Problems with the optional demo. The Command Center is still accepted. */
  demoProblems: UploadProblem[];
}

export type UploadVerdict =
  | { ok: true; accepted: AcceptedUpload }
  | { ok: false; problems: UploadProblem[] };

const byteLength = (s: string): number => Buffer.byteLength(s, 'utf8');

/** A path the platform may store and serve. Exported for the serve map and the runner test. */
export function isServablePath(path: string): boolean {
  if (!path || path.length > 200) return false;
  if (!SAFE_PATH.test(path)) return false;
  if (path.startsWith('/') || path.includes('//')) return false;
  if (path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || seg.startsWith('.'))) return false;
  return ALLOWED_EXTENSIONS.test(path);
}

const isCommandCenterPath = (p: string): boolean => p === CC_ENTRY_PATH || p.startsWith(CC_DIR);

export function checkUpload(body: unknown): UploadVerdict {
  const parsed = UploadBodySchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, problems: [{ path: null, problem: 'body must be { files: { [path]: string }, cost_usd? }' }] };
  }
  const entries = Object.entries(parsed.data.files);
  const problems: UploadProblem[] = [];
  if (entries.length === 0) problems.push({ path: null, problem: 'no files uploaded' });
  if (entries.length > PLATFORM_BUILD_MAX_FILES) {
    problems.push({ path: null, problem: `more than ${PLATFORM_BUILD_MAX_FILES} files` });
  }

  const commandCenter: Record<string, string> = {};
  let commandCenterBytes = 0;
  let demoRaw: string | null = null;

  for (const [path, content] of entries) {
    if (!isServablePath(path)) {
      problems.push({ path, problem: 'not a path the platform serves (allowed: index.html, command-center/**, demo/demo-spec.json; .html .css .js .json .md)' });
      continue;
    }
    const size = byteLength(content);
    if (size > PLATFORM_BUILD_MAX_FILE_BYTES) {
      problems.push({ path, problem: `file is ${size} bytes; the limit is ${PLATFORM_BUILD_MAX_FILE_BYTES}` });
      continue;
    }
    if (path === DEMO_SPEC_UPLOAD_PATH) { demoRaw = content; continue; }
    if (!isCommandCenterPath(path)) {
      problems.push({ path, problem: 'outside index.html, command-center/ and demo/demo-spec.json' });
      continue;
    }
    commandCenter[path] = content;
    commandCenterBytes += size;
  }

  if (!commandCenter[CC_ENTRY_PATH]) problems.push({ path: CC_ENTRY_PATH, problem: 'the Command Center entry point is missing' });
  if (commandCenterBytes > PLATFORM_BUILD_MAX_CC_BYTES) {
    problems.push({ path: CC_DIR, problem: `Command Center is ${commandCenterBytes} bytes; the limit is ${PLATFORM_BUILD_MAX_CC_BYTES}` });
  }
  if (problems.length) return { ok: false, problems };

  // The demo: optional, and judged on its own.
  const demoProblems: UploadProblem[] = [];
  let demoSpec: unknown | null = null;
  const demoBytes = demoRaw === null ? 0 : byteLength(demoRaw);
  if (demoRaw === null) {
    demoProblems.push({ path: DEMO_SPEC_UPLOAD_PATH, problem: 'no demo spec was uploaded' });
  } else if (demoBytes > PLATFORM_BUILD_MAX_DEMO_BYTES) {
    demoProblems.push({ path: DEMO_SPEC_UPLOAD_PATH, problem: `demo spec is ${demoBytes} bytes; the limit is ${PLATFORM_BUILD_MAX_DEMO_BYTES}` });
  } else {
    try {
      const candidate = JSON.parse(demoRaw);
      const shape = validateDemoSpecShape(candidate);
      if (shape.length) {
        for (const p of shape.slice(0, 20)) demoProblems.push({ path: DEMO_SPEC_UPLOAD_PATH, problem: `${p.path}: ${p.message}` });
      } else {
        demoSpec = candidate;
      }
    } catch {
      demoProblems.push({ path: DEMO_SPEC_UPLOAD_PATH, problem: 'demo spec is not valid JSON' });
    }
  }

  return { ok: true, accepted: { commandCenter, commandCenterBytes, demoSpec, demoBytes, demoProblems } };
}
