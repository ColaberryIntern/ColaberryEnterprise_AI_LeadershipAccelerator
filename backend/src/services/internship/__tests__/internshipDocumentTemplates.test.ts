/**
 * The offer-letter package: what it says, who gets which pages, and the two
 * statements it must never make.
 */
import {
  DOCUMENT_TEMPLATES,
  TEMPLATE_KEYS,
  documentTemplate,
  interpolate,
  isTemplateKey,
  requiredTemplatesFor,
  type DocumentFacts,
} from '../internshipDocumentTemplates';

const FACTS: DocumentFacts = {
  legal_name: 'Ada Lovelace',
  document_public_id: 'AB3CD-EF7HJ',
  generated_on: '2026-09-09',
  template_version: 1,
  start_on: '2026-09-14',
  weekly_hours: 25,
  max_active_projects: 2,
  membership_monthly_annual: '$149',
  membership_monthly_monthly: '$199',
  tooling_monthly_estimate: '$30',
  conditions: 'Set up your API key before orientation.',
};

const allText = (key: typeof TEMPLATE_KEYS[number]): string => {
  const t = documentTemplate(key);
  return [
    t.title,
    ...t.sections.flatMap((s) => [s.heading ?? '', ...s.body, ...(s.bullets ?? [])]),
  ].map((line) => interpolate(line, FACTS)).join('\n');
};

describe('every template is complete', () => {
  it.each(TEMPLATE_KEYS)('%s has a title, a version and content', (key) => {
    const t = documentTemplate(key);
    expect(t.title.length).toBeGreaterThan(5);
    expect(t.version).toBeGreaterThanOrEqual(1);
    expect(t.sections.length).toBeGreaterThan(0);
    expect(t.why.length).toBeGreaterThan(10);
  });

  it('gives every signature document a place to sign', () => {
    for (const key of TEMPLATE_KEYS) {
      const t = documentTemplate(key);
      if (!t.requires_signature) continue;
      expect(allText(key)).toMatch(/Signed:/);
    }
  });

  it('prints the identifiers on every document, not only in metadata', () => {
    // A reviewer holding a printed page must be able to tie it back to a row.
    for (const key of TEMPLATE_KEYS) {
      const text = allText(key);
      expect(text).toContain('AB3CD-EF7HJ');
      expect(text).toContain('2026-09-09');
      expect(text).toMatch(/Template version 1/);
    }
  });
});

describe('the two things the letter must not imply', () => {
  it('never implies employment', () => {
    const offer = allText('unpaid_internship_offer');
    expect(offer).toMatch(/does not create an employment relationship/i);
    expect(offer).toMatch(/any entitlement to wages, benefits/i);

    // 'salary' DOES appear, and must — the letter disclaims paying one. So this
    // asserts on the words that would imply a job EXISTS, not on whether
    // compensation is mentioned at all. An earlier version of this test banned
    // the word outright and failed on the disclaimer itself.
    expect(offer).not.toMatch(/\byour employer\b/i);
    expect(offer).not.toMatch(/\b(employment agreement|offer of employment|payroll)\b/i);
    expect(offer).toMatch(/does not pay a stipend, salary, or other compensation/i);
  });

  it('says "unpaid" AND says what it costs, in the same document', () => {
    // "Unpaid" alone reads as "free". Both facts have to travel together.
    const offer = allText('unpaid_internship_offer');
    expect(offer).toMatch(/does not pay a stipend/i);
    expect(offer).toContain('$149');
    expect(offer).toContain('$199');
    expect(offer).toMatch(/waived/i);
  });
});

describe('credentials', () => {
  it('tells the applicant never to share a key, and never asks for one', () => {
    const offer = allText('unpaid_internship_offer');
    expect(offer).toMatch(/never share a password, API key/i);
    expect(offer).toMatch(/We will never ask you for one/i);
    // No document asks for a value.
    for (const key of TEMPLATE_KEYS) {
      expect(allText(key)).not.toMatch(/enter your (api key|password)/i);
      expect(allText(key)).not.toMatch(/provide your (api key|password)/i);
    }
  });
});

describe('manual signing only', () => {
  it('instructs printing and hand-signing, and offers no e-signature', () => {
    const offer = allText('unpaid_internship_offer');
    expect(offer).toMatch(/Print this letter, sign and date it by hand/i);
    for (const key of TEMPLATE_KEYS) {
      expect(allText(key)).not.toMatch(/click to sign|e-sign|electronic signature/i);
    }
  });
});

describe('which pages a given applicant gets', () => {
  it('always includes the offer, the IP agreement and the acknowledgement', () => {
    const keys = requiredTemplatesFor({ hasConditions: false });
    expect(keys).toEqual([
      'unpaid_internship_offer', 'ip_agreement', 'acceptance_acknowledgement',
    ]);
  });

  it('adds the addendum only when conditions were recorded', () => {
    expect(requiredTemplatesFor({ hasConditions: true }))
      .toContain('conditional_approval_addendum');
    expect(requiredTemplatesFor({ hasConditions: false }))
      .not.toContain('conditional_approval_addendum');
  });

  it.each(['cpt', 'opt', 'ead', 'university_placement', 'unsure'])(
    'adds the work-authorisation page for %s',
    (wa) => {
      expect(requiredTemplatesFor({ workAuthCategory: wa, hasConditions: false }))
        .toContain('work_authorization_request');
    },
  );

  it('does not add it for "none"', () => {
    expect(requiredTemplatesFor({ workAuthCategory: 'none', hasConditions: false }))
      .not.toContain('work_authorization_request');
  });

  it('includes "unsure" deliberately — that is exactly who needs the page', () => {
    expect(requiredTemplatesFor({ workAuthCategory: 'unsure', hasConditions: false }))
      .toContain('work_authorization_request');
  });

  it('is case-insensitive about the category', () => {
    expect(requiredTemplatesFor({ workAuthCategory: 'OPT', hasConditions: false }))
      .toContain('work_authorization_request');
  });

  it('the work-authorisation page needs no signature — it is instructions', () => {
    expect(DOCUMENT_TEMPLATES.work_authorization_request.requires_signature).toBe(false);
  });
});

describe('interpolation', () => {
  it('substitutes every known placeholder', () => {
    expect(interpolate('Dear {{legal_name}},', FACTS)).toBe('Dear Ada Lovelace,');
    expect(interpolate('{{membership_monthly_annual}} a month', FACTS)).toBe('$149 a month');
  });

  it('leaves an unresolved placeholder VISIBLE rather than blanking it', () => {
    // A blanked placeholder produces "Membership is  a month", which reads as a
    // typo and gets signed. A visible {{marker}} is obviously a bug.
    const missing: DocumentFacts = { ...FACTS, conditions: null };
    expect(interpolate('Conditions: {{conditions}}', missing)).toBe('Conditions: {{conditions}}');
    expect(interpolate('{{not_a_real_field}}', FACTS)).toBe('{{not_a_real_field}}');
  });

  it('substitutes the conditions when they exist', () => {
    expect(interpolate('{{conditions}}', FACTS)).toBe('Set up your API key before orientation.');
  });

  it('renders the addendum with real conditions rather than a marker', () => {
    expect(allText('conditional_approval_addendum'))
      .toContain('Set up your API key before orientation.');
  });
});

describe('isTemplateKey', () => {
  it('rejects anything not a template', () => {
    expect(isTemplateKey('unpaid_internship_offer')).toBe(true);
    expect(isTemplateKey('offer')).toBe(false);
    expect(isTemplateKey('__proto__')).toBe(false);
    expect(isTemplateKey(null)).toBe(false);
  });
});
