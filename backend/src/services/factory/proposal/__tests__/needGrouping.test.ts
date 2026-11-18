import {
  canonicalizeNeed, canonicalNeedId, deriveSubject, filterReferencesBySubject,
  normalizeAsk, GROUP_DEFS, groupLabel, subjectLabel,
} from '../needGrouping';

describe('needGrouping - canonicalizeNeed', () => {
  // The exact near-duplicate asks from Ali's live dossier screenshot. All must collapse to ONE concept.
  const pastPerfAsks = [
    'project name 1', 'project name 2', 'project name 3',
    'specific project name and details', 'specific project names and details',
    'What are the specific project names and details that align with the requirements of on-premises deployments?',
    'project name and details', 'What are the details of each project?',
    'What are the specific project names?', 'What specific project names and details should be included?',
  ];
  it.each(pastPerfAsks)('maps past-performance ask to one concept: %s', (ask) => {
    const m = canonicalizeNeed({ ask, kind: 'fact', key: `fact:${ask}` });
    expect(m.conceptId).toBe('past_performance');
    expect(m.groupSlug).toBe('past_performance');
    expect(m.groupKind).toBe('reference');
  });

  it('collapses all past-performance phrasings to a single canonical id (same subject)', () => {
    const ids = new Set(pastPerfAsks.map((ask) => canonicalNeedId(canonicalizeNeed({ ask, kind: 'fact' }), 'general')));
    expect(ids.size).toBe(1);
  });

  it('places solicitation facts into the solicitation group as distinct concepts', () => {
    expect(canonicalizeNeed({ ask: 'What is the due date for the proposal submission?' }).conceptId).toBe('due_date');
    expect(canonicalizeNeed({ ask: 'What is the due date for the submission?' }).conceptId).toBe('due_date');
    expect(canonicalizeNeed({ ask: 'client name' }).conceptId).toBe('client');
    expect(canonicalizeNeed({ ask: 'client' }).conceptId).toBe('client');
    expect(canonicalizeNeed({ ask: 'contact details' }).conceptId).toBe('contact');
    expect(canonicalizeNeed({ ask: 'email address' }).conceptId).toBe('contact');
    expect(canonicalizeNeed({ ask: 'brief description of the project' }).conceptId).toBe('project_overview');
    for (const ask of ['due date', 'client name', 'contact details', 'brief description of the project']) {
      expect(canonicalizeNeed({ ask }).groupSlug).toBe('solicitation');
    }
  });

  it('two solicitation facts stay distinct concepts (not over-merged)', () => {
    const due = canonicalNeedId(canonicalizeNeed({ ask: 'due date' }), 'general');
    const client = canonicalNeedId(canonicalizeNeed({ ask: 'client name' }), 'general');
    expect(due).not.toBe(client);
  });

  it('routes fact categories to the library buckets', () => {
    expect(canonicalizeNeed({ ask: 'Provide your UEI' }).groupSlug).toBe('registrations');
    expect(canonicalizeNeed({ ask: 'SAM.gov registration' }).groupSlug).toBe('registrations');
    expect(canonicalizeNeed({ ask: 'HUBZone certification status' }).groupSlug).toBe('socioeconomic');
    expect(canonicalizeNeed({ ask: 'ISO 9001 certification' }).groupSlug).toBe('quality_certs');
    expect(canonicalizeNeed({ ask: 'proof of insurance and bonding' }).groupSlug).toBe('financials');
    expect(canonicalizeNeed({ ask: 'labor rate card' }).groupSlug).toBe('pricing');
    expect(canonicalizeNeed({ ask: 'Representations and Certifications form' }).groupSlug).toBe('reps_certs');
  });

  it('record-kind needs group straight by recordType', () => {
    const ref = canonicalizeNeed({ ask: 'Add a past-performance reference', kind: 'record', recordType: 'reference' });
    expect(ref.groupSlug).toBe('past_performance');
    expect(ref.groupKind).toBe('reference');
    const per = canonicalizeNeed({ ask: 'Add a key person', kind: 'record', recordType: 'personnel' });
    expect(per.groupSlug).toBe('key_personnel');
    expect(per.groupKind).toBe('personnel');
  });

  it('falls back to a stable general concept for unmatched asks (exact dedupe preserved)', () => {
    const a = canonicalizeNeed({ ask: 'Describe your approach to widget calibration' });
    const b = canonicalizeNeed({ ask: 'Describe your approach to widget calibration' });
    expect(a.groupSlug).toBe('general');
    expect(a.conceptId).toBe(b.conceptId);
    const c = canonicalizeNeed({ ask: 'Something entirely different here' });
    expect(c.conceptId).not.toBe(a.conceptId);
  });
});

describe('needGrouping - deriveSubject', () => {
  it('derives the subject from requirement/solicitation context', () => {
    expect(deriveSubject('Statewide reporting and analytics dashboard')).toBe('reporting');
    expect(deriveSubject('recruiting and staffing services for the agency')).toBe('recruiting');
    expect(deriveSubject('cybersecurity assessment per NIST')).toBe('security');
    expect(deriveSubject('data engineering and ETL pipeline modernization')).toBe('data');
    expect(deriveSubject('learning management system and curriculum')).toBe('training');
    expect(deriveSubject('asset management and permitting software')).toBe('asset_mgmt');
    expect(deriveSubject('')).toBe('general');
    expect(deriveSubject('general administrative support')).toBe('general');
  });
});

describe('needGrouping - the two-axis identity (not interchangeable)', () => {
  it('same concept, different subject = different slots', () => {
    const m = canonicalizeNeed({ ask: 'Add a past-performance reference', kind: 'record', recordType: 'reference' });
    const reporting = canonicalNeedId(m, 'reporting');
    const recruiting = canonicalNeedId(m, 'recruiting');
    expect(reporting).not.toBe(recruiting);
  });
});

describe('needGrouping - filterReferencesBySubject', () => {
  const refs = [
    { client: 'City Reporting Dashboard', subject: 'reporting' },
    { client: 'Agency Recruiting Portal', subject: 'recruiting' },
    { client: 'Legacy Contract', subject: null },
  ];
  it('keeps only matching + untagged references for a subject', () => {
    const kept = filterReferencesBySubject(refs, 'reporting');
    expect(kept.map((r) => r.client)).toEqual(['City Reporting Dashboard', 'Legacy Contract']);
    expect(kept.find((r) => r.client === 'Agency Recruiting Portal')).toBeUndefined();
  });
  it('a recruiting requirement never gets the reporting reference', () => {
    const kept = filterReferencesBySubject(refs, 'recruiting');
    expect(kept.find((r) => r.subject === 'reporting')).toBeUndefined();
  });
  it('default-open: no subject (or general) returns all refs, so nothing regresses pre-tagging', () => {
    expect(filterReferencesBySubject(refs, undefined)).toHaveLength(3);
    expect(filterReferencesBySubject(refs, 'general')).toHaveLength(3);
    expect(filterReferencesBySubject(refs, '')).toHaveLength(3);
  });
  it('is null-safe', () => {
    expect(filterReferencesBySubject(undefined as unknown as typeof refs, 'reporting')).toEqual([]);
  });
});

describe('needGrouping - helpers', () => {
  it('normalizeAsk strips punctuation and bare numbers', () => {
    expect(normalizeAsk('Project Name 1!')).toBe('project name 1');
    expect(normalizeAsk('  Due   Date??  ')).toBe('due date');
  });
  it('every concept group slug is a defined taxonomy group', () => {
    const slugs = new Set(GROUP_DEFS.map((g) => g.slug));
    for (const ask of ['project name 1', 'due date', 'UEI', 'ISO 9001', 'labor rate']) {
      expect(slugs.has(canonicalizeNeed({ ask }).groupSlug)).toBe(true);
    }
  });
  it('labels resolve', () => {
    expect(groupLabel('past_performance')).toMatch(/Past projects/);
    expect(subjectLabel('reporting')).toMatch(/Reporting/);
    expect(groupLabel('unknown_slug')).toBe('unknown_slug');
  });
});
