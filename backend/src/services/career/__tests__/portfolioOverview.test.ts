import { composeAbout, composeStats, yearsOfExperience } from '../portfolioOverview';

const AT = new Date('2026-09-03T00:00:00.000Z');

const role = (over: Partial<any> = {}) => ({
  company: 'Colaberry', title: 'BI / Support', start: '2020-09', end: null,
  location: null, summary: null, highlights: [], ...over,
});

/**
 * This composer exists so the About paragraph can never invent a seniority, a metric or a
 * title. The cases that matter are therefore the ones with missing facts: the test is
 * whether it stays SILENT rather than filling a gap.
 */
describe('yearsOfExperience', () => {
  it('measures from the earliest stated start to today', () => {
    expect(yearsOfExperience([role({ start: '2020-09' }), role({ start: '2018' })], AT)).toBe(8);
  });

  it('is null when no role carries a date, rather than 0', () => {
    // "0 years experience" beside a career is worse than no tile at all.
    expect(yearsOfExperience([role({ start: null })], AT)).toBeNull();
    expect(yearsOfExperience([], AT)).toBeNull();
  });

  it('never returns 0 for a role that started this year', () => {
    expect(yearsOfExperience([role({ start: '2026-01' })], AT)).toBe(1);
  });

  it('refuses an implausible span instead of printing it', () => {
    expect(yearsOfExperience([role({ start: '1850' })], AT)).toBeNull();
  });
});

describe('composeStats', () => {
  const input = {
    fullName: 'Farhat Beig', experience: [role()], capabilityCount: 3,
    filesCommitted: 102, evidenceRecords: 63,
  };

  it('carries the four tiles', () => {
    expect(composeStats(input, AT)).toEqual({
      years_experience: 6, files_committed: 102, capabilities: 3, evidence_records: 63,
    });
  });

  it('nulls anything absent, zero or negative so no tile renders', () => {
    const out = composeStats({
      fullName: 'X', experience: [], capabilityCount: 0,
      filesCommitted: 0, evidenceRecords: -4,
    }, AT);
    expect(out).toEqual({
      years_experience: null, files_committed: null, capabilities: null, evidence_records: null,
    });
  });

  it('ignores a non-numeric count rather than rendering NaN', () => {
    const out = composeStats({
      fullName: 'X', experience: [], capabilityCount: 2,
      filesCommitted: 'lots' as any, evidenceRecords: undefined,
    }, AT);
    expect(out.files_committed).toBeNull();
    expect(out.evidence_records).toBeNull();
    expect(out.capabilities).toBe(2);
  });
});

describe('composeAbout', () => {
  it('states the current role, employer and start date', () => {
    const [first] = composeAbout({
      fullName: 'Farhat Beig', headline: 'BI / Support', company: 'Colaberry',
      experience: [role()], capabilityCount: 0,
    });
    expect(first).toBe('Farhat Beig has worked in BI / Support at Colaberry since September 2020.');
  });

  it('drops "since" when the role is not current', () => {
    const [first] = composeAbout({
      fullName: 'Ada L', headline: 'Analyst', company: 'Acme',
      experience: [role({ end: '2023' })], capabilityCount: 0,
    });
    expect(first).toBe('Ada L works in Analyst at Acme.');
  });

  it('names the project and its real size, and omits the size when unknown', () => {
    const withSize = composeAbout({
      fullName: 'Farhat Beig', headline: 'BI / Support', company: 'Colaberry',
      experience: [role()], capabilityCount: 0,
      projectName: 'AI Support Workflow Assistant', filesCommitted: 102,
    })[0];
    expect(withSize).toContain('a 102 file repository');

    const noSize = composeAbout({
      fullName: 'Farhat Beig', headline: 'BI / Support', company: 'Colaberry',
      experience: [role()], capabilityCount: 0,
      projectName: 'AI Support Workflow Assistant',
    })[0];
    expect(noSize).toContain('built AI Support Workflow Assistant.');
    expect(noSize).not.toContain('repository');
  });

  it('says nothing at all when there is nothing to say', () => {
    expect(composeAbout({ fullName: 'Nobody', experience: [], capabilityCount: 0 })).toEqual([]);
  });

  it('makes no claim about quality or seniority', () => {
    const text = composeAbout({
      fullName: 'Farhat Beig', headline: 'BI / Support', company: 'Colaberry',
      experience: [role()], capabilityCount: 3,
      projectName: 'AI Support Workflow Assistant', filesCommitted: 102,
    }).join(' ');
    for (const word of ['senior', 'expert', 'led', 'architected', 'excellent', 'skilled']) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });

  it('pluralises the capability sentence correctly', () => {
    const one = composeAbout({
      fullName: 'A', experience: [], capabilityCount: 1,
    }).join(' ');
    expect(one).toContain('1 capability is');
    const many = composeAbout({
      fullName: 'A', experience: [], capabilityCount: 4,
    }).join(' ');
    expect(many).toContain('4 capabilities are');
  });
});

/**
 * The descriptor guard. `content_json->system->descriptor` is not a one-line summary
 * despite the name - it is the WHOLE deliverable document, and on 2026-09-03 this
 * composer published its opening lines verbatim into a live public About block. These
 * are regression cases against the real value.
 */
describe('composeAbout descriptor guard', () => {
  const withDescriptor = (projectDescriptor: string) => composeAbout({
    fullName: 'Ali Muwwakkil', headline: 'Managing Director',
    experience: [role()], capabilityCount: 2, projectDescriptor,
  }).join(' | ');

  it('refuses the actual markdown document seen in production', () => {
    const out = withDescriptor(`# Enterprise AI Strategy - Executive Deliverable

**Organization:** Colaberry Enterprise AI Accelerator
**Industry:** Education Technology / AI Training`);
    expect(out).not.toContain('#');
    expect(out).not.toContain('**');
    expect(out).not.toContain('Organization:');
  });

  it('refuses anything carrying a line break, rather than truncating it', () => {
    // The first 200 characters of a document is still a document.
    expect(withDescriptor('A tidy first line.' + String.fromCharCode(10) + 'A second one.'))
      .not.toContain('A tidy first line');
  });

  it('refuses markdown even on a single line', () => {
    expect(withDescriptor('# A heading')).not.toContain('A heading');
    expect(withDescriptor('- a bullet')).not.toContain('a bullet');
    expect(withDescriptor('**bold lead**')).not.toContain('bold lead');
  });

  it('refuses a descriptor too long to be a sentence', () => {
    expect(withDescriptor('x'.repeat(400))).not.toContain('xxx');
  });

  it('accepts a genuine one-line descriptor', () => {
    const out = withDescriptor('A triage assistant that drafts support notes from ticket threads.');
    expect(out).toContain('A triage assistant that drafts support notes');
  });
});
