/**
 * Static architecture test (VS1.6, directive section 5): no code outside the sanctioned dispatch files
 * may POST to a voice provider's call-creation endpoint. Everything else must go through the Voice
 * Gateway (triggerVoiceCall today, which routes through the gateway when VOICE_GATEWAY_LEGACY_ENABLED is on).
 *
 * The scan is a pure function over source text, and it fails its own control first: a planted
 * violation must be caught, or a green result here proves nothing.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.resolve(__dirname, '..', '..', '..');

/** The only files allowed to create a call at a provider. */
export const ALLOWED_DISPATCH_FILES = new Set([
  'services/synthflowService.ts',                        // legacy dispatch (flag off) - the facade for every caller
  'services/voice/providers/synthflowLegacyProvider.ts', // legacy dispatch behind the gateway (flag on)
]);

// Call-creation endpoints. GETs to these (status reads, health checks) are not dials.
const ENDPOINT = /api\.synthflow\.ai\/v2\/calls|SYNTHFLOW_CALLS_URL|api\.twilio\.com\/[^'"`]*\/Calls|\.calls\.create\s*\(/;
const POSTISH = /method\s*:\s*['"]POST['"]|axios\.post\s*\(|\.calls\.create\s*\(/;

/** Pure: does this source text create a provider call? Strips comments first so prose cannot match. */
export function createsProviderCall(source: string): boolean {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  return ENDPOINT.test(code) && POSTISH.test(code);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p, out); }
    else if (/\.(ts|js)$/.test(e.name) && !/\.test\.|\.spec\./.test(e.name)) out.push(p);
  }
  return out;
}

describe('no direct provider dispatch outside the gateway path', () => {
  it('control: a planted violation is caught', () => {
    expect(createsProviderCall("await fetch('https://api.synthflow.ai/v2/calls', { method: 'POST', body })")).toBe(true);
    expect(createsProviderCall('await client.calls.create({ to, from, url })')).toBe(true);
    expect(createsProviderCall("fetch('https://api.twilio.com/2010-04-01/Accounts/AC1/Calls.json', { method: 'POST' })")).toBe(true);
  });

  it('control: reads and comments are not dials', () => {
    expect(createsProviderCall("await fetch('https://api.synthflow.ai/v2/calls', { method: 'GET' })")).toBe(false);
    expect(createsProviderCall("// fetch('https://api.synthflow.ai/v2/calls', { method: 'POST' })")).toBe(false);
  });

  it('only the sanctioned files create provider calls anywhere in backend/src', () => {
    const offenders = walk(SRC)
      .map((f) => path.relative(SRC, f).replace(/\\/g, '/'))
      .filter((rel) => createsProviderCall(fs.readFileSync(path.join(SRC, rel), 'utf8')))
      .filter((rel) => !ALLOWED_DISPATCH_FILES.has(rel));
    expect(offenders).toEqual([]);
  });

  it('every sanctioned file still exists (the allowlist cannot silently rot)', () => {
    for (const rel of ALLOWED_DISPATCH_FILES) expect(fs.existsSync(path.join(SRC, rel))).toBe(true);
  });
});
