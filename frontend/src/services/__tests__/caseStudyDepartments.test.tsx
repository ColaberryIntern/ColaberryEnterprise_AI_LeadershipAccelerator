import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * W10 (approved by Ali 2026-11-16; "We need to label our dept", 2026-11-17), the browser half.
 *
 *  1. `?department=` round-trips through the /proof URL state.
 *  2. /proof shows a Department filter once any published study is tagged, with the site's own
 *     words (HR, IT & Data), and shows none while nothing is tagged.
 *  3. The header Proof menu switches from "tagging in progress" to counted department links, with
 *     the same words.
 *  4. The admin picker sends the override path and the slug list, in vocabulary order.
 */
/* eslint-disable import/first */
import { EMPTY_CASE_STUDY_FILTERS, parseCaseStudyFilters, serializeCaseStudyFilters } from '../caseStudyApi';
import { CASE_STUDY_DEPARTMENTS, departmentLabel } from '../caseStudyDepartments';
import { filterGroupsFrom } from '../../pages/publicV2/storiesV2Model';
import { buildProofMenu } from '../../components/publicV2/navMenus';
import CaseStudyDepartmentPicker from '../../components/admin/caseStudy/CaseStudyDepartmentPicker';
import type { PublicCaseStudyTaxonomyFacets } from '../caseStudyPublicTypes';
/* eslint-enable import/first */

const facets = (departments?: { slug: string; count: number }[]): PublicCaseStudyTaxonomyFacets => ({
  capabilities: [],
  industries: [{ slug: 'energy', label: 'energy', count: 2 }],
  ...(departments ? { departments: departments.map((d) => ({ ...d, label: d.slug })) } : {}),
  stack: [],
  programs: [],
  builtBy: [],
  verificationClasses: [{ slug: 'verified', count: 2 }],
});

describe('W10: ?department= in the /proof URL', () => {
  it('parses and serializes department like any list facet', () => {
    const state = parseCaseStudyFilters('?department=finance,it-data&industry=energy');
    expect(state.department).toEqual(['finance', 'it-data']);
    expect(serializeCaseStudyFilters(state).get('department')).toBe('finance,it-data');
    expect(EMPTY_CASE_STUDY_FILTERS.department).toEqual([]);
  });
});

describe('W10: the /proof Department filter', () => {
  it('appears once a study is tagged, labelled in the site words', () => {
    const groups = filterGroupsFrom(facets([{ slug: 'hr', count: 1 }, { slug: 'it-data', count: 2 }]));
    const dept = groups.find((g) => g.field === 'department');
    expect(dept).toBeDefined();
    expect(dept!.legend).toBe('Department');
    expect(dept!.options).toEqual([
      { value: 'hr', label: 'HR', count: 1 },
      { value: 'it-data', label: 'IT & Data', count: 2 },
    ]);
    const legends = groups.map((g) => g.legend);
    expect(legends.indexOf('Department')).toBe(legends.indexOf('Industry') + 1);
  });

  it('is absent while nothing is tagged, and with an older server that sends no departments', () => {
    expect(filterGroupsFrom(facets([])).some((g) => g.field === 'department')).toBe(false);
    expect(filterGroupsFrom(facets()).some((g) => g.field === 'department')).toBe(false);
  });
});

describe('W10: the header Proof menu', () => {
  it('lists counted department links in the site words', () => {
    const menu = buildProofMenu({ facets: facets([{ slug: 'it-data', count: 3 }, { slug: 'customer-service', count: 1 }]) });
    const group = menu.groups.find((g) => g.heading === 'By department')!;
    expect(group.pending).toBeUndefined();
    expect(group.links.map((l) => [l.label, l.to])).toEqual([
      ['IT & Data', '/proof?department=it-data'],
      ['Customer service', '/proof?department=customer-service'],
    ]);
  });

  it('keeps "tagging in progress" while no study is tagged', () => {
    const group = buildProofMenu({ facets: facets([]) }).groups.find((g) => g.heading === 'By department')!;
    expect(group.pending).toBeDefined();
  });

  it('labels every department of the vocabulary', () => {
    for (const d of CASE_STUDY_DEPARTMENTS) expect(departmentLabel(d.slug)).toBe(d.label);
  });
});

describe('W10: the admin department picker', () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  const box = (slug: string) => host.querySelector<HTMLInputElement>(`input[value="${slug}"]`)!;
  const apply = () => host.querySelector<HTMLButtonElement>('[data-testid="cs-departments-apply"]')!;

  it('sends taxonomy.departments with the slugs in vocabulary order', () => {
    const onApply = jest.fn();
    act(() => root.render(<CaseStudyDepartmentPicker current={[]} busy={false} onApply={onApply} />));
    expect(apply().disabled).toBe(true);
    act(() => box('it-data').click());
    act(() => box('finance').click());
    expect(apply().disabled).toBe(false);
    act(() => apply().click());
    expect(onApply).toHaveBeenCalledWith('taxonomy.departments', ['finance', 'it-data']);
  });

  it('starts from the snapshot tags, and is inert with no snapshot', () => {
    act(() => root.render(<CaseStudyDepartmentPicker current={['sales']} busy={false} disabledReason="no snapshot" onApply={jest.fn()} />));
    expect(box('sales').checked).toBe(true);
    expect(box('sales').disabled).toBe(true);
    expect(apply().disabled).toBe(true);
  });
});
