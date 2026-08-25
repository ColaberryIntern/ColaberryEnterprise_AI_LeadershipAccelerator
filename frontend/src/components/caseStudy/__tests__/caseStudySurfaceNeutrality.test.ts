import fs from 'fs';
import path from 'path';
import {
  CASE_STUDY_SURFACE_KEYS,
  CASE_STUDY_SURFACES,
  caseStudyDetailPath,
  resolveCaseStudySurfaceProfile,
} from '../../../config/caseStudySurfaces';

/**
 * The future-surface claim, made checkable.
 *
 * Spec section 21 says these components will render a second surface later. That
 * is easy to say and easy to quietly break: one `if (surface === 'enterprise')`
 * inside a card, and "add a surface" becomes "re-audit every component". The
 * promise is only real while NO component contains a surface name at all.
 *
 * So this reads the module's own source and fails if any of the four keys
 * appears anywhere outside the config file - in code, in a string, or in a
 * comment. Comments are included on purpose: a comment that says "on the
 * <surface> page we do X" is documentation of an assumption that was made, and
 * the next person will act on it.
 *
 * The scan covers the API client too, because a client that put a surface in a
 * query string would move the decision from the server (which resolves it from
 * the request) to whichever page happened to call it.
 */

const COMPONENT_DIR = path.join(__dirname, '..');
const SERVICES_DIR = path.join(__dirname, '..', '..', '..', 'services');
const CONFIG_FILE = path.join(__dirname, '..', '..', '..', 'config', 'caseStudySurfaces.ts');

const SURFACE_WORDS = ['enterprise', 'training', 'ai-flotation', 'refactored'] as const;

interface Scanned {
  readonly label: string;
  readonly text: string;
}

const componentFiles = fs
  .readdirSync(COMPONENT_DIR)
  .filter((file) => file.endsWith('.tsx') || file.endsWith('.ts'))
  .sort();

const scanned: Scanned[] = [
  ...componentFiles.map((file) => ({
    label: `components/caseStudy/${file}`,
    text: fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8'),
  })),
  ...['caseStudyApi.ts', 'caseStudyPublicTypes.ts'].map((file) => ({
    label: `services/${file}`,
    text: fs.readFileSync(path.join(SERVICES_DIR, file), 'utf8'),
  })),
];

describe('no component or client names a surface', () => {
  it('scans every file in the module, so the rule cannot pass by scanning nothing', () => {
    expect(componentFiles.length).toBe(10);
    expect(scanned.length).toBe(12);
  });

  it.each(SURFACE_WORDS)('never mentions "%s"', (word) => {
    const offenders = scanned
      .filter((file) => file.text.toLowerCase().includes(word))
      .map((file) => file.label);
    expect(offenders).toEqual([]);
  });

  it('sends no surface parameter on the wire', () => {
    const client = scanned.find((f) => f.label.endsWith('caseStudyApi.ts'));
    expect(client).toBeDefined();
    expect(client?.text).not.toMatch(/surface_key|surfaceKey\s*[:=]/);
  });
});

describe('the config file is where the surface names live', () => {
  const config = fs.readFileSync(CONFIG_FILE, 'utf8');

  it.each(SURFACE_WORDS)('declares "%s"', (word) => {
    expect(config.toLowerCase()).toContain(word);
  });

  it('exposes all four keys through the vocabulary export', () => {
    expect([...CASE_STUDY_SURFACE_KEYS].sort()).toEqual(
      ['ai-flotation', 'enterprise', 'refactored', 'training'],
    );
  });

  it('gives every key a profile', () => {
    for (const key of CASE_STUDY_SURFACE_KEYS) {
      expect(CASE_STUDY_SURFACES[key].key).toBe(key);
      expect(CASE_STUDY_SURFACES[key].label.length).toBeGreaterThan(0);
    }
  });

  it('routes exactly one surface today, and gives the rest no path to link to', () => {
    const routed = CASE_STUDY_SURFACE_KEYS.filter((key) => CASE_STUDY_SURFACES[key].routed);
    expect(routed.length).toBe(1);
    for (const key of CASE_STUDY_SURFACE_KEYS) {
      const profile = CASE_STUDY_SURFACES[key];
      if (profile.routed) {
        expect(profile.indexPath).toMatch(/^\//);
        expect(caseStudyDetailPath(profile, 'a-slug')).toBe(`${profile.detailPathPrefix}/a-slug`);
      } else {
        // An unrouted surface has no string an anchor could be built from, so a
        // link to a page that does not exist cannot be produced by accident.
        expect(profile.indexPath).toBeNull();
        expect(caseStudyDetailPath(profile, 'a-slug')).toBeNull();
      }
    }
  });

  it('resolves an unknown or missing key to the routed default rather than crashing', () => {
    for (const input of [null, undefined, '', 'not-a-surface']) {
      expect(resolveCaseStudySurfaceProfile(input).routed).toBe(true);
    }
  });

  it('carries both empty states, and neither one invents a reason', () => {
    const profile = resolveCaseStudySurfaceProfile(null);
    expect(profile.emptyFiltered).toBe('No published projects match these filters.');
    expect(profile.emptyLibrary).toContain('verifying the first project records');
    for (const copy of [profile.emptyFiltered, profile.emptyLibrary]) {
      // Spec section 22: never invent an NDA explanation for an empty shelf.
      expect(copy.toLowerCase()).not.toContain('nda');
      expect(copy.toLowerCase()).not.toContain('confidential');
    }
  });
});
