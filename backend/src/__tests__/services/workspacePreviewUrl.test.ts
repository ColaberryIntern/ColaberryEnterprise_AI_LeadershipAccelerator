import { buildViewAsWorkspaceUrl } from '../../services/timeline/workspacePreviewUrl';

describe('buildViewAsWorkspaceUrl (admin read-only "open the workspace" deep-link)', () => {
  test('puts the token in the hash and deep-links to the card runtime via an encoded next', () => {
    const url = buildViewAsWorkspaceUrl('https://enterprise.colaberry.ai', 'JWT123', 'card-abc');
    expect(url).toBe(
      'https://enterprise.colaberry.ai/portal/view-as#t=JWT123&next=%2Fportal%2Fruntime%2Fcard-abc',
    );
    // The token must NOT leak into a query string (logs/referrers) — hash only.
    expect(url).not.toContain('?t=');
    expect(url.split('#')[1]).toContain('t=JWT123');
  });

  test('strips a trailing slash from the base', () => {
    expect(buildViewAsWorkspaceUrl('https://x.example/', 'T', 'c')).toBe(
      'https://x.example/portal/view-as#t=T&next=%2Fportal%2Fruntime%2Fc',
    );
  });

  test('falls back to the prod origin when the base is empty', () => {
    expect(buildViewAsWorkspaceUrl('', 'T', 'c')).toBe(
      'https://enterprise.colaberry.ai/portal/view-as#t=T&next=%2Fportal%2Fruntime%2Fc',
    );
  });

  test('the next target round-trips through decodeURIComponent to the runtime path', () => {
    const url = buildViewAsWorkspaceUrl('https://e.co', 'T', 'xyz-1');
    const next = decodeURIComponent(url.split('next=')[1]);
    expect(next).toBe('/portal/runtime/xyz-1');
    // PortalViewAsPage only honors internal /portal/ paths — this one qualifies.
    expect(/^\/portal\/[^/]/.test(next)).toBe(true);
  });
});
