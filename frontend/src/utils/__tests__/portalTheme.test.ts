import { applySavedPortalTheme, PORTAL_THEME_KEY } from '../portalTheme';

const store = (v: string | null) => ({ getItem: (k: string) => (k === PORTAL_THEME_KEY ? v : null) });

describe('applySavedPortalTheme', () => {
  let root: HTMLElement;
  beforeEach(() => { root = document.createElement('html'); });

  it('applies a saved dark or light theme on portal routes', () => {
    expect(applySavedPortalTheme('/portal/library', store('dark'), root)).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    expect(applySavedPortalTheme('/portal', store('light'), root)).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('never touches the public site or the admin app, even with dark saved', () => {
    for (const p of ['/', '/enroll', '/admin/dashboard', '/portalx', '/portal-preview']) {
      const r = document.createElement('html');
      expect(applySavedPortalTheme(p, store('dark'), r)).toBeNull();
      expect(r.hasAttribute('data-theme')).toBe(false);
    }
  });

  it('ignores a missing or junk value', () => {
    expect(applySavedPortalTheme('/portal/today', store(null), root)).toBeNull();
    expect(applySavedPortalTheme('/portal/today', store('purple'), root)).toBeNull();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('survives storage that throws or is unavailable', () => {
    const throwing = { getItem: () => { throw new Error('SecurityError'); } };
    expect(applySavedPortalTheme('/portal/today', throwing, root)).toBeNull();
    expect(applySavedPortalTheme('/portal/today', null, root)).toBeNull();
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
