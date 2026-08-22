/**
 * Sales audience default and saved ("locked") lead-list settings.
 *
 * Ali, 2026-08-20: default the sales team to business accounts on the
 * enterprise side, keep training signups off their list, let them choose their
 * own websites, and let them lock that choice so it sticks.
 *
 * The resolution order these tests pin is: explicit request > saved+locked >
 * role default > no filter.
 */
const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  sequelize: { query: (...args: unknown[]) => mockQuery(...args) },
}));

import {
  sanitizeWebsiteKeys,
  getLeadViewPreference,
  saveLeadViewPreference,
  resolveWebsiteFilter,
} from '../../services/leads/leadViewPreferenceService';
import {
  LEAD_SOURCE_GROUPS,
  groupKeysForAudience,
  defaultWebsiteKeysForRole,
} from '../../services/leads/leadSourceGroups';

const ADMIN_ID = '9f2a1c44-0e7b-4c3d-9a11-5b6c7d8e9f00';

beforeEach(() => mockQuery.mockReset());

describe('audience classification', () => {
  it('puts every enterprise-side website on the business audience', () => {
    const enterprise = groupKeysForAudience('enterprise');
    for (const key of ['colaberry_ai', 'worldoftaxonomy', 'trustbeforeintelligence', 'advisor']) {
      expect(enterprise).toContain(key);
    }
  });

  it('keeps the training funnel off the enterprise audience', () => {
    const enterprise = groupKeysForAudience('enterprise');
    // The training site, the Open House (Eventbrite session for the bootcamp
    // funnel) and the alumni imports are all people signing up for training.
    for (const key of ['training_colaberry', 'open_house', 'alumni']) {
      expect(enterprise).not.toContain(key);
      expect(groupKeysForAudience('training')).toContain(key);
    }
  });

  it('gives every group exactly one audience', () => {
    for (const g of LEAD_SOURCE_GROUPS) {
      expect(['enterprise', 'training', 'internal']).toContain(g.audience);
    }
  });

  it('never leaks test data into a real audience', () => {
    expect(groupKeysForAudience('enterprise')).not.toContain('test');
    expect(groupKeysForAudience('training')).not.toContain('test');
  });
});

describe('defaultWebsiteKeysForRole', () => {
  it('opens a sales rep on business accounts only', () => {
    expect(defaultWebsiteKeysForRole('sales')).toEqual(groupKeysForAudience('enterprise'));
  });

  it('does not filter an admin at all', () => {
    expect(defaultWebsiteKeysForRole('admin')).toBeNull();
    expect(defaultWebsiteKeysForRole('super_admin')).toBeNull();
    expect(defaultWebsiteKeysForRole(undefined)).toBeNull();
  });
});

describe('sanitizeWebsiteKeys', () => {
  it('keeps real group keys and the catch-all', () => {
    expect(sanitizeWebsiteKeys(['apollo', 'other'])).toEqual(['apollo', 'other']);
  });

  it('drops a key that is no longer a real group', () => {
    // A rep who saved a filter before a rename gets a narrower working view,
    // never an empty one caused by a key we stopped recognising.
    expect(sanitizeWebsiteKeys(['apollo', 'renamed_away'])).toEqual(['apollo']);
  });

  it('drops duplicates, blanks and non-strings', () => {
    expect(sanitizeWebsiteKeys(['apollo', 'apollo', '', '  ', 7, null])).toEqual(['apollo']);
  });

  it('returns an empty list for anything that is not an array', () => {
    expect(sanitizeWebsiteKeys(undefined)).toEqual([]);
    expect(sanitizeWebsiteKeys('apollo')).toEqual([]);
  });
});

describe('getLeadViewPreference', () => {
  it('returns null when the rep has never saved settings', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await getLeadViewPreference(ADMIN_ID)).toBeNull();
  });

  it('sanitizes what came out of the database', async () => {
    mockQuery.mockResolvedValue([{ websites: ['apollo', 'gone_away'], locked: true }]);
    expect(await getLeadViewPreference(ADMIN_ID)).toEqual({ websites: ['apollo'], locked: true });
  });
});

describe('saveLeadViewPreference', () => {
  it('writes the sanitized selection and reports it back', async () => {
    mockQuery.mockResolvedValue([]);
    const saved = await saveLeadViewPreference(ADMIN_ID, ['apollo', 'nope'], true);
    expect(saved).toEqual({ websites: ['apollo'], locked: true });

    const [, opts] = mockQuery.mock.calls[0];
    expect(JSON.parse(opts.replacements.websites)).toEqual(['apollo']);
    expect(opts.replacements.locked).toBe(true);
  });

  it('handles an empty selection without inventing a placeholder row', async () => {
    mockQuery.mockResolvedValue([]);
    const saved = await saveLeadViewPreference(ADMIN_ID, [], false);
    expect(saved).toEqual({ websites: [], locked: false });
    const [, opts] = mockQuery.mock.calls[0];
    expect(JSON.parse(opts.replacements.websites)).toEqual([]);
  });

  it('upserts rather than inserting twice', async () => {
    mockQuery.mockResolvedValue([]);
    await saveLeadViewPreference(ADMIN_ID, ['apollo'], true);
    const [sql] = mockQuery.mock.calls[0];
    expect(String(sql)).toContain('ON CONFLICT (admin_user_id)');
  });
});

describe('resolveWebsiteFilter', () => {
  it('lets an explicit request win over a locked preference', async () => {
    mockQuery.mockResolvedValue([{ websites: ['apollo'], locked: true }]);
    // A rep can look outside their locked view without losing it.
    expect(await resolveWebsiteFilter(ADMIN_ID, 'sales', 'open_house')).toEqual(['open_house']);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('applies a locked preference when nothing was requested', async () => {
    mockQuery.mockResolvedValue([{ websites: ['apollo', 'colaberry_ai'], locked: true }]);
    expect(await resolveWebsiteFilter(ADMIN_ID, 'sales', undefined)).toEqual(['apollo', 'colaberry_ai']);
  });

  it('ignores a saved preference that was not locked', async () => {
    mockQuery.mockResolvedValue([{ websites: ['apollo'], locked: false }]);
    // Saved-but-unlocked is a remembered choice, not an enforced one.
    expect(await resolveWebsiteFilter(ADMIN_ID, 'sales', undefined))
      .toEqual(groupKeysForAudience('enterprise'));
  });

  it('falls back to the sales default when nothing is saved', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await resolveWebsiteFilter(ADMIN_ID, 'sales', undefined))
      .toEqual(groupKeysForAudience('enterprise'));
  });

  it('leaves an admin unfiltered', async () => {
    mockQuery.mockResolvedValue([]);
    expect(await resolveWebsiteFilter(ADMIN_ID, 'admin', undefined)).toBeNull();
  });

  it('never returns training sources to a sales rep by default', async () => {
    mockQuery.mockResolvedValue([]);
    const resolved = (await resolveWebsiteFilter(ADMIN_ID, 'sales', undefined)) ?? [];
    for (const key of ['training_colaberry', 'open_house', 'alumni']) {
      expect(resolved).not.toContain(key);
    }
  });

  it('supports a multi-website request, which is how the picker submits', async () => {
    expect(await resolveWebsiteFilter(ADMIN_ID, 'sales', 'colaberry_ai, apollo ,worldoftaxonomy'))
      .toEqual(['colaberry_ai', 'apollo', 'worldoftaxonomy']);
  });
});
