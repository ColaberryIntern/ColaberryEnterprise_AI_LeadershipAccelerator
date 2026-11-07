import { routeNeedResolution } from '../resolveNeed';
import type { HumanNeed, HumanNeedKind } from '../proposalReviewTypes';

const need = (over: Partial<HumanNeed> & Pick<HumanNeed, 'key' | 'kind'>): HumanNeed => ({
  ask: 'a', why: 'w', format: 'f', blocking: 'score', usedIn: [], ...over,
});

const approver = { email: 'ali@colaberry.com', canApprove: true };
const intern = { email: 'mihret@colaberry.com', canApprove: false };

describe('routeNeedResolution — routing by kind', () => {
  it('fact from an approver lands approved in the library', () => {
    const r = routeNeedResolution(need({ key: 'fact:duns', kind: 'fact' }), { value: '12-345-6789' }, approver);
    expect(r).toMatchObject({ ok: true, store: 'library', status: 'approved', key: 'fact:duns' });
    if (r.ok) expect(r.payload).toMatchObject({ value: '12-345-6789', approved: true, enteredBy: 'ali@colaberry.com' });
  });

  it('fact from an intern lands pending review', () => {
    const r = routeNeedResolution(need({ key: 'fact:duns', kind: 'fact' }), { value: '12-345-6789' }, intern);
    expect(r).toMatchObject({ ok: true, store: 'library', status: 'pending' });
  });

  it('decision records the choice to the decision log', () => {
    const r = routeNeedResolution(need({ key: 'dec:repo', kind: 'decision' }), { value: 'upstream/ds' }, approver);
    expect(r).toMatchObject({ ok: true, store: 'decision_log', status: 'recorded' });
    if (r.ok) expect(r.payload).toMatchObject({ decision: 'upstream/ds' });
  });

  it('decision rejects a choice outside the offered options', () => {
    const n = need({ key: 'dec:x', kind: 'decision', options: ['a', 'b'] });
    expect(routeNeedResolution(n, { value: 'c' }, approver)).toMatchObject({ ok: false });
    expect(routeNeedResolution(n, { value: 'b' }, approver)).toMatchObject({ ok: true });
  });

  it('confirm_rule needs an explicit yes/no', () => {
    const n = need({ key: 'rule:legacy', kind: 'confirm_rule' });
    expect(routeNeedResolution(n, {}, approver)).toMatchObject({ ok: false });
    const r = routeNeedResolution(n, { approve: false }, approver);
    expect(r).toMatchObject({ ok: true, store: 'decision_log' });
    if (r.ok) expect(r.payload).toMatchObject({ confirmed: false });
  });

  it('file and signature route to upload and need a fileRef', () => {
    expect(routeNeedResolution(need({ key: 'file:w9', kind: 'file' }), {}, approver)).toMatchObject({ ok: false });
    expect(routeNeedResolution(need({ key: 'file:w9', kind: 'file' }), { fileRef: 'u/1' }, approver))
      .toMatchObject({ ok: true, store: 'upload' });
    const sig = routeNeedResolution(need({ key: 'sig:soc', kind: 'signature' }), { fileRef: 'u/2' }, approver);
    expect(sig).toMatchObject({ ok: true, store: 'upload' });
    if (sig.ok) expect(sig.payload).toMatchObject({ signatureRef: 'u/2' });
  });

  it('setting records a value, and URL-format settings must be valid URLs', () => {
    const plain = routeNeedResolution(need({ key: 'set:x', kind: 'setting' }), { value: 'on' }, approver);
    expect(plain).toMatchObject({ ok: true, store: 'setting' });
    const urlNeed = need({ key: 'set:demo', kind: 'setting', format: 'a public demo URL' });
    expect(routeNeedResolution(urlNeed, { value: 'not a url' }, approver)).toMatchObject({ ok: false });
    expect(routeNeedResolution(urlNeed, { value: 'https://demo.example.com/x' }, approver))
      .toMatchObject({ ok: true, store: 'setting' });
  });

  it('approval is approver-only and records a Go / No-go to the gate', () => {
    const n = need({ key: 'gate:gold', kind: 'approval' });
    expect(routeNeedResolution(n, { approve: true }, intern)).toMatchObject({ ok: false });
    const go = routeNeedResolution(n, { approve: true }, approver);
    expect(go).toMatchObject({ ok: true, store: 'gate', status: 'recorded' });
    if (go.ok) expect(go.payload).toMatchObject({ decision: 'go' });
    const nogo = routeNeedResolution(n, { approve: false }, approver);
    if (nogo.ok) expect(nogo.payload).toMatchObject({ decision: 'no_go' });
  });

  it('rejects a need with no key', () => {
    expect(routeNeedResolution({ key: '', kind: 'fact' } as HumanNeed, { value: 'x' }, approver))
      .toMatchObject({ ok: false });
  });

  it('every HumanNeedKind has a branch (no silent unsupported)', () => {
    const kinds: HumanNeedKind[] = ['fact', 'decision', 'file', 'signature', 'approval', 'confirm_rule', 'setting'];
    for (const kind of kinds) {
      const r = routeNeedResolution(need({ key: `k:${kind}`, kind }), {}, approver);
      // Either a clean route or a validation error — never the "unsupported need kind" default.
      if (!r.ok) expect(r.error).not.toMatch(/unsupported need kind/);
    }
  });
});
