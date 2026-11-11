/**
 * C128 My work service: EVERY query is keyed on the caller's enrollment, so a learner cannot read another
 * learner's piece by id; the list never loads the heavy bodies; a piece is shaped for its viewer.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: unknown[]) => mockQuery(...a) } }));

import { getMyWorkFile, getMyWorkPiece, listMyWork, toPiece } from '../myWorkService';

const ID = '11111111-2222-4333-8444-555555555555';
beforeEach(() => mockQuery.mockReset());

const sqlAndReplacements = () => mockQuery.mock.calls.map((c) => ({ sql: String(c[0]), rep: (c[1] as { replacements: Record<string, unknown> }).replacements }));

it('the list, the piece and the file all filter on the caller\'s enrollment', async () => {
  mockQuery.mockResolvedValue([]);
  await listMyWork('enr-9');
  await getMyWorkPiece('enr-9', ID);
  await getMyWorkFile('enr-9', ID);
  for (const { sql, rep } of sqlAndReplacements()) {
    expect(sql).toMatch(/WHERE[\s\S]*enrollment_id = :enrollmentId/);
    expect(rep.enrollmentId).toBe('enr-9');
  }
  const [, piece, file] = sqlAndReplacements();
  for (const q of [piece, file]) {
    expect(q.sql).toMatch(/id = :id AND enrollment_id = :enrollmentId/);
    expect(q.rep.id).toBe(ID);
  }
});

it('another learner\'s piece (no row for this enrollment) is null, never an error', async () => {
  mockQuery.mockResolvedValue([]);
  await expect(getMyWorkPiece('enr-9', ID)).resolves.toBeNull();
  await expect(getMyWorkFile('enr-9', ID)).resolves.toBeNull();
});

it('the list strips the heavy bodies in SQL and is capped', async () => {
  mockQuery.mockResolvedValue([]);
  await listMyWork('enr-9');
  const { sql } = sqlAndReplacements()[0];
  expect(sql).toContain("- 'body_html'");
  expect(sql).toContain("- 'sections'");
  expect(sql).toMatch(/LIMIT \d+/);
});

it('a query failure is thrown to the route, not swallowed', async () => {
  mockQuery.mockRejectedValue(new Error('db down'));
  await expect(listMyWork('enr-9')).rejects.toThrow('db down');
});

describe('toPiece', () => {
  const base = { id: ID, created_at: '2026-08-24T15:00:00Z', competencies: [] };

  it('a case study gets the reader body, and the leftover data does not repeat it', () => {
    const p = toPiece({ ...base, kind: 'case_study', title: 'Week 2 Evaluation Case Study',
      content: { kind: 'case_study', sections: [{ heading: 'Overview', body: 'Text' }], skills_demonstrated: ['Critical Thinking'] } });
    expect(p.group).toBe('written');
    expect(p.written).toEqual({ form: 'sections', sections: [{ heading: 'Overview', body: 'Text' }] });
    expect(p.skills).toEqual(['Critical Thinking']);
    expect(p.data).toEqual({});
    expect(p.html).toBeNull();
    expect(p.link).toBeNull();
  });

  it('a field guide carries its HTML for the sandboxed frame', () => {
    const p = toPiece({ ...base, kind: 'field_guide', title: 'Field Guide — Deep Dive', content: { body_html: '<!DOCTYPE html><p>x</p>', week: 1 } });
    expect(p.group).toBe('guide');
    expect(p.html).toContain('<p>x</p>');
    expect(p.written).toBeNull();
  });

  it('a Claude Studio piece gets the link body and the external URL', () => {
    const p = toPiece({ ...base, kind: 'claude_studio', title: 'Claude Studio — Capstone — claude.ai',
      content: { artifact_url: 'https://claude.ai/artifact/U', reflection: 'Built twice', verification: 'unverified_link', stages_completed: ['explore'] } });
    expect(p.externalUrl).toBe('https://claude.ai/artifact/U');
    expect(p.link?.reflection).toBe('Built twice');
    expect(p.state).toBe('Link format-checked, not reviewed yet');
  });

  it('a build file never exposes the server path', () => {
    const p = toPiece({ ...base, kind: 'build_artifact', title: 'Build — L — a.pdf',
      content: { stored_path: '/app/uploads/strategy-prep/secret-name.pdf', stored_name: 'secret-name.pdf', filename: 'a.pdf', mimetype: 'application/pdf', repo_path: 'artifacts/a.pdf' } });
    expect(p.group).toBe('pdf');
    expect(JSON.stringify(p)).not.toContain('/app/uploads');
    expect(JSON.stringify(p)).not.toContain('secret-name');
    expect(p.data).toEqual({ repo_path: 'artifacts/a.pdf' });
  });
});
