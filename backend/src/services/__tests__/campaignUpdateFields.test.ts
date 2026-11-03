/**
 * C0.13 - `updateCampaign` silently dropped fields the activation gate requires.
 *
 * The ticket reports one defect but it has two halves with opposite fixes, and getting
 * that wrong is the risk:
 *
 *   `tracking_link` - the gate's `analytics_ready` check reads it and fails closed without
 *     it, yet it was absent from the allowlist. The fix is to ALLOW it.
 *   `approval_status` / `approved_by` - the gate reads these as evidence a human signed
 *     off. Allowing them would let a campaign approve itself through a generic admin
 *     PATCH. The fix is to REFUSE them loudly instead of discarding them in silence.
 *
 * So the invariant worth protecting is not "the gate's fields are writable". It is that
 * the two sets stay disjoint, which is asserted below.
 *
 * Pure module, no model imports, so this suite runs without a database.
 */
import {
  CAMPAIGN_APPROVAL_FIELDS,
  CAMPAIGN_UPDATABLE_FIELDS,
  CampaignApprovalNotWritableError,
  filterCampaignUpdate,
} from '../campaignService';

describe('tracking_link - the field the gate needs and the allowlist omitted', () => {
  it('is writable', () => {
    expect(filterCampaignUpdate({ tracking_link: 'https://example.com/t/abc' })).toEqual({
      tracking_link: 'https://example.com/t/abc',
    });
  });

  it('appears in the exported contract, so the omission cannot recur unnoticed', () => {
    expect(CAMPAIGN_UPDATABLE_FIELDS).toContain('tracking_link');
  });

  it('survives alongside other fields in the same patch', () => {
    const out = filterCampaignUpdate({
      name: 'Autumn outbound',
      tracking_link: 'https://example.com/t/abc',
      status: 'active',
    });
    expect(out).toEqual({
      name: 'Autumn outbound',
      tracking_link: 'https://example.com/t/abc',
      status: 'active',
    });
  });
});

describe('the approval record - refused, never silently dropped', () => {
  it.each([...CAMPAIGN_APPROVAL_FIELDS])('throws when %s is supplied', (field) => {
    expect(() => filterCampaignUpdate({ [field]: 'approved' })).toThrow(
      CampaignApprovalNotWritableError
    );
  });

  it('names the field in the error, so the caller knows what was refused', () => {
    expect(() => filterCampaignUpdate({ approved_by: 'someone' })).toThrow(/approved_by/);
  });

  it('names both fields when both are attempted', () => {
    try {
      filterCampaignUpdate({ approval_status: 'approved', approved_by: 'someone' });
      throw new Error('expected filterCampaignUpdate to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(CampaignApprovalNotWritableError);
      expect((e as CampaignApprovalNotWritableError).fields.sort()).toEqual([
        'approval_status',
        'approved_by',
      ]);
    }
  });

  it('refuses even when the rest of the patch is legitimate', () => {
    // The dangerous shape: a real edit with an approval smuggled in. Dropping the one
    // field and succeeding on the rest is exactly the silence this ticket is about.
    expect(() =>
      filterCampaignUpdate({ name: 'Autumn outbound', approval_status: 'live' })
    ).toThrow(CampaignApprovalNotWritableError);
  });

  it('does not throw when an approval field is present but undefined', () => {
    // `undefined` is what a spread of an absent key produces. Treating it as an attempt
    // would reject ordinary callers who send a whole campaign object back.
    expect(() => filterCampaignUpdate({ approval_status: undefined, name: 'x' })).not.toThrow();
  });

  it('is NOT in the writable contract - the invariant that must never regress', () => {
    for (const field of CAMPAIGN_APPROVAL_FIELDS) {
      expect(CAMPAIGN_UPDATABLE_FIELDS).not.toContain(field);
    }
  });

  it('keeps the two contracts disjoint', () => {
    const overlap = CAMPAIGN_APPROVAL_FIELDS.filter((f) =>
      (CAMPAIGN_UPDATABLE_FIELDS as readonly string[]).includes(f)
    );
    expect(overlap).toEqual([]);
  });
});

describe('filtering behavior that must not change', () => {
  it('ignores unknown fields silently, because callers send whole objects back', () => {
    expect(filterCampaignUpdate({ name: 'x', not_a_column: 'y', id: 'spoofed' })).toEqual({
      name: 'x',
    });
  });

  it('ignores fields explicitly set to undefined rather than writing undefined', () => {
    expect(filterCampaignUpdate({ name: 'x', description: undefined })).toEqual({ name: 'x' });
  });

  it('writes a null through, since clearing a field is a real edit', () => {
    expect(filterCampaignUpdate({ description: null })).toEqual({ description: null });
  });

  it('returns an empty object for an empty patch, and adds no clock of its own', () => {
    expect(filterCampaignUpdate({})).toEqual({});
  });

  it('tolerates a null or undefined body without throwing a TypeError', () => {
    expect(filterCampaignUpdate(undefined as unknown as Record<string, any>)).toEqual({});
    expect(filterCampaignUpdate(null as unknown as Record<string, any>)).toEqual({});
  });
});

describe('purity - the reason this is testable without a database', () => {
  it('does not mutate the input', () => {
    const input = { name: 'x', not_a_column: 'y' };
    const copy = { ...input };
    filterCampaignUpdate(input);
    expect(input).toEqual(copy);
  });

  it('is idempotent: the same body filters to a deeply equal result', () => {
    const input = { name: 'x', tracking_link: 'https://example.com/t/abc' };
    expect(filterCampaignUpdate(input)).toEqual(filterCampaignUpdate(input));
  });

  it('is stable under re-filtering its own output', () => {
    const once = filterCampaignUpdate({ name: 'x', tracking_link: 'https://e.com/t' });
    expect(filterCampaignUpdate(once)).toEqual(once);
  });
});
