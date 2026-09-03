import {
  normalizeExperience, normalizeEducation, isExtractableResumeText, MIN_RESUME_CHARS,
} from '../resumeHistory';

/**
 * These normalizers are the trust boundary between raw LLM output and a public page,
 * so the cases that matter are the dishonest ones: a hallucinated date, an entry with
 * nothing in it, a highlights array with fifty bullets. "It passes the happy path" is
 * not the property under test here.
 */
describe('normalizeExperience', () => {
  it('keeps a well-formed role intact', () => {
    const out = normalizeExperience([{
      company: 'Acme Lending',
      title: 'Operations Manager',
      start: '2019-03',
      end: '2022',
      location: 'Dallas, TX',
      summary: 'Ran the loan servicing desk.',
      highlights: ['Cut manual review time', 'Owned the vendor migration'],
    }]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      company: 'Acme Lending',
      title: 'Operations Manager',
      start: '2019-03',
      end: '2022',
      location: 'Dallas, TX',
      summary: 'Ran the loan servicing desk.',
      highlights: ['Cut manual review time', 'Owned the vendor migration'],
    });
  });

  it('preserves end:null as "current role" rather than dropping the entry', () => {
    const out = normalizeExperience([{ company: 'Acme', title: 'Analyst', start: '2023', end: null }]);
    expect(out[0].end).toBeNull();
    expect(out[0].start).toBe('2023');
  });

  it('nulls a date the resume did not state in a parseable form', () => {
    const out = normalizeExperience([
      { company: 'Acme', title: 'Analyst', start: 'Present', end: 'sometime in 2021' },
    ]);
    expect(out[0].start).toBeNull();
    expect(out[0].end).toBeNull();
  });

  it('rejects implausible and malformed years rather than printing them', () => {
    const out = normalizeExperience([
      { company: 'A', title: 'T', start: '0001', end: '2019-13' },
    ]);
    expect(out[0].start).toBeNull();
    expect(out[0].end).toBeNull();
  });

  it('drops an entry that is neither a company nor a title', () => {
    const out = normalizeExperience([
      { summary: 'did some things' },
      { company: '   ', title: '' },
      { company: 'Real Co', title: '' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].company).toBe('Real Co');
  });

  it('caps the number of roles and the number of highlights', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      company: 'Co' + i,
      title: 'Role',
      highlights: Array.from({ length: 10 }, (_, h) => 'highlight ' + h),
    }));
    const out = normalizeExperience(many);
    expect(out).toHaveLength(8);
    expect(out[0].highlights).toHaveLength(3);
  });

  it('truncates an overlong summary instead of publishing it whole', () => {
    const out = normalizeExperience([
      { company: 'A', title: 'T', summary: 'x'.repeat(500) },
    ]);
    expect((out[0].summary as string).length).toBeLessThanOrEqual(180);
  });

  it('collapses whitespace so a wrapped PDF line does not render as a gap', () => {
    const out = normalizeExperience([
      { company: 'Acme\n\n   Lending', title: '  Ops   Manager ' },
    ]);
    expect(out[0].company).toBe('Acme Lending');
    expect(out[0].title).toBe('Ops Manager');
  });

  it('returns [] for every not-an-array input', () => {
    expect(normalizeExperience(undefined)).toEqual([]);
    expect(normalizeExperience(null)).toEqual([]);
    expect(normalizeExperience('experience')).toEqual([]);
    expect(normalizeExperience({ company: 'A' })).toEqual([]);
  });

  it('ignores non-object and non-string members instead of throwing', () => {
    const out = normalizeExperience([null, 42, 'Acme', { company: 'Real', title: 7 }]);
    expect(out).toHaveLength(1);
    expect(out[0].company).toBe('Real');
    expect(out[0].title).toBe('');
  });

  it('is idempotent: normalizing its own output changes nothing', () => {
    const once = normalizeExperience([
      { company: 'Acme', title: 'Analyst', start: '2019', end: null, highlights: ['a', 'b'] },
    ]);
    expect(normalizeExperience(once)).toEqual(once);
  });
});

describe('normalizeEducation', () => {
  it('keeps a well-formed credential', () => {
    const out = normalizeEducation([
      { institution: 'UT Dallas', credential: 'B.S.', field: 'Computer Science', year: '2016' },
    ]);
    expect(out).toEqual([
      { institution: 'UT Dallas', credential: 'B.S.', field: 'Computer Science', year: '2016' },
    ]);
  });

  it('drops an entry with no institution, since nothing anchors it', () => {
    expect(normalizeEducation([{ credential: 'B.S.', field: 'CS' }])).toEqual([]);
  });

  it('keeps the institution when the rest is missing', () => {
    const out = normalizeEducation([{ institution: 'UT Dallas' }]);
    expect(out[0]).toEqual({
      institution: 'UT Dallas', credential: null, field: null, year: null,
    });
  });

  it('caps the list', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ institution: 'School ' + i }));
    expect(normalizeEducation(many)).toHaveLength(5);
  });

  it('is idempotent', () => {
    const once = normalizeEducation([{ institution: 'UTD', credential: 'B.S.', year: '2016' }]);
    expect(normalizeEducation(once)).toEqual(once);
  });

  it('returns [] for every not-an-array input', () => {
    expect(normalizeEducation(null)).toEqual([]);
    expect(normalizeEducation('UTD')).toEqual([]);
  });
});

/**
 * The guard that stops a filename becoming a career.
 *
 * Every string below marked "production" was read out of `onboarding_profiles` on
 * 2026-09-02. Asked to extract an employment history from them, gpt-4o-mini invented
 * one -- and invented nearly the SAME one for three different students. These are
 * regression cases, not hypotheticals.
 */
describe('isExtractableResumeText', () => {
  const REAL_PLACEHOLDERS = [
    '[Uploaded file: EMERALD A resume 2023.docx]',
    '[Uploaded file: Resume James Brown Warikandwa.pdf]',
    '[Uploaded file: Fechin Attuah Resume.pdf]',
    '[Uploaded file: Newest resume 2025.pdf]',
    '[Uploaded file: Cleveland_Sydnae_Resume_ContractAdmin_II.pdf.pdf]',
    '[Uploaded file: Resume 30.0.docx]',
    '[Uploaded file: Tom_Ogunmola_ServiceNow_BA_Resume.docx]',
    '[Uploaded file: DataProResume_YolandaPrice (1).docx]',
  ];

  it('refuses every filename placeholder found in production', () => {
    for (const p of REAL_PLACEHOLDERS) {
      expect(isExtractableResumeText(p)).toBe(false);
    }
  });

  it('refuses the placeholder whatever its casing or surrounding space', () => {
    expect(isExtractableResumeText('  [uploaded file: cv.pdf]  ')).toBe(false);
    expect(isExtractableResumeText('[UPLOADED FILE: CV.PDF]')).toBe(false);
  });

  it('refuses text too short to contain a career, and empty or absent text', () => {
    expect(isExtractableResumeText('Data Scientist, 5 years')).toBe(false);
    expect(isExtractableResumeText('')).toBe(false);
    expect(isExtractableResumeText('   ')).toBe(false);
    expect(isExtractableResumeText(null)).toBe(false);
    expect(isExtractableResumeText(undefined)).toBe(false);
    expect(isExtractableResumeText(12345)).toBe(false);
  });

  it('accepts text long enough to be a real resume', () => {
    expect(isExtractableResumeText('x'.repeat(MIN_RESUME_CHARS))).toBe(true);
    expect(isExtractableResumeText('x'.repeat(MIN_RESUME_CHARS - 1))).toBe(false);
  });

  it('does not refuse a real resume that merely mentions an uploaded file', () => {
    // The refusal is anchored to the WHOLE string, so a resume containing that phrase
    // in passing is still a resume.
    const body = 'See [Uploaded file: portfolio.pdf] for samples. ' + 'Experience. '.repeat(30);
    expect(body.length).toBeGreaterThan(MIN_RESUME_CHARS);
    expect(isExtractableResumeText(body)).toBe(true);
  });
});
