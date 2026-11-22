/**
 * The public demo must be served under a policy that ALLOWS the page it sends.
 *
 * The defect these tests exist for: the engine ships its JavaScript inline, Helmet sends
 * `script-src 'self'`, an inline script is not `'self'`, and so the deployed demo answered 200
 * with correct bytes and rendered a banner above a permanent "Loading the demo...". Every test
 * that existed asserted on the HTML, and the HTML was right. What was wrong was the relationship
 * between the headers and the body, so that relationship is what is asserted here.
 */
import {
  renderConnectedDemo,
  withScriptNonce,
  DEMO_SPEC_SLOT,
  DemoRenderError,
} from '../demoRender';
import { demoKitFiles } from '../demoKit';
import { DEMO_KIT_ENGINE_PATH } from '../connectedDemoStory';

const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA==';

function engine(): string {
  const found = demoKitFiles().find((f) => f.path === DEMO_KIT_ENGINE_PATH);
  if (!found) throw new Error('the shipped kit has no engine; the rest of this file is moot');
  return found.content;
}

/** A spec that passes the contract, kept minimal so these tests are about the policy. */
function spec(appName = 'Coverage console'): unknown {
  return {
    schema_version: 2,
    environment: 'demo',
    app: { name: appName, descriptor: 'd', persona: { name: 'Sam Rivera', role: 'Ops lead' } },
    events: [
      {
        event_id: 'EV-1',
        occurred_at: '2026-11-21T14:32:00Z',
        work_id: 'W1',
        trace_id: 'T1',
        parent_event_id: null,
        actor: { type: 'agent', id: 'agent.one', label: 'Agent One', verified: false },
        human_owner_id: 'owner.ops',
        action: 'Did a thing',
        status: 'succeeded',
        risk_level: 'low',
        autonomy_tier: 'A2',
        reason_summary: 'Because the rules allowed it.',
        evidence_refs: ['e/1'],
        policy_refs: ['p/1'],
        approval: { required: false, status: 'not_required', assigned_to: null },
        side_effects: [],
        reversible: true,
        recovery_ref: null,
        environment: 'demo',
      },
    ],
    screens: {},
    entities: {},
    nav: [],
  };
}

describe('withScriptNonce', () => {
  it('stamps every script tag in the shipped engine (happy path)', () => {
    const html = engine();
    const before = (html.match(/<script\b/gi) || []).length;
    expect(before).toBeGreaterThan(0);

    const out = withScriptNonce(html, NONCE);
    const stamped = (out.match(new RegExp(`<script nonce="${NONCE.replace(/[+/=]/g, '\\$&')}"`, 'g')) || []).length;

    // BOTH directions: as many stamped as there were tags, and no tag left unstamped. An
    // assertion on only the first number passes while half the page stays blocked.
    expect(stamped).toBe(before);
    expect(out).not.toMatch(/<script(?!\s+nonce=)/i);
  });

  it('refuses a template it has already stamped, rather than emitting two nonce attributes', () => {
    const once = withScriptNonce(engine(), NONCE);
    expect(() => withScriptNonce(once, NONCE)).toThrow(DemoRenderError);
  });

  it('refuses a template with no script at all, rather than returning it unchanged', () => {
    // The failure this guards is a silent no-op: the page comes back blank and the header says
    // a nonce is required, so nothing in the response explains itself.
    expect(() => withScriptNonce('<!doctype html><html></html>', NONCE)).toThrow(DemoRenderError);
  });

  it('refuses a nonce that is not plausibly a nonce (boundary)', () => {
    for (const bad of ['', 'short', '"><script>', 'a b c']) {
      expect(() => withScriptNonce(engine(), bad)).toThrow(DemoRenderError);
    }
  });

  it('is deterministic: the same template and nonce give the same bytes (idempotency)', () => {
    expect(withScriptNonce(engine(), NONCE)).toBe(withScriptNonce(engine(), NONCE));
  });
});

describe('renderConnectedDemo with a nonce', () => {
  it('stamps the spec slot as well as the engine script', () => {
    const html = renderConnectedDemo(spec(), engine(), NONCE);
    expect(html).toContain(`<script nonce="${NONCE}" type="application/json" id="demo-spec">`);
    expect(html).not.toMatch(/<script(?!\s+nonce=)/i);
  });

  it('still renders without a nonce, and then stamps nothing', () => {
    const html = renderConnectedDemo(spec(), engine());
    expect(html).not.toContain('nonce=');
    expect(html).toContain('<script type="application/json" id="demo-spec">');
  });

  it('NEVER stamps spec data, even when a spec string looks like a script tag', () => {
    // The reason the stamping runs on the template and not on the finished page. If this ever
    // fails, the nonce is being written into student-authored JSON.
    const html = renderConnectedDemo(spec('<script race condition'), engine(), NONCE);
    const payload = html.slice(html.indexOf('id="demo-spec"'));
    expect(payload).toContain('\\u003cscript race condition');
    expect(payload).not.toContain(`<script nonce="${NONCE}" race`);
  });

  it('leaves the empty slot constant unstamped, so the constant stays the thing on disk', () => {
    expect(DEMO_SPEC_SLOT).not.toContain('nonce');
  });
});
