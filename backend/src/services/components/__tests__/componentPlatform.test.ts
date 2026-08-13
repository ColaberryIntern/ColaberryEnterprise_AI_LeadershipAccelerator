import { createsCycle } from '../dependencyService';
import { diffSnapshots } from '../versionDiffService';
import { templateThumbnail } from '../thumbnailService';

describe('dependencyService.createsCycle', () => {
  it('detects a direct cycle (A->B, adding B->A)', () => {
    const adj = new Map<string, string[]>([['a', ['b']], ['b', []]]);
    expect(createsCycle('b', ['a'], adj)).toBe(true);
  });
  it('detects a transitive cycle (A->B->C, adding C->A)', () => {
    const adj = new Map<string, string[]>([['a', ['b']], ['b', ['c']], ['c', []]]);
    expect(createsCycle('c', ['a'], adj)).toBe(true);
  });
  it('allows a valid DAG edge', () => {
    const adj = new Map<string, string[]>([['lab', ['deep_dive']], ['deep_dive', []], ['video', []]]);
    expect(createsCycle('lab', ['deep_dive', 'video'], adj)).toBe(false);
  });
});

describe('versionDiffService.diffSnapshots', () => {
  it('flags only the fields that changed', () => {
    const a = { label: 'X', generation_prompt: 'p1', difficulty: 'core' };
    const b = { label: 'X', generation_prompt: 'p2', difficulty: 'core' };
    const diffs = diffSnapshots(a, b);
    const gen = diffs.find((d) => d.field === 'generation_prompt')!;
    const label = diffs.find((d) => d.field === 'label')!;
    expect(gen.changed).toBe(true);
    expect(label.changed).toBe(false);
    expect(diffs.filter((d) => d.changed).length).toBe(1);
  });
});

describe('thumbnailService.templateThumbnail', () => {
  it('produces a deterministic SVG data URI', () => {
    const a = templateThumbnail({ label: 'Prompt Lab', render_band: 'promptlab', difficulty: 'core' });
    const b = templateThumbnail({ label: 'Prompt Lab', render_band: 'promptlab', difficulty: 'core' });
    expect(a).toBe(b);                                   // deterministic
    expect(a.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(templateThumbnail({ label: 'Video', render_band: 'media' })).not.toBe(a); // varies by component
  });
});
