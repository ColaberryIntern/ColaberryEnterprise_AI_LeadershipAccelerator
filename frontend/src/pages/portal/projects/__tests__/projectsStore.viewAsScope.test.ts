/**
 * DEFECT (reported 2026-10-19): opening "View as kalkidankin@gmail.com" showed
 * the ADMIN's builds under her name and points. The server was never wrong —
 * she has zero projects and the admin has three — but the project cache lived
 * in one flat localStorage key per browser, so the cache answered first and the
 * page believed it.
 *
 * The cache is now scoped to the subject of the token the page is using, and a
 * view-as preview is kept in sessionStorage so one member's builds are not
 * parked in an admin's browser by a feature whose banner promises read-only.
 */
import { loadProjects, hydrateProjects } from '../projectsStore';
import { VIEW_AS_TOKEN_KEY, PARTICIPANT_TOKEN_KEY } from '../../../../utils/participantToken';

const LEGACY_KEY = 'te_projects_v1';
const KEY_PREFIX = 'te_projects_v1__';

const ADMIN_SUB = 'aced5b39-0b47-496a-b172-e1f5c042bf8a';   // real enrollment ids
const MEMBER_SUB = '624be53e-c2ee-4d24-ae52-4a591da1787f';

/** A token the store can read claims out of. Only the payload matters here. */
function tok(sub: string): string {
  return `h.${btoa(JSON.stringify({ sub, read_only: true }))}.s`;
}

const stored = (name: string) => ({
  id: `p-${name}`, name, slug: name.toLowerCase().replace(/\s+/g, '-'),
  descriptor: 'A build', accent: '#000', cover: '', icon: '', status: 'active',
  createdAt: 1755012345678, stage: 'Step 1', curStep: 1, size: 'standard', idea: 'x',
  reqs: [], lists: [], activity: [], preview: {}, weeks: 12,
});

/** The admin's own builds, as they sit in a browser that has used the portal. */
const ADMIN_BUILDS = [stored('PropertyPulse AI'), stored('Regional Medical Courier System')];
const mine = () => loadProjects().filter((p) => !p.sample).map((p) => p.name);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

describe('viewing as another member', () => {
  it('does NOT show the admin builds sitting in this browser', () => {
    // Exactly the reported state: the admin has used this browser, then opens
    // a view-as tab for a member who has no builds at all.
    localStorage.setItem(LEGACY_KEY, JSON.stringify(ADMIN_BUILDS));
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok(MEMBER_SUB));

    expect(mine()).toEqual([]);
  });

  it('does not show them even when the admin has a namespaced slot', () => {
    localStorage.setItem(KEY_PREFIX + ADMIN_SUB, JSON.stringify(ADMIN_BUILDS));
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok(ADMIN_SUB));
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok(MEMBER_SUB));

    expect(mine()).toEqual([]);
  });

  it('leaves the admin own cache untouched', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(ADMIN_BUILDS));
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok(MEMBER_SUB));

    loadProjects();
    // The preview must not adopt, move or clear what belongs to this browser.
    expect(JSON.parse(localStorage.getItem(LEGACY_KEY) || '[]')).toHaveLength(2);
  });

  it('keeps the preview in sessionStorage, not the admin localStorage', () => {
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok(MEMBER_SUB));
    hydrateProjects([stored('Her Build')] as never);

    expect(sessionStorage.getItem(KEY_PREFIX + MEMBER_SUB)).toContain('Her Build');
    const leaked = Object.keys(localStorage).filter((k) => k.startsWith('te_projects_v1'));
    expect(leaked).toEqual([]);
  });

  it('shows the member their OWN builds when the preview has them', () => {
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok(MEMBER_SUB));
    sessionStorage.setItem(KEY_PREFIX + MEMBER_SUB, JSON.stringify([stored('Her Build')]));

    expect(mine()).toEqual(['Her Build']);
  });
});

describe('a normal signed-in session', () => {
  it('adopts the existing flat cache once, so nobody loses a build', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(ADMIN_BUILDS));
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok(ADMIN_SUB));

    expect(mine()).toEqual(['PropertyPulse AI', 'Regional Medical Courier System']);
    // Moved rather than copied: a second identity must not find it later.
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(KEY_PREFIX + ADMIN_SUB)).toContain('PropertyPulse AI');
  });

  it('keeps two identities in the same browser apart', () => {
    localStorage.setItem(KEY_PREFIX + ADMIN_SUB, JSON.stringify(ADMIN_BUILDS));
    localStorage.setItem(KEY_PREFIX + MEMBER_SUB, JSON.stringify([stored('Her Build')]));

    localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok(ADMIN_SUB));
    expect(mine()).toContain('PropertyPulse AI');

    localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok(MEMBER_SUB));
    expect(mine()).toEqual(['Her Build']);
  });

  it('does not adopt a second time once the student has their own slot', () => {
    localStorage.setItem(KEY_PREFIX + ADMIN_SUB, JSON.stringify([stored('Her Build')]));
    localStorage.setItem(LEGACY_KEY, JSON.stringify(ADMIN_BUILDS));
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok(ADMIN_SUB));

    expect(mine()).toEqual(['Her Build']);
    // The flat key is left alone rather than silently overwriting the real slot.
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });
});

describe('signed out', () => {
  it('still reads the flat key, so nothing changes before sign-in', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(ADMIN_BUILDS));
    expect(mine()).toEqual(['PropertyPulse AI', 'Regional Medical Courier System']);
  });
});
