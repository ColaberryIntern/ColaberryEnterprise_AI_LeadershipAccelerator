/**
 * projectRepoResolver — precedence rules, tested from literals.
 *
 * The pure core is what decides whether a student is reported as having a repo,
 * so every rule here is asserted directly rather than through a database. The
 * production defect this service fixes was a read pointed at the wrong store;
 * these tests pin the replacement rule so it cannot silently invert again.
 */
import { decideRepoPointer } from '../projectRepoResolver';

const CONN_URL = 'https://github.com/acme/intake-agent';
const LEGACY_URL = 'https://github.com/acme/old-pointer';

describe('decideRepoPointer', () => {
  describe('happy path', () => {
    it('prefers the connection over the legacy project column', () => {
      const result = decideRepoPointer(
        { repo_url: CONN_URL, repo_owner: 'acme', repo_name: 'intake-agent' },
        LEGACY_URL,
      );
      expect(result).toEqual({
        url: CONN_URL, owner: 'acme', name: 'intake-agent', source: 'connection',
      });
    });

    it('resolves from the connection when the project column is empty — the live-cohort case', () => {
      // 16 July-2026 students are exactly this shape: a connection carrying the
      // repo, and a project column that was never written.
      const result = decideRepoPointer({ repo_url: CONN_URL }, null);
      expect(result.url).toBe(CONN_URL);
      expect(result.source).toBe('connection');
    });
  });

  describe('falling back', () => {
    it('uses the legacy column when there is no connection at all', () => {
      const result = decideRepoPointer(null, LEGACY_URL);
      expect(result).toEqual({
        url: LEGACY_URL, owner: 'acme', name: 'old-pointer', source: 'project_column',
      });
    });

    it('uses the legacy column when a connection exists but carries no repo', () => {
      // A student who authorised GitHub and never picked a repo. Treating the
      // bare connection as an answer would report a repo that does not exist.
      const result = decideRepoPointer({ repo_url: null }, LEGACY_URL);
      expect(result.source).toBe('project_column');
      expect(result.url).toBe(LEGACY_URL);
    });

    it('reports none when neither store has anything', () => {
      expect(decideRepoPointer(null, null)).toEqual({
        url: null, owner: null, name: null, source: 'none',
      });
    });

    it('reports none for a connection with no repo and no legacy column', () => {
      expect(decideRepoPointer({ repo_url: null }, undefined).source).toBe('none');
    });
  });

  describe('deriving owner and name', () => {
    it('derives owner/name from the URL when the connection stored them blank', () => {
      // githubService.connectRepo left these empty on older rows, which broke
      // every downstream caller that checked repo_owner.
      const result = decideRepoPointer({ repo_url: CONN_URL, repo_owner: '', repo_name: '' }, null);
      expect(result.owner).toBe('acme');
      expect(result.name).toBe('intake-agent');
    });

    it('keeps a stored owner/name when present rather than re-deriving', () => {
      const result = decideRepoPointer(
        { repo_url: CONN_URL, repo_owner: 'Acme-Corp', repo_name: 'Intake-Agent' },
        null,
      );
      expect(result.owner).toBe('Acme-Corp');
      expect(result.name).toBe('Intake-Agent');
    });

    it('handles a .git suffix and an SSH-style remote', () => {
      const ssh = decideRepoPointer({ repo_url: 'git@github.com:acme/intake-agent.git' }, null);
      expect(ssh.owner).toBe('acme');
      expect(ssh.name).toBe('intake-agent');
    });
  });

  describe('boundaries', () => {
    it('treats a whitespace-only repo_url as absent', () => {
      const result = decideRepoPointer({ repo_url: '   ' }, LEGACY_URL);
      expect(result.source).toBe('project_column');
    });

    it('trims surrounding whitespace off a stored URL', () => {
      expect(decideRepoPointer({ repo_url: `  ${CONN_URL}  ` }, null).url).toBe(CONN_URL);
    });

    it('keeps a non-GitHub URL but reports no owner or name', () => {
      const result = decideRepoPointer({ repo_url: 'https://gitlab.com/acme/thing' }, null);
      expect(result.url).toBe('https://gitlab.com/acme/thing');
      expect(result.owner).toBeNull();
      expect(result.name).toBeNull();
      expect(result.source).toBe('connection');
    });

    it('treats undefined and null connections identically', () => {
      expect(decideRepoPointer(undefined, null)).toEqual(decideRepoPointer(null, null));
    });
  });

  describe('idempotency of the decision', () => {
    it('returns an equal result for the same inputs and never shares state', () => {
      const a = decideRepoPointer({ repo_url: CONN_URL }, LEGACY_URL);
      const b = decideRepoPointer({ repo_url: CONN_URL }, LEGACY_URL);
      expect(a).toEqual(b);
      a.url = 'mutated';
      expect(decideRepoPointer({ repo_url: CONN_URL }, LEGACY_URL).url).toBe(CONN_URL);
    });
  });
});
