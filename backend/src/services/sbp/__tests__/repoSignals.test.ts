/**
 * repoSignals — tested from literals, like the rest of the pure layer.
 *
 * The property that matters most is the one the module cannot enforce on its own: it
 * reports STRUCTURE and never QUALITY. These tests pin the observable claims and, just as
 * importantly, pin the things it must refuse to say.
 */
import { readRepoSignals, hasEnoughSignal } from '../repoSignals';

const f = (...paths: string[]) => paths.map((path) => ({ path, type: 'blob' }));

describe('readRepoSignals', () => {
  describe('languages', () => {
    it('counts files per language, most first', () => {
      const s = readRepoSignals(f('a.ts', 'b.ts', 'c.ts', 'd.py', 'e.py', 'g.py', 'h.py'));
      expect(s.languages).toEqual([
        { name: 'Python', files: 4 },
        { name: 'TypeScript', files: 3 },
      ]);
    });

    it('folds tsx into TypeScript and jsx into JavaScript', () => {
      const s = readRepoSignals(f('a.ts', 'b.tsx', 'c.tsx', 'd.js', 'e.jsx', 'g.jsx'));
      expect(s.languages.map((l) => l.name).sort()).toEqual(['JavaScript', 'TypeScript']);
    });

    it('ignores a language below the floor', () => {
      // One stray shell script does not make somebody a shell programmer, and listing it
      // would dilute the real signal beside it.
      const s = readRepoSignals(f('a.ts', 'b.ts', 'c.ts', 'deploy.sh'));
      expect(s.languages.map((l) => l.name)).toEqual(['TypeScript']);
    });

    it('refuses to guess an ambiguous extension', () => {
      // .h could be C or C++, .m could be Objective-C or MATLAB. A wrong language on a
      // portfolio is noticed immediately and never forgiven.
      const s = readRepoSignals(f('a.h', 'b.h', 'c.h', 'd.m', 'e.m', 'g.m'));
      expect(s.languages).toEqual([]);
    });

    it('reports counts, never percentages', () => {
      // "310 TypeScript files" is checkable by anyone who opens the repo. "78%
      // TypeScript" invites an argument about the denominator -- vendored code,
      // generated files, images. Asserted on KEYS, not on a substring search: an
      // earlier version of this test matched /ratio/ inside "continuous_integration".
      const s = readRepoSignals(f('a.ts', 'b.ts', 'c.ts'));
      expect(Object.keys(s.languages[0]).sort()).toEqual(['files', 'name']);
      expect(Number.isInteger(s.languages[0].files)).toBe(true);
      expect(s.languages[0].files).toBe(3);
    });
  });

  describe('practices are PRESENCE, never judgement', () => {
    it('sees a Dockerfile at the root or nested', () => {
      expect(readRepoSignals(f('Dockerfile')).practices.containerised).toBe(true);
      expect(readRepoSignals(f('backend/Dockerfile')).practices.containerised).toBe(true);
      expect(readRepoSignals(f('docker-compose.yml')).practices.containerised).toBe(true);
    });

    it('sees tests by directory or by filename', () => {
      expect(readRepoSignals(f('src/__tests__/a.ts')).practices.tested).toBe(true);
      expect(readRepoSignals(f('tests/a.py')).practices.tested).toBe(true);
      expect(readRepoSignals(f('src/a.test.ts')).practices.tested).toBe(true);
      expect(readRepoSignals(f('src/a.spec.js')).practices.tested).toBe(true);
    });

    it('counts docs, directives and specs as documentation', () => {
      expect(readRepoSignals(f('README.md')).practices.documented).toBe(true);
      expect(readRepoSignals(f('directives/one.md')).practices.documented).toBe(true);
      expect(readRepoSignals(f('spec/08_data_model.md')).practices.documented).toBe(true);
      expect(readRepoSignals(f('CLAUDE.md')).practices.documented).toBe(true);
    });

    it('needs BOTH a server and a client surface for full_stack', () => {
      expect(readRepoSignals(f('backend/a.ts')).practices.full_stack).toBe(false);
      expect(readRepoSignals(f('frontend/a.tsx')).practices.full_stack).toBe(false);
      expect(readRepoSignals(f('backend/a.ts', 'frontend/a.tsx')).practices.full_stack).toBe(true);
    });

    it('says nothing about whether any practice is done WELL', () => {
      // The tree carries paths, not content. An empty test file and a thorough suite are
      // indistinguishable here, so every field is a boolean presence and no field grades.
      const s = readRepoSignals(f('src/a.test.ts', 'Dockerfile', 'README.md'));
      const serialized = JSON.stringify(s);
      for (const word of ['quality', 'score', 'coverage', 'passing', 'good', 'rating']) {
        expect(serialized.toLowerCase()).not.toContain(word);
      }
      expect(typeof s.practices.tested).toBe('boolean');
    });
  });

  describe('structure', () => {
    it('lists top-level directories, sorted', () => {
      const s = readRepoSignals(f('backend/a.ts', 'frontend/b.tsx', 'docs/c.md'));
      expect(s.structure).toEqual(['backend', 'docs', 'frontend']);
    });

    it('drops build output and tooling nobody wants to read about', () => {
      const s = readRepoSignals(f('node_modules/x/a.js', 'dist/a.js', 'coverage/a.html',
        '.github/workflows/ci.yml', 'backend/a.ts'));
      expect(s.structure).toEqual(['backend']);
    });

    it('does not mistake a root file for a directory', () => {
      expect(readRepoSignals(f('README.md', 'backend/a.ts')).structure).toEqual(['backend']);
    });
  });

  it('counts files, not directory entries', () => {
    const s = readRepoSignals([
      { path: 'backend', type: 'tree' },
      { path: 'backend/a.ts', type: 'blob' },
      { path: 'backend/b.ts', type: 'blob' },
    ]);
    expect(s.file_count).toBe(2);
  });

  it('degrades on junk instead of throwing', () => {
    for (const bad of [null, undefined, 'nope', 42, {}, [null], [{}], [{ path: 7 }]]) {
      expect(() => readRepoSignals(bad as any)).not.toThrow();
      expect(readRepoSignals(bad as any).file_count).toBe(0);
    }
  });

  it('is pure: same tree, identical signals', () => {
    const tree = f('backend/a.ts', 'backend/b.ts', 'backend/c.ts', 'frontend/d.tsx',
      'Dockerfile', 'README.md');
    expect(readRepoSignals(tree)).toEqual(readRepoSignals(tree));
  });
});

describe('hasEnoughSignal', () => {
  it('is false for a repo with nothing to say', () => {
    // "Nothing to say yet" is honest. A padded sentence is what costs the reader's belief
    // in everything else on the page.
    expect(hasEnoughSignal(readRepoSignals(f('README.md')))).toBe(false);
    expect(hasEnoughSignal(readRepoSignals([]))).toBe(false);
  });

  it('is true once there is real material', () => {
    const s = readRepoSignals(f('backend/a.ts', 'backend/b.ts', 'backend/c.ts',
      'frontend/d.tsx', 'frontend/e.tsx', 'README.md'));
    expect(hasEnoughSignal(s)).toBe(true);
  });
});
