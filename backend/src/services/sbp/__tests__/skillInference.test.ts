/**
 * skillInference — the replacement for a number that should never have been published.
 *
 * The tests that matter most are the refusals: no skill without a basis, no skill from a
 * capability that is merely defined rather than present, and no competence vocabulary
 * anywhere in the output.
 */
import { inferSkills } from '../skillInference';
import { readRepoSignals } from '../repoSignals';

const signalsFrom = (...paths: string[]) =>
  readRepoSignals(paths.map((path) => ({ path, type: 'blob' })));

const EMPTY = signalsFrom();

describe('inferSkills', () => {
  it('emits nothing when there is nothing to point at', () => {
    expect(inferSkills({ signals: EMPTY })).toEqual([]);
    expect(inferSkills({ signals: EMPTY, capabilities: [], paths: [] })).toEqual([]);
  });

  it('never emits a skill without a basis', () => {
    // A claim a student cannot source is a claim that damages them: they get asked about
    // something they did not do.
    const out = inferSkills({
      signals: signalsFrom('backend/a.ts', 'frontend/b.tsx', 'Dockerfile', 'README.md'),
      capabilities: [{ id: 'MCP_SERVER', present: true }],
      paths: ['rag/retriever.py'],
    });
    expect(out.length).toBeGreaterThan(0);
    for (const s of out) {
      expect(s.basis.length).toBeGreaterThan(0);
      for (const b of s.basis) expect(b.trim()).not.toBe('');
    }
  });

  it('ignores a capability that is defined but not present', () => {
    expect(inferSkills({ signals: EMPTY, capabilities: [{ id: 'MCP_SERVER', present: false }] }))
      .toEqual([]);
    expect(inferSkills({ signals: EMPTY, capabilities: [{ id: 'MCP_SERVER' }] })).toEqual([]);
  });

  it('reads a committed capability as evidence of its skill', () => {
    const out = inferSkills({ signals: EMPTY, capabilities: [{ id: 'GOVERNANCE', present: true }] });
    expect(out).toEqual([
      { skill_id: 'governance', label: 'Governance', basis: ['Built a governance engine'] },
    ]);
  });

  it('carries a collection count into the basis', () => {
    const out = inferSkills({ signals: EMPTY, capabilities: [{ id: 'SKILLS', present: true, count: 7 }] });
    expect(out[0].basis).toEqual(['Committed a set of agent skills (7)']);
  });

  it('accumulates reasons rather than repeating a skill', () => {
    // Two capabilities both evidence agents_mcp. One entry, two reasons.
    const out = inferSkills({
      signals: EMPTY,
      capabilities: [{ id: 'MCP_SERVER', present: true }, { id: 'AGENTS', present: true, count: 3 }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].skill_id).toBe('agents_mcp');
    expect(out[0].basis).toEqual(['Built an MCP server', 'Built a team of subagents (3)']);
  });

  it('infers from unambiguous paths where no capability covers the skill', () => {
    const out = inferSkills({ signals: EMPTY, paths: ['rag/retriever.py', 'src/embeddings.ts'] });
    const ids = out.map((s) => s.skill_id).sort();
    expect(ids).toEqual(['rag', 'vectors']);
  });

  it('does not infer from a vague path', () => {
    // "search" appears in a thousand harmless files. A false skill is worse than a
    // missing one.
    expect(inferSkills({ signals: EMPTY, paths: ['src/searchbar.tsx', 'utils/searching.js'] }))
      .toEqual([]);
  });

  it('reads structural practices as observations, not competence', () => {
    const out = inferSkills({
      signals: signalsFrom('Dockerfile', '.github/workflows/ci.yml', 'src/a.test.ts',
        'backend/a.ts', 'frontend/b.tsx'),
    });
    const deploy = out.find((s) => s.skill_id === 'deploy_ops');
    expect(deploy!.basis).toEqual(['Containerised the system', 'Set up continuous integration']);
    expect(out.find((s) => s.skill_id === 'system_design')!.basis)
      .toContain('Built both a server and a client surface');
  });

  it('uses no competence vocabulary anywhere in the output', () => {
    // The tree carries paths. It cannot show a student is proficient, expert, or
    // advanced, so those words must not be reachable.
    const out = inferSkills({
      signals: signalsFrom('Dockerfile', 'src/a.test.ts', 'backend/a.ts', 'frontend/b.tsx', 'README.md'),
      capabilities: [{ id: 'GOVERNANCE', present: true }, { id: 'SKILLS', present: true, count: 4 }],
      paths: ['rag/a.py'],
    });
    const serialized = JSON.stringify(out).toLowerCase();
    for (const word of ['proficien', 'expert', 'advanced', 'mastery', 'score',
      'confidence', 'evidence_count', 'verified by']) {
      expect(serialized).not.toContain(word);
    }
  });

  it('leads with the most-evidenced skill and is deterministic', () => {
    const input = {
      signals: signalsFrom('Dockerfile', '.github/workflows/ci.yml', 'backend/a.ts', 'frontend/b.tsx'),
      capabilities: [{ id: 'AUTOMATION', present: true }, { id: 'ARCHITECTURE', present: true }],
    };
    const out = inferSkills(input);
    expect(out[0].basis.length).toBeGreaterThanOrEqual(out[out.length - 1].basis.length);
    expect(inferSkills(input)).toEqual(out);
  });

  it('degrades on junk instead of throwing', () => {
    for (const bad of [undefined, null, 'nope', 42, [null], [{}]]) {
      expect(() => inferSkills({ signals: EMPTY, capabilities: bad as any, paths: bad as any }))
        .not.toThrow();
    }
    expect(() => inferSkills({ signals: undefined as any })).not.toThrow();
  });
});
