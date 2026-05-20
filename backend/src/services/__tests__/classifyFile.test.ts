/**
 * classifyFile tests (2026-05-20 walk #4 fix).
 *
 * Pre-fix, frontend/src/services/validationStore.ts got bucketed
 * as backend because:
 *   - The frontend rule checked /frontend/ as a substring; GitHub-tree
 *     paths start with "frontend/" (no leading slash) so it missed.
 *   - The backend rule checked /service as a substring, which matches
 *     /services/ — and the file lives under frontend/src/services/.
 *
 * The fix puts frontend-prefix detection FIRST and supports both
 * leading-slash and no-leading-slash forms.
 */
import { classifyFile } from '../brownfieldDiscoveryService';

describe('classifyFile (walk #4 fix)', () => {
  it('correctly buckets frontend/src/services/* as FRONTEND, not backend', () => {
    expect(classifyFile('frontend/src/services/validationStore.ts')).toBe('frontend');
    expect(classifyFile('frontend/src/services/apiClient.ts')).toBe('frontend');
  });

  it('correctly buckets backend/src/services/* as BACKEND', () => {
    expect(classifyFile('backend/src/services/leadService.ts')).toBe('backend');
    expect(classifyFile('backend/src/services/agents/openclaw/foo.ts')).toBe('agent');
  });

  it('frontend prefix wins regardless of internal /services/ etc.', () => {
    expect(classifyFile('frontend/src/components/Foo.tsx')).toBe('frontend');
    expect(classifyFile('frontend/src/pages/HomePage.tsx')).toBe('frontend');
    expect(classifyFile('frontend/src/services/utils/helpers.ts')).toBe('frontend');
  });

  it('agent files anywhere under intelligence/ or /agents/', () => {
    expect(classifyFile('backend/src/intelligence/discovery/dataProfiler.ts')).toBe('agent');
    expect(classifyFile('backend/src/services/agents/marketing/m.ts')).toBe('agent');
    expect(classifyFile('intelligence/agents/foo.ts')).toBe('agent');
  });

  it('model files under /models/, /schemas/, /migrations/', () => {
    expect(classifyFile('backend/src/models/User.ts')).toBe('model');
    expect(classifyFile('backend/migrations/0042_user.sql')).toBe('model');
  });

  it('tsx/jsx files default to frontend even without folder hint', () => {
    expect(classifyFile('any/path/Component.tsx')).toBe('frontend');
    expect(classifyFile('Component.jsx')).toBe('frontend');
  });

  it('unknown source files default to backend (fallback)', () => {
    expect(classifyFile('scripts/oneoff.ts')).toBe('backend');
    expect(classifyFile('tools/something.py')).toBe('backend');
  });

  it('non-source extensions return other', () => {
    expect(classifyFile('README.md')).toBe('other');
    expect(classifyFile('image.png')).toBe('other');
  });
});
