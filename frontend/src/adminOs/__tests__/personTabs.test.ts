import { buildPersonTabs } from '../personTabs';
import type { ExplorerScorePanel, Profile } from '../personTypes';

/**
 * T212 — the person tab registry, and the two kinds of absence.
 *
 * These are behavioural tests of a pure function, not source-text assertions.
 * Earlier in this phase five of eight mutants survived a suite that asserted on
 * source text, so the rule here is that every test must fail if the BEHAVIOUR
 * it names is removed, even with the code's words left in place.
 */

const base: Profile = {
  email: 'person@example.test',
  name: 'A Person',
  stage: 'explorer',
  tracedToLead: false,
  company: null,
  title: null,
  withheldPanels: [],
};

const keysOf = (p: Profile) => buildPersonTabs(p, null, null).map((t) => t.key);

const score: ExplorerScorePanel = {
  asOfDate: '2026-10-01',
  engagement: 42,
  intent: 17,
  fit: 80,
  primaryState: 'warming',
  overlays: ['returning'],
};

describe('the Explorer score tab gates on PRESENCE, not truthiness', () => {
  it('appears when the panel is null — permitted, but this person has no snapshot', () => {
    // The load-bearing case. A free Explorer with no snapshot yet must still
    // get the tab, so the page can say "not scored". If this gated on
    // truthiness the tab would vanish and an unscored person would look
    // identical to one whose role withheld the panel.
    expect(keysOf({ ...base, explorerScore: null })).toContain('explorer');
  });

  it('appears when the panel is present', () => {
    expect(keysOf({ ...base, explorerScore: score })).toContain('explorer');
  });

  it('is ABSENT when the key is undefined — the role may not see it', () => {
    expect(keysOf(base)).not.toContain('explorer');
    // And the server names it, so the page can say what it is not showing.
    const withheld = { ...base, withheldPanels: ['explorerScore'] };
    expect(keysOf(withheld)).not.toContain('explorer');
    expect(withheld.withheldPanels).toContain('explorerScore');
  });

  it('carries NO count — a 0 beside a null panel is the confusion to avoid', () => {
    const tabs = buildPersonTabs({ ...base, explorerScore: null }, null, null);
    const tab = tabs.find((t) => t.key === 'explorer');
    expect(tab).toBeDefined();
    expect(tab!.count).toBeUndefined();
  });

  it('is labelled without the word this repo may not advertise (TWC 807.172(d))', () => {
    const tabs = buildPersonTabs({ ...base, explorerScore: null }, null, null);
    const label = tabs.find((t) => t.key === 'explorer')!.label;
    expect(label).toBe('Explorer score');
    expect(label.toLowerCase()).not.toContain('free');
  });
});

describe('the registry reads the payload and nothing else', () => {
  it('returns no tabs at all for a null profile', () => {
    expect(buildPersonTabs(null, 5, 5)).toEqual([]);
  });

  it('gives an empty payload only the ungated tab', () => {
    // `strategy` is deliberately not gated on a lead: a student has no lead
    // record and is exactly who the coaching brief is for.
    expect(keysOf(base)).toEqual(['strategy']);
  });

  it('is a pure function of its three arguments', () => {
    const p = { ...base, explorerScore: null, timeline: [] };
    expect(buildPersonTabs(p, 3, 9)).toEqual(buildPersonTabs(p, 3, 9));
  });

  it('shows an EMPTY timeline tab, because [] is permitted-and-none', () => {
    const tabs = buildPersonTabs({ ...base, timeline: [] }, null, null);
    const tab = tabs.find((t) => t.key === 'timeline');
    expect(tab).toBeDefined();
    expect(tab!.count).toBe(0);
  });
});

describe('the acquisition count describes the record, not the schema', () => {
  const acq = {
    phone: '555', role: null, companySize: null, industry: null, linkedinUrl: null,
    source: 'free_signup', formType: null, utmSource: null, utmCampaign: null,
    pageUrl: null, interestArea: null, message: null, firstSeen: null,
    pipelineStage: null, leadScore: null, temperature: null,
    temperatureUpdatedAt: null, qualificationLevel: null, interestLevel: null,
    maturityScore: null, status: null, assignedAdmin: null, lastContactedAt: null,
    notes: null, consentContact: null, evaluating90Days: null, createdAt: null,
    leadId: 7, leadScoreMax: 100, ghlContactId: null,
  };

  it('counts only filled fields, and never counts leadScoreMax', () => {
    const tabs = buildPersonTabs({ ...base, acquisition: acq }, null, null);
    // phone, source, leadId = 3. leadScoreMax is a server constant, not
    // evidence about the person, so counting it would inflate every lead.
    expect(tabs.find((t) => t.key === 'acquisition')!.count).toBe(3);
  });

  it('counts a present ghlContactId as evidence, and a null one as none', () => {
    const withGhl = { ...acq, ghlContactId: 'ghl_abc123' };
    const a = buildPersonTabs({ ...base, acquisition: acq }, null, null);
    const b = buildPersonTabs({ ...base, acquisition: withGhl }, null, null);
    expect(b.find((t) => t.key === 'acquisition')!.count)
      .toBe(a.find((t) => t.key === 'acquisition')!.count! + 1);
  });

  it('opens Journey and Notes only once there is a lead to analyse', () => {
    expect(keysOf({ ...base, acquisition: acq })).toEqual(
      expect.arrayContaining(['acquisition', 'journey', 'notes']),
    );
    const noLead = { ...acq, leadId: null };
    const keys = keysOf({ ...base, acquisition: noLead });
    expect(keys).toContain('acquisition');
    expect(keys).not.toContain('journey');
    expect(keys).not.toContain('notes');
  });

  it('passes the touchpoint figure straight through, never recomputing it', () => {
    // The Journey card's own number. An earlier version summed sessions, page
    // events, emails and campaigns and showed 2 against a card reading 15.
    const tabs = buildPersonTabs({ ...base, acquisition: acq }, null, 15);
    expect(tabs.find((t) => t.key === 'journey')!.count).toBe(15);
  });
});

describe('tab ORDER is the nav order, and is not alphabetical', () => {
  it('puts the Explorer score after Communications and before Enrolments', () => {
    const keys = keysOf({
      ...base,
      timeline: [],
      explorerScore: null,
      learning: [],
      trust: { matchMethod: 'exact_email', leadIds: [], enrollmentIds: [], tracedToLead: false, consentRecorded: null, lastActivity: null, gaps: [] },
    });
    expect(keys.indexOf('explorer')).toBeGreaterThan(keys.indexOf('strategy'));
    expect(keys.indexOf('explorer')).toBeLessThan(keys.indexOf('learning'));
    // Trust is last: it is about the data rather than the person.
    expect(keys[keys.length - 1]).toBe('trust');
  });
});

/**
 * M26 - the Sales Readiness tab obeys the same gate as the Explorer one.
 *
 * The score is composed by the route from panels the caller was already permitted, so an absent
 * key means the role could not see the evidence it would need, and the tab should not appear.
 * A present score always earns the tab, even a thin one, because the panel's own job is to say
 * which factors had no evidence.
 */
const readiness = {
  rulesetVersion: 'srs-v2-provisional-2026-10-18',
  computedAt: '2026-10-18T12:00:00.000Z',
  total: 0,
  scoreableMax: 0,
  rulesetMax: 197,
  coverage: 0,
  factors: [],
  frictionFlag: false,
  oldestEvidenceAt: null,
} as NonNullable<Profile['salesReadiness']>;

describe('the Sales readiness tab', () => {
  it('appears for a score with NO evidence at all, rather than hiding', () => {
    // The load-bearing case, and the mirror of the Explorer one. A person we know nothing about
    // still earns the tab, so the panel can say "no evidence" factor by factor. Hiding it would
    // make an unscoreable person look like one whose role withheld the evidence.
    expect(keysOf({ ...base, salesReadiness: readiness })).toContain('readiness');
  });

  it('appears for a populated score', () => {
    const scored = { ...readiness, total: 61, scoreableMax: 92, coverage: 0.77 };
    expect(keysOf({ ...base, salesReadiness: scored })).toContain('readiness');
  });

  it('is ABSENT when the key is undefined', () => {
    expect(keysOf(base)).not.toContain('readiness');
  });

  it('carries no count, because a factor count beside a score reads as the score', () => {
    const tab = buildPersonTabs({ ...base, salesReadiness: readiness }, null, null)
      .find((t) => t.key === 'readiness');
    expect(tab?.count).toBeUndefined();
  });
});
