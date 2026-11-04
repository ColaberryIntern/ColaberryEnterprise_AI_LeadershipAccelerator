jest.mock('../../config/database', () => ({ sequelize: { query: jest.fn(), close: jest.fn() } }));

import { blockers, renderPreflight } from '../generateContractDecomposition';

type P = Parameters<typeof blockers>[0];

const clean: P = {
  projectName: 'RFP - Enterprise Work Order Management System',
  requirements: 56,
  tracks: 2,
  existingDocs: 0,
  flagOn: true,
  authorization: {
    approver: 'ali@colaberry.com', scope: 'solution_build', resourceLimit: 'standard', revoked: false,
  },
};

describe('blockers', () => {
  it('passes the real Herriman preflight', () => {
    expect(blockers(clean, false)).toEqual([]);
  });

  it('refuses when no build authorization exists, naming what is needed', () => {
    // The governance gate: a pursuit approval is not a build authorization.
    const out = blockers({ ...clean, authorization: null }, false);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/named approver must authorize/i);
  });

  it('refuses a REVOKED authorization, which a mere row-exists check would pass', () => {
    const out = blockers(
      { ...clean, authorization: { ...clean.authorization!, revoked: true } }, false,
    );
    expect(out.some((b) => /REVOKED/.test(b))).toBe(true);
  });

  it('refuses an authorization scoped to something else', () => {
    const out = blockers(
      { ...clean, authorization: { ...clean.authorization!, scope: 'proposal' } }, false,
    );
    expect(out.some((b) => /scope is "proposal"/.test(b))).toBe(true);
  });

  it('refuses to silently overwrite an existing decomposition', () => {
    // generateDecomposition upserts over version 1 with no diff and no backup, so losing one
    // means losing the human/AI allocation somebody authored.
    const out = blockers({ ...clean, existingDocs: 1 }, false);
    expect(out.some((b) => /UPSERTS OVER VERSION 1/.test(b))).toBe(true);
  });

  it('permits the overwrite when asked explicitly', () => {
    expect(blockers({ ...clean, existingDocs: 1 }, true)).toEqual([]);
  });

  it('refuses when the engine flag is off', () => {
    expect(blockers({ ...clean, flagOn: false }, false)
      .some((b) => /ENABLE_FACTORY_GENERATION is off/.test(b))).toBe(true);
  });

  it('refuses a project with nothing to decompose', () => {
    expect(blockers({ ...clean, requirements: 0 }, false)
      .some((b) => /no requirements/.test(b))).toBe(true);
  });

  it('refuses an unknown project', () => {
    expect(blockers({ ...clean, projectName: null }, false)
      .some((b) => /no such delivery project/.test(b))).toBe(true);
  });

  it('reports EVERY blocker, not just the first', () => {
    // A caller learning one problem per run is the round-trip pattern worth avoiding.
    const out = blockers(
      { ...clean, projectName: null, requirements: 0, flagOn: false, authorization: null }, false,
    );
    expect(out.length).toBeGreaterThanOrEqual(4);
  });
});

describe('renderPreflight', () => {
  it('says plainly when it is clean and what to do next', () => {
    const text = renderPreflight('abc', clean, []);
    expect(text).toContain('PREFLIGHT CLEAN');
    expect(text).toContain('EXECUTE=1');
  });

  it('lists the blockers with a count when it is not', () => {
    const text = renderPreflight('abc', { ...clean, flagOn: false }, blockers({ ...clean, flagOn: false }, false));
    expect(text).toContain('BLOCKED (1)');
    expect(text).not.toContain('PREFLIGHT CLEAN');
  });

  it('shows the authorization, including that it is live', () => {
    expect(renderPreflight('abc', clean, [])).toMatch(/ali@colaberry\.com .*scope=solution_build.*live/);
  });

  it('says NONE rather than omitting the line when there is no authorization', () => {
    expect(renderPreflight('abc', { ...clean, authorization: null }, ['x']))
      .toContain('build authorization : NONE');
  });
});
