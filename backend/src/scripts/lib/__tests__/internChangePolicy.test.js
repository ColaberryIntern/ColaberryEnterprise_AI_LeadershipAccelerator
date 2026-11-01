/**
 * Tests for the AF4.5 intern-change refusal policy.
 *
 * The policy exists because a human approving a diff is good at "is this code correct"
 * and bad at "does this one line in a workflow file exfiltrate every secret this
 * repository holds". So the dangerous classes must be refused by code, and these tests
 * are what stop a rule quietly ceasing to match.
 *
 * Every refusal test is paired with an ALLOW case on a neighbouring path, because a rule
 * that refuses everything passes every refusal test while making the path unusable.
 */
const { evaluateChange, PATH_RULES } = require('../../../../../scripts/lib/internChangePolicy');

const ok = (paths) => evaluateChange({ paths });
const names = (r) => r.refusals.map((x) => x.name);

describe('evaluateChange', () => {
  describe('the ordinary case', () => {
    it('allows a normal source and test change', () => {
      const r = ok([
        'backend/src/services/agents/ellis/ellisPlatformAgent.ts',
        'backend/src/services/agents/ellis/__tests__/ellisPlatformAgent.test.ts',
        'docs/ELLIS.md',
      ]);
      expect(r.allowed).toBe(true);
      expect(r.refusals).toEqual([]);
    });

    it('allows a .env.example, which is the file an intern SHOULD add', () => {
      const r = ok(['.env.example', 'backend/.env.sample']);
      expect(r.allowed).toBe(true);
    });

    it('allows a frontend change with a Windows-style path', () => {
      const r = ok(['frontend\\src\\pages\\AgentConsole.tsx']);
      expect(r.allowed).toBe(true);
    });
  });

  describe('workflow and actions changes are refused in full', () => {
    it.each([
      '.github/workflows/ci.yml',
      '.github/workflows/secret-scan.yml',
      '.github/actions/setup/action.yml',
      '.github/dependabot.yml',
      '.github/CODEOWNERS',
    ])('refuses %s', (p) => {
      expect(names(ok([p]))).toContain('workflow_or_actions_change');
    });

    /* ALLOW control: the rule must be scoped to .github, not to anything named github. */
    it('does not refuse a path that merely mentions github', () => {
      const r = ok(['backend/src/services/githubService.ts', 'docs/github-setup.md']);
      expect(r.allowed).toBe(true);
    });
  });

  describe('infrastructure', () => {
    it.each([
      'docker-compose.yml',
      'docker-compose.production.yml',
      'Dockerfile',
      'Dockerfile.backend',
      'nginx/default.conf',
      'preview-db-init/01-schema.sql',
    ])('refuses %s', (p) => {
      expect(names(ok([p]))).toContain('infrastructure_change');
    });

    it('does not refuse application code that happens to sit deeper', () => {
      expect(ok(['backend/src/config/docker-compose-notes.md']).allowed).toBe(true);
    });
  });

  describe('the secret gate cannot be reached from the path it guards', () => {
    it.each([
      '.gitleaks.toml',
      '.gitleaksignore',
      '.husky/pre-commit',
      'scripts/secret-scan.js',
      'scripts/ensure-gitleaks.js',
      'scripts/lint-route-auth.js',
    ])('refuses %s', (p) => {
      expect(names(ok([p]))).toContain('secret_gate_change');
    });

    it('allows another script in the same directory', () => {
      expect(ok(['scripts/internRepoSecretScan.js']).allowed).toBe(true);
    });
  });

  describe('CI, ownership and deploy', () => {
    it.each([
      ['scripts/ci/runIntegrationSuites.js', 'ci_or_ownership_change'],
      ['CODEOWNERS', 'ci_or_ownership_change'],
      ['scripts/deploy-prod.sh', 'ci_or_ownership_change'],
    ])('refuses %s', (p, rule) => {
      expect(names(ok([p]))).toContain(rule);
    });
  });

  describe('governance', () => {
    it.each(['CLAUDE.md', 'backend/CLAUDE.md', 'directives/ONBOARDING.md'])('refuses %s', (p) => {
      expect(names(ok([p]))).toContain('governance_change');
    });

    it('allows ordinary documentation', () => {
      expect(ok(['docs/INTERN_DEV_ENVIRONMENT.md', 'README.md']).allowed).toBe(true);
    });
  });

  describe('credential-bearing files', () => {
    it.each([
      '.env',
      '.env.production',
      'backend/.env.local',
      'certs/server.pem',
      'deploy.key',
      'secrets/store.p12',
      '.ssh/id_rsa',
    ])('refuses %s', (p) => {
      expect(names(ok([p]))).toContain('env_or_credential_file');
    });
  });

  describe('path traversal', () => {
    it.each(['../outside.ts', 'backend/../../etc/passwd', '/etc/passwd', 'C:/Windows/system32'])(
      'refuses %s', (p) => {
        expect(names(ok([p]))).toContain('path_escapes_repository');
      },
    );
  });

  describe('reviewability and scan result', () => {
    it('refuses a patch too large to review, and says how large', () => {
      const many = Array.from({ length: 41 }, (_, i) => `backend/src/f${i}.ts`);
      const r = ok(many);
      expect(names(r)).toContain('too_many_files_to_review');
      expect(r.refusals.find((x) => x.name === 'too_many_files_to_review').why).toMatch(/41 files/);
    });

    it('allows exactly the limit', () => {
      const many = Array.from({ length: 40 }, (_, i) => `backend/src/f${i}.ts`);
      expect(ok(many).allowed).toBe(true);
    });

    it('refuses when the secret scan flagged the patch', () => {
      const r = evaluateChange({ paths: ['backend/src/a.ts'], secretFound: true });
      expect(r.allowed).toBe(false);
      expect(names(r)).toContain('secret_detected_in_patch');
    });

    /* An empty patch means the commit could not be read, which must not import as a
       no-op PR that a reviewer then approves. */
    it.each([[[]], [null], [undefined], [['', '   ']]])('refuses an empty patch (%p)', (paths) => {
      const r = evaluateChange({ paths });
      expect(r.allowed).toBe(false);
      expect(names(r)).toContain('no_files_changed');
    });
  });

  /**
   * The rule that came out of a real failure: on 2026-11-01 a commit editing
   * `.colaberry/progress.json` passed every refusal above, because every one of them asks
   * whether a path is DANGEROUS and none asked whether it is OURS. `git am` then exited
   * 128 -- there is no file to place the hunk in, and no base blob for `-3` to merge.
   */
  describe('a patch with no footprint in this repository', () => {
    const OURS = [
      'backend/src/services/agents/ellis/ellisPlatformAgent.ts',
      'scripts/importInternChange.js',
      'README.md',
      'docs/AGENTS.md',
    ];

    it('refuses a patch that touches only the intern\'s own project files', () => {
      const r = evaluateChange({
        paths: ['.colaberry/progress.json', 'command-center/index.html'],
        repoPaths: OURS,
      });
      expect(r.allowed).toBe(false);
      expect(names(r)).toContain('no_path_in_this_repository');
    });

    it('allows a patch that touches even ONE path this repository has', () => {
      const r = evaluateChange({
        paths: ['.colaberry/progress.json', 'docs/AGENTS.md'],
        repoPaths: OURS,
      });
      expect(r.allowed).toBe(true);
    });

    it('accepts a Set as readily as an array, since the caller builds one', () => {
      const r = evaluateChange({ paths: ['nope/at/all.json'], repoPaths: new Set(OURS) });
      expect(names(r)).toContain('no_path_in_this_repository');
    });

    it('normalizes Windows paths before deciding they are foreign', () => {
      const r = evaluateChange({ paths: ['docs\\AGENTS.md'], repoPaths: OURS });
      expect(r.allowed).toBe(true);
    });

    it('names every path, so the reader sees what the patch was actually about', () => {
      const r = evaluateChange({
        paths: ['.colaberry/progress.json', 'command-center/app.js'],
        repoPaths: OURS,
      });
      const hit = r.refusals.find((x) => x.name === 'no_path_in_this_repository');
      expect(hit.paths).toEqual(['.colaberry/progress.json', 'command-center/app.js']);
    });

    /*
     * The check is opt-in. The policy is a pure decision model and the caller supplies
     * the repository's paths; a caller that does not must not have the rule fire blind.
     */
    it('does NOT fire when the caller supplies no repoPaths', () => {
      expect(evaluateChange({ paths: ['.colaberry/progress.json'] }).allowed).toBe(true);
    });

    it('does NOT fire on an empty repoPaths, which means "unknown", not "nothing matches"', () => {
      expect(evaluateChange({ paths: ['.colaberry/progress.json'], repoPaths: [] }).allowed)
        .toBe(true);
    });

    /*
     * A filename match is not a content match, and this rule cannot tell the difference.
     * Both repositories have a README.md; they are different documents sharing a name.
     * That is why a name hit only clears THIS rule and the apply is then rehearsed for
     * real -- the rule is deliberately scoped to zero overlap, the unambiguous case.
     */
    it('a bare filename collision clears this rule and nothing more', () => {
      const r = evaluateChange({ paths: ['README.md'], repoPaths: OURS });
      expect(r.allowed).toBe(true);
    });
  });

  describe('reporting', () => {
    it('reports EVERY matching rule, not just the first', () => {
      const r = ok(['.github/workflows/ci.yml', '.env', 'nginx/default.conf']);
      expect(names(r)).toEqual(expect.arrayContaining([
        'workflow_or_actions_change', 'env_or_credential_file', 'infrastructure_change',
      ]));
    });

    it('names the offending paths so an intern gets one round trip, not three', () => {
      const r = ok(['.github/workflows/a.yml', '.github/workflows/b.yml', 'backend/src/ok.ts']);
      const hit = r.refusals.find((x) => x.name === 'workflow_or_actions_change');
      expect(hit.paths).toEqual(['.github/workflows/a.yml', '.github/workflows/b.yml']);
    });

    it('gives every rule a reason a human can act on', () => {
      for (const rule of PATH_RULES) {
        expect(typeof rule.why).toBe('string');
        expect(rule.why.length).toBeGreaterThan(40);
      }
    });
  });

  /**
   * CONTROL. A policy that allowed everything would pass every "allows" test above.
   * This asserts the refusing half is still wired at all.
   */
  it('CONTROL: the policy still refuses the highest-value target', () => {
    expect(ok(['.github/workflows/ci.yml']).allowed).toBe(false);
  });
});
