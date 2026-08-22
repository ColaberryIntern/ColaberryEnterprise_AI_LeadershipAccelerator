/**
 * The website grouping behind the Leads page filter.
 *
 * `leads.source` is free text and had drifted to 20 values for ~8 real origins
 * (three spellings of training.colaberry.com, three test rows sitting next to
 * live leads). These tests pin the mapping, the "website signups first"
 * ordering Ali asked for on 2026-08-11, and the property that nothing can fall
 * out of a filtered view unnoticed.
 */
import {
  LEAD_SOURCE_GROUPS,
  UNGROUPED_KEY,
  ORIGIN_PRIORITY,
  groupForSource,
  sourcesForGroup,
  allKnownSources,
  priorityForSource,
  sourcePriorityPairs,
} from '../../services/leads/leadSourceGroups';

describe('groupForSource', () => {
  it('folds every spelling of the training site into one group', () => {
    for (const raw of ['training.colaberry.com', 'training.colaberry.com/thank-you', 'popup']) {
      expect(groupForSource(raw)).toBe('training_colaberry');
    }
  });

  it('maps each live website to its own group', () => {
    expect(groupForSource('colaberry')).toBe('colaberry_ai');
    expect(groupForSource('website')).toBe('colaberry_ai');
    expect(groupForSource('worldoftaxonomy')).toBe('worldoftaxonomy');
    expect(groupForSource('trustbeforeintelligence')).toBe('trustbeforeintelligence');
    expect(groupForSource('advisory')).toBe('advisor');
  });

  it('keeps both Apollo intakes in the Apollo group', () => {
    expect(groupForSource('apollo')).toBe('apollo');
    expect(groupForSource('apollo_contacts')).toBe('apollo');
  });

  it('folds the alumni imports together and away from website leads', () => {
    for (const raw of ['ccpp_winback', 'ccpp_alumni', 'alumni']) {
      expect(groupForSource(raw)).toBe('alumni');
    }
  });

  it('quarantines the leftover test rows', () => {
    for (const raw of ['manual_test', 'campaign_test', 'training.colaberry.com-smoke']) {
      expect(groupForSource(raw)).toBe('test');
    }
  });

  it('is case and whitespace insensitive', () => {
    expect(groupForSource('  Apollo  ')).toBe('apollo');
    expect(groupForSource('WorldOfTaxonomy')).toBe('worldoftaxonomy');
  });

  it('sends anything unrecognised to the catch-all rather than dropping it', () => {
    expect(groupForSource('strategy_call')).toBe(UNGROUPED_KEY);
    expect(groupForSource('contact')).toBe(UNGROUPED_KEY);
    expect(groupForSource('brand-new-site.com')).toBe(UNGROUPED_KEY);
    expect(groupForSource(null)).toBe(UNGROUPED_KEY);
    expect(groupForSource(undefined)).toBe(UNGROUPED_KEY);
    expect(groupForSource('')).toBe(UNGROUPED_KEY);
  });
});

describe('sourcesForGroup', () => {
  it('returns the raw values a group covers', () => {
    expect(sourcesForGroup('worldoftaxonomy')).toEqual(['worldoftaxonomy']);
    expect(sourcesForGroup('apollo')).toEqual(['apollo', 'apollo_contacts']);
  });

  it('returns null for the catch-all, which cannot be an IN list', () => {
    expect(sourcesForGroup(UNGROUPED_KEY)).toBeNull();
  });

  it('returns an empty list for an unknown key so a bad filter matches nothing', () => {
    // The dangerous failure is a typo'd key quietly matching every lead.
    expect(sourcesForGroup('not-a-group')).toEqual([]);
  });
});

describe('group definitions', () => {
  it('never assigns one raw source to two groups', () => {
    const all = allKnownSources().map((s) => s.toLowerCase());
    expect(new Set(all).size).toBe(all.length);
  });

  it('uses unique group keys', () => {
    const keys = LEAD_SOURCE_GROUPS.map((g) => g.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never collides with the catch-all key', () => {
    expect(LEAD_SOURCE_GROUPS.map((g) => g.key)).not.toContain(UNGROUPED_KEY);
  });

  it('gives every group at least one source and a label', () => {
    for (const g of LEAD_SOURCE_GROUPS) {
      expect(g.sources.length).toBeGreaterThan(0);
      expect(g.label.trim()).not.toBe('');
    }
  });
});

describe('priorityForSource', () => {
  it('ranks a website signup above a pulled-list name', () => {
    expect(priorityForSource('colaberry')).toBeLessThan(priorityForSource('apollo'));
    expect(priorityForSource('worldoftaxonomy')).toBeLessThan(priorityForSource('apollo'));
    expect(priorityForSource('trustbeforeintelligence')).toBeLessThan(priorityForSource('ccpp_winback'));
  });

  it('ranks an event signup above a pulled list too', () => {
    expect(priorityForSource('open_house')).toBeLessThan(priorityForSource('apollo'));
  });

  it('puts every website ahead of every non-website origin', () => {
    const websites = LEAD_SOURCE_GROUPS.filter((g) => g.kind === 'website');
    const others = LEAD_SOURCE_GROUPS.filter((g) => g.kind !== 'website');
    for (const w of websites) {
      for (const o of others) {
        expect(ORIGIN_PRIORITY[w.kind]).toBeLessThan(ORIGIN_PRIORITY[o.kind]);
      }
    }
  });

  it('sinks test rows to the bottom', () => {
    const worstReal = Math.max(
      ...LEAD_SOURCE_GROUPS.filter((g) => g.kind !== 'test').map((g) => ORIGIN_PRIORITY[g.kind])
    );
    expect(priorityForSource('manual_test')).toBeGreaterThan(worstReal);
  });

  it('places an unrecognised source after known real origins but above test', () => {
    const unknown = priorityForSource('brand-new-site.com');
    expect(unknown).toBeGreaterThan(ORIGIN_PRIORITY.list);
    expect(unknown).toBeLessThan(ORIGIN_PRIORITY.test);
  });
});

describe('sourcePriorityPairs', () => {
  it('covers every known source exactly once', () => {
    const pairs = sourcePriorityPairs();
    expect(pairs.map((p) => p.source).sort()).toEqual(allKnownSources().sort());
  });

  it('agrees with priorityForSource for every source', () => {
    // The SQL CASE is built from these pairs, so a drift here would mean the
    // database sorted differently from the TypeScript.
    for (const { source, tier } of sourcePriorityPairs()) {
      expect(priorityForSource(source)).toBe(tier);
    }
  });

  it('emits no source string that would need SQL quoting we do not do', () => {
    for (const { source } of sourcePriorityPairs()) {
      expect(source).not.toMatch(/[\\;]/);
    }
  });
});
