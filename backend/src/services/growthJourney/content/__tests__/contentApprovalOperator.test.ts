const query = jest.fn();
const transaction = jest.fn(async (fn: (t: unknown) => Promise<unknown>) => fn({ id: 'tx' }));
jest.mock('../../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => query(...a), transaction: (f: never) => transaction(f) } }));

const loadBrands = jest.fn();
const loadAssetsByBrandSlug = jest.fn();
const applyPlan = jest.fn();
jest.mock('../../../../scripts/growthJourneyContentRules', () => ({
  loadBrands: (...a: unknown[]) => loadBrands(...a),
  loadAssetsByBrandSlug: (...a: unknown[]) => loadAssetsByBrandSlug(...a),
  applyPlan: (...a: unknown[]) => applyPlan(...a),
}));

import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import {
  applyContentApproval, ContentApprovalError, previewContentApproval, revokeContentApproval,
} from '../contentApprovalOperator';

/**
 * R2 acceptance:
 *   (1) a writer for the approved lists, reachable by an operator, not a one-off script   -> the routes below
 *   (2) assertContentAllowed returns allowed for an approved asset                        -> contentEligibility tests
 *       (content_rule_approved once the policy has an approved page); referenced in the Maya acceptance registry
 *   (4) Explorer's selection is unbroken                                                   -> nothing here writes the
 *       table Explorer reads (scan below), and its own import guard stays green
 */

const BRAND = { tenant_id: 't1', brand_id: 'b1', brand_slug: 'colaberry-training' };
const LESSON = (id: string) => ({ id, asset_type: 'LESSON', title: id, audience_tags: ['free_preview'], active: true, brand_id: null });
const PAGE = 'https://training.colaberry.com/start';

beforeEach(() => {
  query.mockReset().mockResolvedValue([]); transaction.mockClear();
  loadBrands.mockReset().mockResolvedValue([BRAND]);
  loadAssetsByBrandSlug.mockReset().mockResolvedValue({ 'colaberry-training': [LESSON('a1'), LESSON('a2')] });
  applyPlan.mockReset().mockResolvedValue({ rules_created: 2, rules_existing: 0, policy_pages_added: 1, policy_rows_missing: [] });
});

describe('preview', () => {
  it('reports what would be approved and writes NOTHING', async () => {
    const p = await previewContentApproval({ brandSlug: 'colaberry-training', landingPage: PAGE });
    expect(p.rules).toBeGreaterThan(0);
    expect(p.summary.length).toBeGreaterThan(0);
    expect(applyPlan).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it('an http (not https) landing page is refused', async () => {
    await expect(previewContentApproval({ brandSlug: 'colaberry-training', landingPage: 'http://x.com/a' })).rejects.toThrow();
  });
  it('an unknown brand is a validation error, not an approval of every brand', async () => {
    loadBrands.mockResolvedValue([]);
    await expect(previewContentApproval({ brandSlug: 'nope', landingPage: PAGE })).rejects.toBeInstanceOf(ContentApprovalError);
  });
});

describe('apply', () => {
  it('runs the existing writer and records who approved', async () => {
    const r = await applyContentApproval({ brandSlug: 'colaberry-training', landingPage: PAGE }, 'ali@colaberry.com');
    expect(applyPlan).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ rules_created: 2, policy_pages_added: 1, explorer_content_assets_touched: 0 });
    const attribution = query.mock.calls.find((c) => /SET approved_by = :by/.test(String(c[0])))!;
    expect(attribution[1].replacements).toMatchObject({ by: 'ali@colaberry.com', brandId: 'b1' });
  });
  it('requires an approver', async () => {
    await expect(applyContentApproval({ brandSlug: 'colaberry-training', landingPage: PAGE }, ' ')).rejects.toBeInstanceOf(ContentApprovalError);
    expect(applyPlan).not.toHaveBeenCalled();
  });
});

describe('revoke (reversible, nothing deleted)', () => {
  it('sets approved rules to revoked and removes the landing page, in one transaction', async () => {
    query.mockResolvedValue([{ id: 'x' }]);
    const r = await revokeContentApproval({ brandSlug: 'colaberry-training', landingPage: PAGE }, 'ops@colaberry.com');
    expect(transaction).toHaveBeenCalledTimes(1);
    const sqls = query.mock.calls.map((c) => String(c[0]));
    expect(sqls.some((s) => /SET approval_status = 'revoked'/.test(s) && /approval_status = 'approved'/.test(s))).toBe(true);
    expect(sqls.some((s) => /approved_landing_pages - CAST\(:page AS text\)/.test(s))).toBe(true);
    expect(sqls.some((s) => /DELETE/i.test(s))).toBe(false);
    expect(r.explorer_content_assets_touched).toBe(0);
  });
});

describe('approve, revoke, approve ends APPROVED (stateful)', () => {
  /** A fake of the two things the verdict reads: rule status per asset, and the policy's approved page list. */
  function table() {
    const rules = new Map<string, string>();
    const pages: string[] = [];
    applyPlan.mockImplementation(async (plan: { rules: { asset_id: string }[]; policy_pages: { landing_page: string }[] }) => {
      let created = 0;
      for (const r of plan.rules) if (!rules.has(r.asset_id)) { rules.set(r.asset_id, 'approved'); created++; } // ON CONFLICT DO NOTHING
      for (const p of plan.policy_pages) if (!pages.includes(p.landing_page)) pages.push(p.landing_page);
      return { rules_created: created, rules_existing: plan.rules.length - created, policy_pages_added: 1, policy_rows_missing: [] };
    });
    query.mockImplementation(async (sql: string, opts: { replacements: Record<string, unknown> }) => {
      const ids = (opts.replacements.assetIds as string[] | undefined) ?? [opts.replacements.assetId as string];
      if (/SET approval_status = 'approved'/.test(sql)) {
        const hit = ids.filter((id) => rules.get(id) === 'revoked'); hit.forEach((id) => rules.set(id, 'approved')); return hit.map((id) => ({ id }));
      }
      if (/SET approval_status = 'revoked'/.test(sql)) {
        const hit = ids.filter((id) => rules.get(id) === 'approved'); hit.forEach((id) => rules.set(id, 'revoked')); return hit.map((id) => ({ id }));
      }
      if (/approved_landing_pages - CAST/.test(sql)) {
        const i = pages.indexOf(String(opts.replacements.page)); if (i < 0) return []; pages.splice(i, 1); return [{ id: 'p' }];
      }
      return [];
    });
    // The verdict, as contentEligibility decides it for a named asset: no approved page -> content_not_approved; a rule
    // that is not 'approved' -> content_rule_not_approved:<status>; else content_rule_approved.
    const verdict = (assetId: string) => (pages.length === 0 ? 'content_not_approved'
      : rules.get(assetId) !== 'approved' ? `content_rule_not_approved:${rules.get(assetId)}` : 'content_rule_approved');
    return { rules, pages, verdict };
  }

  it('the named asset is allowed, refused after revoke, allowed again after re-approve; the page is listed once', async () => {
    const t = table();
    const input = { brandSlug: 'colaberry-training', landingPage: PAGE };
    await applyContentApproval(input, 'ali@colaberry.com');
    expect(t.verdict('a1')).toBe('content_rule_approved');
    await revokeContentApproval(input, 'ops@colaberry.com');
    expect(t.verdict('a1')).toBe('content_not_approved');
    expect(t.rules.get('a1')).toBe('revoked');
    const again = await applyContentApproval(input, 'ali@colaberry.com');
    expect(again.rules_restored).toBe(2);
    expect(t.verdict('a1')).toBe('content_rule_approved');
    expect(t.pages.filter((p) => p === new URL(PAGE).toString())).toHaveLength(1);
  });
});

describe('the Explorer table is never written', () => {
  it('no UPDATE/INSERT/DELETE on explorer_content_assets in the operator or its route', () => {
    for (const f of [path.join(__dirname, '..', 'contentApprovalOperator.ts'), path.join(__dirname, '..', '..', '..', '..', 'routes', 'admin', 'growthJourneyContentApprovalRoutes.ts')]) {
      expect(fs.readFileSync(f, 'utf8')).not.toMatch(/(UPDATE|INSERT INTO|DELETE FROM)\s+explorer_content_assets/i);
    }
  });
});

describe('routes', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { env } = require('../../../../config/env');
  const app = () => { const a = express(); a.use(express.json()); a.use(require('../../../../routes/admin/growthJourneyContentApprovalRoutes').default); return a; };
  const tok = (email: string) => `Bearer ${jwt.sign({ sub: 'u', email, role: 'admin' }, env.jwtSecret, { expiresIn: '5m' })}`;
  const body = { brand_slug: 'colaberry-training', landing_page: PAGE };

  it('401 without a token on every route', async () => {
    for (const a of ['preview', 'apply', 'revoke']) {
      expect((await request(app()).post(`/api/admin/growth-journey/content-approval/${a}`).send(body)).status).toBe(401);
    }
  });
  it('apply is Ali or a super_admin only (403 for another admin), and nothing is written', async () => {
    const res = await request(app()).post('/api/admin/growth-journey/content-approval/apply').set('Authorization', tok('ops@colaberry.com')).send(body);
    expect(res.status).toBe(403);
    expect(applyPlan).not.toHaveBeenCalled();
  });
  it('apply by Ali is 200 and recorded with the token identity', async () => {
    const res = await request(app()).post('/api/admin/growth-journey/content-approval/apply').set('Authorization', tok('ali@colaberry.com')).send(body);
    expect(res.status).toBe(200);
    expect(query.mock.calls[0][1].replacements.by).toBe('ali@colaberry.com');
  });
  it('400 on a malformed body or a non-https page, before any write', async () => {
    const bad = await request(app()).post('/api/admin/growth-journey/content-approval/preview').set('Authorization', tok('ops@colaberry.com')).send({ brand_slug: 'X Y', landing_page: PAGE });
    expect(bad.status).toBe(400);
    const http = await request(app()).post('/api/admin/growth-journey/content-approval/preview').set('Authorization', tok('ops@colaberry.com')).send({ ...body, landing_page: 'http://x.com/aaaa' });
    expect(http.status).toBe(400);
    expect(applyPlan).not.toHaveBeenCalled();
  });
});
