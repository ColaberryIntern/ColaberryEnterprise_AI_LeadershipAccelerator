/**
 * The rule that decides what Phase 3A writes to production.
 *
 * No mocks, because `planLinks` performs no I/O. What is being tested is one property, stated
 * three ways: ONE GOHIGHLEVEL CONTACT MUST NEVER LAND ON TWO LEAD ROWS. Production supplies the
 * case - 196 matches resolving to 192 distinct contacts, four matched twice because one person
 * registered under two email addresses with one phone number.
 */
import { MatchRow, PlannedLink, fanOutViolations, planLinks } from '../explorerGhlLinkPlan';

const match = (over: Partial<MatchRow> = {}): MatchRow => ({
  enrollment_id: `enr-${over.lead_id ?? 1}`,
  lead_id: 1,
  source: 'open_house',
  account: 'school_of_data_analytics',
  matched_by: 'email',
  contact_id: 'ghl-1',
  callable: true,
  consent_contact: false,
  ...over,
});

describe('planLinks', () => {
  it('links a contact matched by exactly one lead', () => {
    const { link, withheld } = planLinks([match()], new Map());
    expect(withheld).toEqual([]);
    expect(link).toHaveLength(1);
    expect(link[0].previous_contact_id).toBeNull();
  });

  it('gives the link to the email match and withholds the phone match', () => {
    // The production case, four times over. The address GoHighLevel itself holds for the
    // contact is better evidence than a phone number two people can share.
    const rows = [
      match({ lead_id: 24128, matched_by: 'phone', contact_id: 'c1' }),
      match({ lead_id: 24132, matched_by: 'email', contact_id: 'c1' }),
    ];
    const { link, withheld } = planLinks(rows, new Map());
    expect(link.map((l) => l.lead_id)).toEqual([24132]);
    expect(withheld).toHaveLength(1);
    expect(withheld[0]).toMatchObject({
      lead_id: 24128,
      reason: 'duplicate_person_withheld',
      collided_with: [24132],
    });
  });

  it('withholds the whole group when two leads both match by email', () => {
    const rows = [match({ lead_id: 1, contact_id: 'c2' }), match({ lead_id: 2, contact_id: 'c2' })];
    const { link, withheld } = planLinks(rows, new Map());
    expect(link).toEqual([]);
    expect(withheld.map((w) => w.reason)).toEqual(['collision_unresolved', 'collision_unresolved']);
    expect(withheld[0].collided_with).toEqual([2]);
  });

  it('withholds the whole group when nothing matched by email', () => {
    const rows = [
      match({ lead_id: 1, matched_by: 'phone', contact_id: 'c3' }),
      match({ lead_id: 2, matched_by: 'phone', contact_id: 'c3' }),
    ];
    expect(planLinks(rows, new Map()).link).toEqual([]);
  });

  it('withholds a contact that some other lead row already carries', () => {
    const { link, withheld } = planLinks(
      [match({ lead_id: 7, contact_id: 'c4' })],
      new Map([['c4', [999]]])
    );
    expect(link).toEqual([]);
    expect(withheld[0]).toMatchObject({ reason: 'already_linked_elsewhere', collided_with: [999] });
  });

  it('does not treat the row itself as another owner', () => {
    // A concurrent write can land between the lookup and the plan, so the lead's own id coming
    // back must not read as a collision with somebody else - that would withhold a row the
    // guarded UPDATE would have handled correctly anyway.
    const { link, withheld } = planLinks(
      [match({ lead_id: 7, contact_id: 'c5' })],
      new Map([['c5', [7]]])
    );
    expect(withheld).toEqual([]);
    expect(link).toHaveLength(1);
  });

  it('places every match in exactly one of link or withheld', () => {
    const rows = [
      match({ lead_id: 1, contact_id: 'a' }),
      match({ lead_id: 2, matched_by: 'phone', contact_id: 'b' }),
      match({ lead_id: 3, matched_by: 'email', contact_id: 'b' }),
      match({ lead_id: 4, contact_id: 'c' }),
      match({ lead_id: 5, contact_id: 'c' }),
      match({ lead_id: 6, contact_id: 'd' }),
    ];
    const { link, withheld } = planLinks(rows, new Map([['d', [500]]]));
    const ids = [...link, ...withheld].map((r) => r.lead_id).sort((x, y) => x - y);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(ids).size).toBe(rows.length);
  });

  it('reproduces production: 196 matches with 4 duplicate pairs plan 192 links', () => {
    const rows: MatchRow[] = [];
    for (let i = 0; i < 188; i += 1) rows.push(match({ lead_id: 1000 + i, contact_id: `solo-${i}` }));
    for (let i = 0; i < 4; i += 1) {
      rows.push(match({ lead_id: 2000 + i * 2, matched_by: 'phone', contact_id: `pair-${i}` }));
      rows.push(match({ lead_id: 2001 + i * 2, matched_by: 'email', contact_id: `pair-${i}` }));
    }
    expect(rows).toHaveLength(196);

    const { link, withheld } = planLinks(rows, new Map());
    expect(link).toHaveLength(192);
    expect(withheld).toHaveLength(4);
    expect(new Set(link.map((l) => l.contact_id)).size).toBe(192);
    expect(withheld.every((w) => w.matched_by === 'phone')).toBe(true);
  });

  it('never plans a fan-out, whatever the input', () => {
    const rows = [
      match({ lead_id: 1, matched_by: 'phone', contact_id: 'x' }),
      match({ lead_id: 2, matched_by: 'email', contact_id: 'x' }),
      match({ lead_id: 3, contact_id: 'y' }),
    ];
    expect(fanOutViolations(planLinks(rows, new Map()).link)).toEqual([]);
  });
});

describe('fanOutViolations', () => {
  it('reports a contact planned for two lead rows', () => {
    // The control for the assertion above: without this, a check that always returned [] would
    // read as a pass on every input.
    const bad = [
      { ...match({ lead_id: 1, contact_id: 'z' }), previous_contact_id: null },
      { ...match({ lead_id: 2, contact_id: 'z' }), previous_contact_id: null },
    ] as PlannedLink[];
    expect(fanOutViolations(bad)).toEqual(['z']);
  });

  it('is quiet on an empty plan', () => {
    expect(fanOutViolations([])).toEqual([]);
  });
});
