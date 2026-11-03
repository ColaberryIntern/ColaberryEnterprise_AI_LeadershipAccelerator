/**
 * M34 - Person 360 as Maya's eyes.
 *
 * ── THE FIXTURES ARE BUILT BY THE ASSEMBLER, NOT BY THE CODE UNDER TEST ─────
 *
 * Every profile here comes from the REAL `getPersonProfile` driven through a routed `sequelize`
 * mock, which is the house pattern from `absenceIsNotZero.test.ts`. A hand-written profile
 * literal would match the module's expectations by construction, and the one property worth
 * proving - that Maya's tools read the assembler's own absent/withheld distinction correctly -
 * is exactly the property such a literal would fake.
 *
 * ── THE PII FIXTURE CARRIES PII ON PURPOSE ──────────────────────────────────
 *
 * The acquisition row below holds a phone number, a LinkedIn URL, free-text notes, an email in a
 * page URL's query string and an assigned admin. A redaction test over a fixture with nothing to
 * redact passes no matter what the code does. These values are planted so their absence from the
 * payload is a measurement.
 */
const query = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => query(...args) },
}));

import { getPersonProfile, type PersonProfile } from '../adminOs/personProfileService';
import { stagesForSection } from '../adminOs/personScope';
import { inputsFromProfile } from '../salesReadiness/srsInputs';
import { scoreReadiness } from '../salesReadiness/srsEngine';
import { PERSON_VIEWS } from '../adminOs/personViewRoles';
import {
  whoIsThisPerson, beforeTheyRegistered, sinceTheyRegistered, howReadyTheyAre,
  readEverythingAbout, subjectRef, logLineFor,
  MAYA_SECTIONS, MAYA_READ_TOOLS, NEVER_AUTHORITATIVE_FOR, PERSON_VIEW_ROLE,
  type MayaReadToolDeps, type MayaReadStatus,
} from '../mayaReadTools';

const EMAIL = 'explorer@example.com';
const NOW = '2026-11-03T06:00:00.000Z';

const IDENTITY = {
  email: EMAIL,
  name: 'Jordan Okafor',
  stage: 'lead',
  company: 'Northwind',
  title: 'Analyst',
  traced: true,
};

const ENGAGEMENT_SQL = 'array_remove(array_agg(DISTINCT vs.site_slug)';
const ACQUISITION_SQL = 'linkedin_url AS "linkedinUrl"';
const JOURNEY_SQL = 'FROM page_events';
const LEAD_IDS_SQL = 'SELECT id FROM leads WHERE lower(btrim(email))';

/** Every value here must be provably absent from every payload. */
const PII = {
  phone: '+1-214-555-0188',
  linkedinUrl: 'https://linkedin.com/in/jordan-okafor-9921',
  message: 'Call me on my cell, I am at jordan.okafor.personal@gmail.com',
  notes: 'Spoke to his wife Adaeze about the payment plan',
  pageUrl: 'https://colaberry.com/lp/ai?email=explorer%40example.com&utm_source=reddit',
  assignedAdmin: 'taiwo@colaberry.com',
};

const ACQUISITION_ROW = {
  leadId: 24945,
  source: 'reddit',
  formType: 'free_class',
  utmSource: 'reddit',
  utmCampaign: 'nov-cohort',
  interestArea: 'data engineering',
  consentContact: true,
  ...PII,
};

type Row = Record<string, unknown>;

function route(handlers: Array<[string, Row[]]>): void {
  query.mockReset();
  query.mockImplementationOnce(() => Promise.resolve([IDENTITY]));
  query.mockImplementation((sql: unknown) => {
    const s = String(sql);
    for (const [needle, rows] of handlers) {
      if (s.includes(needle)) return Promise.resolve(rows);
    }
    return Promise.resolve([]);
  });
}

async function assemble(sections: readonly string[]): Promise<PersonProfile> {
  const profile = await getPersonProfile({
    email: EMAIL, sections: [...sections], visibleEnrollmentIds: null,
  });
  if (!profile) throw new Error(`fixture error: no profile for [${sections.join(', ')}]`);
  return profile;
}

/** A person with browsing history, a lead record and journey counts. */
async function richProfile(sections: readonly string[] = MAYA_SECTIONS): Promise<PersonProfile> {
  route([
    [ACQUISITION_SQL, [ACQUISITION_ROW]],
    [ENGAGEMENT_SQL, [{
      sessions: '6', visitors: '1',
      firstSeen: '2026-09-01T00:00:00.000Z', lastSeen: '2026-10-28T00:00:00.000Z',
      sites: ['colaberry', 'training'],
    }]],
    [LEAD_IDS_SQL, [{ id: 24945 }]],
    [JOURNEY_SQL, [{
      sessions: '6', page_events: '31', campaigns: '2', emails: '9',
      first_touch: '2026-09-01T00:00:00.000Z', intent: '55',
    }]],
  ]);
  return assemble(sections);
}

/** A person who resolves and has no browsing record and no lead record. */
async function bareProfile(): Promise<PersonProfile> {
  route([
    [ENGAGEMENT_SQL, [{ sessions: '0', visitors: '0', firstSeen: null, lastSeen: null, sites: null }]],
  ]);
  return assemble(MAYA_SECTIONS);
}

function depsFor(
  profile: PersonProfile | null,
  opts: { email?: string | null } = {},
): { deps: MayaReadToolDeps; lines: Array<Record<string, unknown>> } {
  const lines: Array<Record<string, unknown>> = [];
  return {
    lines,
    deps: {
      profileFor: async () => profile,
      emailForRef: async () => (opts.email === undefined ? EMAIL : opts.email),
      now: () => NOW,
      log: (line) => { lines.push(line); },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('the instrument itself', () => {
  it('drives the REAL assembler, so every assertion below is about assembled evidence', async () => {
    const profile = await richProfile();
    // If the mock were never reached the identity row would be absent and `assemble` would throw.
    expect(profile.engagement?.sessions).toBe(6);
    expect(profile.acquisition?.source).toBe('reddit');
    expect(query.mock.calls.length).toBeGreaterThan(3);
  });

  it('CONTROL: the planted PII really is in the assembled profile', async () => {
    // Without this, the redaction tests would pass against a profile that never held PII and
    // would keep passing if the module started copying the whole panel.
    const profile = await richProfile();
    expect(profile.acquisition?.phone).toBe(PII.phone);
    expect(profile.acquisition?.notes).toBe(PII.notes);
    expect(profile.email).toBe(EMAIL);
  });
});

describe('M34: reuse is declared and machine-checked, not promised', () => {
  it('claims to delegate to the canonical assembler', () => {
    expect(PERSON_VIEW_ROLE).toBe('delegates');
    const declared = PERSON_VIEWS.find((v) => v.module === 'backend/src/services/mayaReadTools.ts');
    expect(declared).toBeDefined();
    expect(declared?.role).toBe('delegates');
    expect(declared?.delegatesTo).toBe('backend/src/services/adminOs/personProfileService.ts');
  });

  it('composes the REAL scorer rather than reimplementing it', async () => {
    const profile = await richProfile();
    const { deps } = depsFor(profile);
    const result = await howReadyTheyAre('lead:24945', deps);
    const independent = scoreReadiness(inputsFromProfile(profile), NOW);
    expect(result.data?.total).toBe(independent.total);
    expect(result.data?.coverage).toBe(independent.coverage);
    expect(result.data?.rulesetVersion).toBe(independent.rulesetVersion);
  });
});

describe('M34 criterion 1: absence is documented, never an empty-looking shape', () => {
  it('reports unknown_person when the reference resolves to nobody', async () => {
    const { deps } = depsFor(null, { email: null });
    for (const call of [whoIsThisPerson, beforeTheyRegistered, sinceTheyRegistered, howReadyTheyAre]) {
      const r = await call('lead:999999', deps);
      expect(r.status).toBe<MayaReadStatus>('unknown_person');
      expect(r.data).toBeNull();
      expect(r.reason).toContain('does not resolve');
    }
  });

  it('distinguishes WITHHELD from ABSENT, which is the distinction a score ranks on', async () => {
    // Absent: both panels readable, neither exists. A fact about the person.
    const bare = await bareProfile();
    const absent = await beforeTheyRegistered('lead:1', depsFor(bare).deps);
    expect(absent.status).toBe<MayaReadStatus>('absent');
    expect(absent.reason).toContain('absence of evidence');
    expect(absent.reason).toContain('readable');

    // Withheld: neither panel permitted. A fact about MAYA.
    //
    // Hand-built, and the reason is worth recording: no section list can produce it for a lead
    // through the real assembler, because every section that lets a 'lead' resolve at all
    // (`leads`, `lead_ingestion`, `revenue`) also grants `acquisition`. The state is still
    // reachable for other stages and for any future scope change, so the branch is real.
    const blind: PersonProfile = { ...bare, withheldPanels: ['engagement', 'acquisition'] };
    const withheld = await beforeTheyRegistered('lead:1', depsFor(blind).deps);
    expect(withheld.status).toBe<MayaReadStatus>('withheld');
    expect(withheld.reason).toContain('permissions');

    expect(absent.reason).not.toBe(withheld.reason);
  });

  it('names a PARTLY withheld read instead of reporting its nulls as the person\'s history', async () => {
    // `lead_ingestion` alone resolves a lead and grants acquisition, but NOT engagement - the
    // one section that does is `campaigns`. Before this was handled, `sessions: null` here read
    // as "never tracked" when it meant "not allowed to look".
    const partial = await richProfile(['lead_ingestion']);
    expect(partial.withheldPanels).toContain('engagement');

    const r = await beforeTheyRegistered('lead:24945', depsFor(partial).deps);
    expect(r.status).toBe<MayaReadStatus>('present');
    expect(r.data?.withheld).toEqual(['engagement']);
    expect(r.data?.sessions).toBeNull();
    // Null, not [] - an empty list of sites is a reading, and there was no reading.
    expect(r.data?.sites).toBeNull();
    // The acquisition half still came through, which is why this is 'present' and not 'withheld'.
    expect(r.data?.source).toBe('reddit');
  });

  it('declares an empty withheld list when nothing was withheld, so the field is never ambiguous', async () => {
    const profile = await richProfile();
    const r = await beforeTheyRegistered('lead:24945', depsFor(profile).deps);
    expect(r.data?.withheld).toEqual([]);
    expect(r.data?.sites).toEqual(['colaberry', 'training']);
  });

  it('tells Maya her score was computed from a narrowed view, since the engine cannot', async () => {
    const profile = await richProfile();
    const r = await howReadyTheyAre('lead:24945', depsFor(profile).deps);
    // The engine maps withheld and empty to the same null, so without this list a low coverage
    // would be indistinguishable from a person nobody knows anything about.
    expect(r.data?.withheld).toContain('billing');
    expect(r.data?.withheld).toContain('history');
    expect(r.data?.coverage).toBeLessThan(1);
  });

  it('never returns a data object alongside a non-present status', async () => {
    const bare = await bareProfile();
    const results = await readEverythingAbout('lead:1', depsFor(bare).deps);
    for (const r of Object.values(results)) {
      if (r.status === 'present') expect(r.reason).toBeNull();
      else expect(r.data).toBeNull();
    }
  });

  it('THE LOAD-BEARING ONE: zero coverage is an absence, not a total of zero', async () => {
    // A person the assembler resolves but about whom no factor has evidence. The engine
    // returns 0, correctly - and 0 handed to an agent means "measured, not ready".
    const nothing: PersonProfile = {
      email: EMAIL, name: 'Jordan Okafor', stage: 'lead',
      tracedToLead: false, company: null, title: null, withheldPanels: [],
    };
    // The engine's own agreement that this IS zero coverage, so the rule is tested against
    // the real condition rather than against my belief about it.
    expect(scoreReadiness(inputsFromProfile(nothing), NOW).coverage).toBe(0);
    expect(scoreReadiness(inputsFromProfile(nothing), NOW).total).toBe(0);

    const r = await howReadyTheyAre('lead:1', depsFor(nothing).deps);
    expect(r.status).toBe<MayaReadStatus>('absent');
    expect(r.data).toBeNull();
    expect(r.reason).toContain('nothing about this person was measurable');
  });

  it('a REAL score still comes through, so the rule above did not swallow the feature', async () => {
    const profile = await richProfile();
    const r = await howReadyTheyAre('lead:24945', depsFor(profile).deps);
    expect(r.status).toBe<MayaReadStatus>('present');
    expect(r.data?.coverage).toBeGreaterThan(0);
    expect(r.data?.factors.length).toBeGreaterThan(0);
  });

  it('passes the null-not-zero journey counts through untouched, both ways', async () => {
    const bare = await bareProfile();
    const absent = await sinceTheyRegistered('lead:1', depsFor(bare).deps);
    expect(absent.status).toBe<MayaReadStatus>('present');
    expect(absent.data?.sessions).toBeNull();
    expect(absent.data?.pageEvents).toBeNull();

    // The control: a real zero must survive as 0, or a fix that nulled everything would pass.
    route([
      [LEAD_IDS_SQL, [{ id: 24945 }]],
      [JOURNEY_SQL, [{
        sessions: '0', page_events: '0', campaigns: '0', emails: '0',
        first_touch: null, intent: null,
      }]],
      [ENGAGEMENT_SQL, [{ sessions: '0', visitors: '0', firstSeen: null, lastSeen: null, sites: null }]],
    ]);
    const zeroed = await assemble(MAYA_SECTIONS);
    const zero = await sinceTheyRegistered('lead:1', depsFor(zeroed).deps);
    expect(zero.data?.pageEvents).toBe(0);
    expect(zero.data?.sessions).toBe(0);
  });

  it('separates a never-tracked null from a tracked-but-idle zero on the browsing tool', async () => {
    const bare = await bareProfile();
    expect((await beforeTheyRegistered('lead:1', depsFor(bare).deps)).status).toBe('absent');

    route([
      [ACQUISITION_SQL, [ACQUISITION_ROW]],
      [ENGAGEMENT_SQL, [{ sessions: '0', visitors: '1', firstSeen: null, lastSeen: null, sites: null }]],
    ]);
    const tracked = await assemble(MAYA_SECTIONS);
    const r = await beforeTheyRegistered('lead:1', depsFor(tracked).deps);
    expect(r.status).toBe<MayaReadStatus>('present');
    expect(r.data?.sessions).toBe(0);
  });
});

describe('M34 criterion 2: no PII in any payload or log', () => {
  it('returns none of the planted contact details in any payload', async () => {
    const profile = await richProfile();
    const results = await readEverythingAbout('lead:24945', depsFor(profile).deps);
    const serialized = JSON.stringify(results);

    for (const [field, value] of Object.entries(PII)) {
      // Asserted as a named object rather than `not.toContain`, so a failure says WHICH field
      // leaked instead of printing the whole payload and leaving the reader to find it.
      expect({ field, leaked: serialized.includes(value) }).toEqual({ field, leaked: false });
    }
  });

  it('returns no email address anywhere, and no id that is one', async () => {
    const profile = await richProfile();
    const results = await readEverythingAbout('lead:24945', depsFor(profile).deps);
    const serialized = JSON.stringify(results);
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain(EMAIL);
    for (const r of Object.values(results)) {
      expect(r.subject).not.toContain('@');
      expect(r.subject).toMatch(/^person:[0-9a-f]{16}$/);
    }
  });

  it('carries the FIRST name only, never the full name', async () => {
    const profile = await richProfile();
    const r = await whoIsThisPerson('lead:24945', depsFor(profile).deps);
    expect(r.data?.greetingName).toBe('Jordan');
    expect(JSON.stringify(r)).not.toContain('Okafor');
  });

  it('keeps the surname out of the COMBINED payload too, not just the identity tool', async () => {
    // The mutation run showed why this is separate: replacing firstNameOf() with the raw name
    // killed the test above but not the planted-PII loop, because the surname is not one of the
    // planted contact fields. Checking the whole payload closes that gap.
    const profile = await richProfile();
    const serialized = JSON.stringify(await readEverythingAbout('lead:24945', depsFor(profile).deps));
    expect(serialized).not.toContain('Okafor');
    // Control: the first name IS there, so this is not passing because the payload is empty.
    expect(serialized).toContain('Jordan');
  });

  it('logs the outcome and nothing about the person', async () => {
    const profile = await richProfile();
    const { deps, lines } = depsFor(profile);
    await readEverythingAbout('lead:24945', deps);
    expect(lines).toHaveLength(4);
    const serialized = JSON.stringify(lines);
    expect(serialized).not.toContain('@');
    expect(serialized).not.toContain('Jordan');
    for (const value of Object.values(PII)) expect(serialized).not.toContain(value);
    // The control: the log is not simply empty.
    expect(lines[0]).toMatchObject({ service: 'maya-read-tools', event: 'maya_read_tool' });
    expect(lines.map((l) => l.tool).sort()).toEqual([...MAYA_READ_TOOLS].sort());
  });

  it('logs an unresolved reference without echoing the reference', async () => {
    const { deps, lines } = depsFor(null, { email: null });
    await whoIsThisPerson('someone@elsewhere.com', deps);
    expect(JSON.stringify(lines)).not.toContain('elsewhere.com');
    expect(lines[0].subject).toBe('person:unresolved');
  });

  it('logLineFor holds no payload field at all', () => {
    const line = logLineFor('who_is_this_person', subjectRef(EMAIL), 'present', NOW);
    expect(Object.keys(line).sort()).toEqual(
      ['event', 'level', 'outcome', 'service', 'status', 'subject', 'timestamp', 'tool'],
    );
  });
});

describe('the subject token', () => {
  it('is stable for the same person and different for different people', () => {
    expect(subjectRef(EMAIL)).toBe(subjectRef(EMAIL));
    expect(subjectRef(EMAIL)).not.toBe(subjectRef('other@example.com'));
  });

  it('ignores case and surrounding whitespace, so one person is one subject', () => {
    expect(subjectRef('  EXPLORER@Example.COM ')).toBe(subjectRef(EMAIL));
  });

  it('is the SAME token whichever reference form the caller held', async () => {
    // The point of hashing the resolved email rather than echoing the input: two tool calls
    // about one person correlate in the log even when one came in as a lead id.
    const profile = await richProfile();
    const viaLead = await whoIsThisPerson('lead:24945', depsFor(profile).deps);
    const viaEmail = await whoIsThisPerson(EMAIL, depsFor(profile).deps);
    expect(viaLead.subject).toBe(viaEmail.subject);
  });
});

describe('M34 criterion 3: advisory, never authoritative', () => {
  it('marks every result advisory, as a field', async () => {
    const profile = await richProfile();
    const results = await readEverythingAbout('lead:24945', depsFor(profile).deps);
    for (const r of Object.values(results)) expect(r.advisory).toBe(true);
    const unresolved = await whoIsThisPerson('x', depsFor(null, { email: null }).deps);
    expect(unresolved.advisory).toBe(true);
  });

  it('names the five topics M31 must hand off rather than answer', () => {
    expect([...NEVER_AUTHORITATIVE_FOR].sort())
      .toEqual(['consent', 'cohort_date', 'deadline', 'price', 'seat_count'].sort());
  });

  it('exposes no price, cohort, deadline or seat field to be mistaken for one', async () => {
    const profile = await richProfile();
    const payload = JSON.stringify(await readEverythingAbout('lead:24945', depsFor(profile).deps));
    // The control first: a payload that was empty, or an exception swallowed into one, would
    // pass every absence below for the wrong reason.
    expect(payload).toContain('"advisory":true');
    expect(payload.length).toBeGreaterThan(400);
    for (const banned of ['price', 'amount', 'cohortId', 'seat', 'deadline']) {
      expect(payload.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });
});

describe('M34 criterion 4: each tool is scoped to one person', () => {
  it('implements every tool it declares, and declares every tool it implements', async () => {
    // Generated from the list rather than restating it, so a fifth tool added without a test
    // fails here instead of shipping unexercised.
    const profile = await richProfile();
    const results = await readEverythingAbout('lead:24945', depsFor(profile).deps);
    expect(Object.values(results).map((r) => r.tool).sort()).toEqual([...MAYA_READ_TOOLS].sort());
    expect(new Set(MAYA_READ_TOOLS).size).toBe(MAYA_READ_TOOLS.length);
  });

  it('resolves exactly one person, ONCE, with no way to widen it', async () => {
    // Two properties in one assertion. The ref is the only person reached - there is no
    // parameter that widens the read - and the profile is assembled ONCE for all four tools.
    // The first version resolved four times, which is dozens of queries for one question.
    const profile = await richProfile();
    const refsSeen: string[] = [];
    let assemblies = 0;
    const deps: MayaReadToolDeps = {
      ...depsFor(profile).deps,
      emailForRef: async (ref) => { refsSeen.push(ref); return EMAIL; },
      profileFor: async () => { assemblies += 1; return profile; },
    };
    await readEverythingAbout('lead:24945', deps);
    expect(refsSeen).toEqual(['lead:24945']);
    expect(assemblies).toBe(1);
  });
});

describe('what Maya is allowed to see - the reviewable decision, pinned', () => {
  it('takes the ADMISSIONS stage range from the existing section rule, not a new one', () => {
    // Asserted against `personScope`'s real map: if Ali changes what Admissions may see, this
    // follows rather than contradicting it.
    expect(MAYA_SECTIONS).toContain('lead_ingestion');
    const admissions = stagesForSection('lead_ingestion');
    expect(admissions).toContain('lead');
    expect(admissions).toContain('graduate');
    expect(admissions).not.toContain('returning_customer');
  });

  it('withholds billing, learning and account from her, and a test would fail if that widened', async () => {
    const profile = await richProfile();
    for (const panel of ['billing', 'learning', 'account', 'programme', 'history']) {
      expect(profile.withheldPanels).toContain(panel);
    }
  });

  it('grants acquisition and engagement, which is why two tools can answer at all', async () => {
    const profile = await richProfile();
    expect(profile.withheldPanels).not.toContain('acquisition');
    expect(profile.withheldPanels).not.toContain('engagement');
  });

  it('is PERMITTED communications as a side effect of needing engagement, and exposes none of it', async () => {
    // Stated as a test rather than only in the docblock, because "permitted but unexposed" is
    // the kind of claim that quietly stops being true.
    const profile = await richProfile();
    expect(profile.withheldPanels).not.toContain('communications');
    const payload = JSON.stringify(await readEverythingAbout('lead:24945', depsFor(profile).deps));
    expect(payload).not.toContain('inboundCount');
    expect(payload).not.toContain('threads');
  });
});

describe('failure path', () => {
  it('returns unknown_person rather than throwing when the profile cannot be assembled', async () => {
    const { deps } = depsFor(null);
    const r = await whoIsThisPerson('lead:24945', deps);
    expect(r.status).toBe<MayaReadStatus>('unknown_person');
  });

  it('a name of whitespace yields a null greeting rather than an empty string', async () => {
    const profile = await richProfile();
    const r = await whoIsThisPerson('lead:1', depsFor({ ...profile, name: '   ' }).deps);
    expect(r.data?.greetingName).toBeNull();
  });

  it('is deterministic: the same inputs twice give byte-identical payloads', async () => {
    const profile = await richProfile();
    const once = await readEverythingAbout('lead:24945', depsFor(profile).deps);
    const twice = await readEverythingAbout('lead:24945', depsFor(profile).deps);
    expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
  });

  it('reads nothing when the reference never resolves, so an unknown id costs no query', async () => {
    let profileCalls = 0;
    const deps: MayaReadToolDeps = {
      profileFor: async () => { profileCalls += 1; return null; },
      emailForRef: async () => null,
      now: () => NOW,
      log: () => {},
    };
    await readEverythingAbout('not-a-reference', deps);
    expect(profileCalls).toBe(0);
  });
});

describe('the default wiring, exercised without a database', () => {
  it('resolves a malformed reference to unknown_person through the real resolver', async () => {
    // No deps injected: this runs `resolveRefToEmail`, which refuses 'not-a-reference' on shape
    // alone and therefore issues no query. The default path is covered with zero I/O.
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      const r = await whoIsThisPerson('not-a-reference');
      expect(r.status).toBe<MayaReadStatus>('unknown_person');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(String(spy.mock.calls[0][0])).toContain('maya_read_tool');
    } finally {
      spy.mockRestore();
    }
  });
});
