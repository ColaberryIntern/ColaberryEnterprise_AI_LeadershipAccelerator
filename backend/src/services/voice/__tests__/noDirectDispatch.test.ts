/**
 * Static architecture test (VS1.6, directive section 5: "static architecture test detecting unauthorized
 * imports/direct API calls"). Two rules:
 *
 *  1. NO DIRECT API CALLS: only the sanctioned files may create a call at a provider endpoint.
 *  2. NO PROVIDER IMPORTS: only the Voice Gateway (services/voice/gateway/) may import a provider module
 *     (services/voice/providers/). Anything else must dial through triggerVoiceCall / the gateway, so it
 *     cannot obtain a provider and call .dispatch() around the policy and the reservation.
 *
 * Both scans are pure functions over source text, and each fails its own planted control first.
 * Known limits of a text heuristic (accepted, documented): a URL assembled at runtime from variables
 * or env, or an HTTP method held in a variable, is not detected; rule 2 still forbids the provider
 * import those would most plausibly need.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', '..');
const REPO = path.resolve(SRC, '..', '..');

/** The only files allowed to create a call at a provider (rule 1). Paths relative to backend/src. */
export const ALLOWED_DISPATCH_FILES = new Set([
  'services/synthflowService.ts',                        // legacy dispatch (flag off) - the facade for every caller
  'services/voice/providers/synthflowLegacyProvider.ts', // legacy dispatch behind the gateway (flag on)
]);

// Other voice vendors proposed as Synthflow alternatives (Retell, ElevenLabs, Vapi, Bland): their call-creation endpoints too.
const ENDPOINT = /api\.synthflow\.ai\/v2\/calls|SYNTHFLOW_CALLS_URL|api\.twilio\.com\/[^'"`]*\/Calls|\.calls\s*\.\s*create\s*\(|\bcalls\s*\.\s*create\b|api\.vapi\.ai\/call|api\.retellai\.com\/[^'"`]*create-phone-call|api\.elevenlabs\.io\/[^'"`]*outbound-call|api\.bland\.ai\/[^'"`]*calls/i;
const POSTISH = /method\s*:\s*['"`]post['"`]|axios\s*\.\s*post\s*\(|got\s*\.\s*post\s*\(|\.calls\s*\.\s*create\s*\(|axios\s*\(\s*\{[^}]*method\s*:\s*['"`]post/i;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Rule 1, pure: does this source text create a provider call? */
export function createsProviderCall(source: string): boolean {
  const code = stripComments(source);
  return ENDPOINT.test(code) && POSTISH.test(code);
}

const IMPORT_SPEC = /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)['"`]([^'"`]+)['"`]/g;
const VOICE_PROVIDERS = 'services/voice/providers/';

/**
 * Rule 2, pure: does the file at `rel` (relative to backend/src) import a Voice Studio provider module
 * from outside the gateway? Relative specifiers are RESOLVED against the importing file's folder, so an
 * unrelated `./providers/` folder elsewhere (broadcast, oauth) is not confused with the voice providers.
 */
export function importsProviderIllegally(rel: string, source: string): boolean {
  const p = rel.replace(/\\/g, '/');
  if (p.startsWith('services/voice/gateway/') || p.startsWith(VOICE_PROVIDERS)) return false;
  for (const m of stripComments(source).matchAll(IMPORT_SPEC)) {
    const spec = m[1];
    const target = spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(p), spec)) : spec;
    if (target.startsWith(VOICE_PROVIDERS) || /(^|\/)services\/voice\/providers\//.test(target)) return true;
  }
  return false;
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!['__tests__', 'node_modules', 'artifacts'].includes(e.name)) walk(p, out); }
    else if (/\.(ts|js)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) out.push(p);
  }
  return out;
}

describe('rule 1: no direct provider calls outside the sanctioned files', () => {
  it.each([
    ["await fetch('https://api.synthflow.ai/v2/calls', { method: 'POST', body })"],
    ["await fetch('https://api.synthflow.ai/v2/calls', { method: 'post', body })"],
    ["await fetch(SYNTHFLOW_CALLS_URL, { method: `POST` })"],
    ['await client.calls.create({ to, from, url })'],
    ['await client.calls\n    .create({ to, from, url })'],
    ["fetch('https://api.twilio.com/2010-04-01/Accounts/AC1/Calls.json', { method: 'POST' })"],
    ["await axios.post('https://api.synthflow.ai/v2/calls', body)"],
    ["await axios({ url: 'https://api.synthflow.ai/v2/calls', method: 'post', data })"],
    ["await got.post('https://api.synthflow.ai/v2/calls', { json })"],
    ["await fetch('https://api.vapi.ai/call', { method: 'POST', body })"],
    ["await fetch('https://api.retellai.com/v2/create-phone-call', { method: 'POST', body })"],
    ["await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', { method: 'POST', body })"],
    ["await fetch('https://api.bland.ai/v1/calls', { method: 'POST', body })"],
  ])('control: catches %j', (src) => expect(createsProviderCall(src)).toBe(true));

  it.each([
    ["await fetch('https://api.synthflow.ai/v2/calls', { method: 'GET' })"],
    ["// fetch('https://api.synthflow.ai/v2/calls', { method: 'POST' })"],
    ["/* axios.post('https://api.synthflow.ai/v2/calls') */"],
  ])('control: reads and comments are not dials: %j', (src) => expect(createsProviderCall(src)).toBe(false));

  it('only the sanctioned files create provider calls in backend/src and repo-root scripts', () => {
    const srcOffenders = walk(SRC).map((f) => path.relative(SRC, f).replace(/\\/g, '/'))
      .filter((rel) => createsProviderCall(fs.readFileSync(path.join(SRC, rel), 'utf8')) && !ALLOWED_DISPATCH_FILES.has(rel));
    const scriptOffenders = walk(path.join(REPO, 'scripts')).map((f) => path.relative(REPO, f).replace(/\\/g, '/'))
      .filter((rel) => createsProviderCall(fs.readFileSync(path.join(REPO, rel), 'utf8')));
    expect([...srcOffenders, ...scriptOffenders]).toEqual([]);
  });

  it('every sanctioned file still exists (the allowlist cannot silently rot)', () => {
    for (const rel of ALLOWED_DISPATCH_FILES) expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
  });
});

describe('rule 2: only the gateway may import a provider', () => {
  const imp = "import { createSynthflowLegacyProvider } from '../voice/providers/synthflowLegacyProvider';";
  it.each([
    ['services/mayaTools/voiceTool.ts', imp],
    ['services/foo.ts', "const { createSynthflowLegacyProvider } = require('./voice/providers/synthflowLegacyProvider');"],
    ['services/voice/voiceCallPaths.ts', "const m = await import('./providers/synthflowLegacyProvider');"],
    ['routes/admin/voiceStudioRoutes.ts', "import type { X } from '../../services/voice/providers/twilioCarrier';"],
  ])('control: a planted provider import in %s is flagged', (rel, src) => expect(importsProviderIllegally(rel, src)).toBe(true));

  it('control: the same import inside the gateway (or the providers folder itself) is allowed', () => {
    expect(importsProviderIllegally('services/voice/gateway/legacyFacade.ts', imp)).toBe(false);
    expect(importsProviderIllegally('services/voice/providers/other.ts', "import { x } from './synthflowLegacyProvider';")).toBe(false);
  });

  it('control: an unrelated providers/ folder elsewhere is not the voice providers', () => {
    expect(importsProviderIllegally('services/broadcast/broadcastHealthLoop.ts', "import { x } from './providers/youtube';")).toBe(false);
    expect(importsProviderIllegally('services/marketing/oauth/connectorRegistry.ts', "import { y } from './providers/meta';")).toBe(false);
  });

  it('control: a commented-out import is not flagged', () => {
    expect(importsProviderIllegally('services/foo.ts', `// ${imp}`)).toBe(false);
  });

  it('no file outside the gateway imports a provider', () => {
    const offenders = walk(SRC).map((f) => path.relative(SRC, f).replace(/\\/g, '/'))
      .filter((rel) => importsProviderIllegally(rel, fs.readFileSync(path.join(SRC, rel), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
