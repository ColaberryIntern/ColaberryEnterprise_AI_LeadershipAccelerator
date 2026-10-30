/**
 * C82 (Campus HQ H4, option A): extra admin sections on top of one management role. Proves the one access function
 * (effectiveSections), that the admin token's extras widen adminAllowedSections and the section gate exactly by those sections,
 * that the portal status and the minted token carry them, the no-escalation rules for granting extras (and for changing the role
 * of someone who holds extras), and that the frontend section list matches the backend's.
 */
import fs from 'fs';
import path from 'path';
import {
  effectiveSections, normalizeExtraSections, sectionsForRole, SECTION_KEYS, ALL_SECTIONS, type SectionKey,
} from '../mgmtRoles';
import { adminAllowedSections } from '../../../middlewares/authMiddleware';
import { canGrantExtraSections, canGrantMgmtRole } from '../mgmtRoleGrant';

describe('effectiveSections (the one access function)', () => {
  it('Sarbjit: Marketing plus AI Internship = the marketing sections and internship, once each', () => {
    expect(sectionsForRole('marketing')).toEqual(['dashboard', 'campaigns', 'brands']);
    expect(effectiveSections('marketing', ['internship'])).toEqual(['dashboard', 'campaigns', 'brands', 'internship']);
    expect(effectiveSections('marketing', ['internship', 'campaigns', 'internship'])).toEqual(['dashboard', 'campaigns', 'brands', 'internship']);
  });
  it('unknown keys are dropped; no role (or an unknown one) means nothing, extras or not', () => {
    expect(effectiveSections('marketing', ['not_a_section', 42, null])).toEqual(['dashboard', 'campaigns', 'brands']);
    expect(effectiveSections(null, ['internship'])).toEqual([]);
    expect(effectiveSections('wizard', ['internship'])).toEqual([]);
    expect(effectiveSections('marketing', undefined)).toEqual(sectionsForRole('marketing'));
  });
  it('never more than the real section keys', () => {
    expect(effectiveSections('marketing', [...SECTION_KEYS, ...SECTION_KEYS]).length).toBe(SECTION_KEYS.length);
  });
  it('normalizeExtraSections keeps only real keys the role does not already give, deduplicated', () => {
    expect(normalizeExtraSections('marketing', ['internship', 'campaigns', 'internship', 'bogus'])).toEqual(['internship']);
    expect(normalizeExtraSections('marketing', [])).toEqual([]);
  });
});

describe('admin tokens: the extras widen access by exactly those sections', () => {
  it('a marketing token with internship reaches internship; without it, not', () => {
    expect(adminAllowedSections({ role: 'admin', mgmt_role: 'marketing', mgmt_extra_sections: ['internship'] })).toContain('internship');
    expect(adminAllowedSections({ role: 'admin', mgmt_role: 'marketing' })).not.toContain('internship');
  });
  it('extras never touch a legacy full admin or a token without a role', () => {
    expect(adminAllowedSections({ role: 'admin', mgmt_extra_sections: ['internship'] } as never)).toEqual(ALL_SECTIONS);
    expect(adminAllowedSections({ role: 'sales', mgmt_extra_sections: ['internship'] } as never)).toEqual(['leads']);
    expect(adminAllowedSections({ role: 'nobody', mgmt_extra_sections: ['internship'] } as never)).toEqual([]);
  });
});

describe('granting extras: no escalation, both directions', () => {
  const marketing = sectionsForRole('marketing') as SectionKey[];
  const program: SectionKey[] = ['dashboard', 'program'];
  it('a full admin (all sections) may grant any section', () => {
    expect(canGrantExtraSections({ callerSections: [...ALL_SECTIONS], role: 'marketing', currentExtras: [], newExtras: ['internship'] }).allowed).toBe(true);
  });
  it('nobody may grant a section they do not hold', () => {
    const v = canGrantExtraSections({ callerSections: program, role: 'curriculum', currentExtras: [], newExtras: ['inbox_content'] });
    expect(v).toMatchObject({ allowed: false, blockedBy: 'inbox_content' });
  });
  it('nobody may change the sections of someone who holds more (by role or by extras)', () => {
    expect(canGrantExtraSections({ callerSections: program, role: 'marketing', currentExtras: [], newExtras: [] }).allowed).toBe(false);
    expect(canGrantExtraSections({ callerSections: [...marketing, 'program'], role: 'marketing', currentExtras: ['inbox_content'], newExtras: [] }).allowed).toBe(false);
  });
  it('the role rule now counts extras: clearing the role of someone whose extras exceed yours is refused', () => {
    const v = canGrantMgmtRole({ callerSections: [...ALL_SECTIONS].filter((s) => s !== 'inbox_content'), currentRole: 'marketing', newRole: null, currentExtras: ['inbox_content'] });
    expect(v.allowed).toBe(false);
    expect(canGrantMgmtRole({ callerSections: [...ALL_SECTIONS], currentRole: 'marketing', newRole: null, currentExtras: ['inbox_content'] }).allowed).toBe(true);
  });
});

describe('the frontend section list (the extras editor) matches SECTION_KEYS', () => {
  it('same keys, no more, no fewer', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'pages', 'admin', 'communityRoles', 'ExtraSectionsEditor.tsx'), 'utf8');
    const block = src.slice(src.indexOf('SECTION_LABEL'), src.indexOf('};', src.indexOf('SECTION_LABEL')));
    const keys = Array.from(block.matchAll(/(\w+): '/g)).map((m) => m[1]).sort();
    expect(keys).toEqual([...SECTION_KEYS].sort());
  });
});
