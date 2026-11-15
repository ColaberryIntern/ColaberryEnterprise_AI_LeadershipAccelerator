/**
 * AF3.5 — the grant gate, driven both ways.
 *
 * The contract is pure, so every refusal is reachable without a database and every one of them
 * has a matching acceptance case. A refusal with no paired acceptance proves only that the gate
 * says no, which a `return false` would also do.
 */

import { acceptToolGrant, type ProposedGrant } from '../agentToolGrantContract';
import { TOOL_ENVIRONMENTS } from '../../../db/ensureAgentDomainToolRequestSchema';

const ALI = 'ali@colaberry.com';

/** Phase 2b. Three real names from `dataset_registry`, which held 633 on 15 Nov 2026. */
const KNOWN_DATASETS = ['interaction_outcomes', 'leads', 'enrollments'];

/** A grant that passes. Each test spoils exactly one thing about it. */
function clean(over: Partial<ProposedGrant> = {}): ProposedGrant {
  return {
    agent: {
      id: '11111111-1111-4111-8111-111111111111',
      agentName: 'Maya',
      toolsGranted: ['draft_marketing_email'],
    },
    toolName: 'send_email',
    capabilityId: 'admissions.CAP.reply',
    capabilityState: 'confirmed',
    approvedBy: ALI,
    recordedHumans: [ALI],
    approvers: [ALI],
    proposedBy: 'kalkidan@colaberry.com',
    registeredToolNames: ['send_email', 'draft_marketing_email', 'read_attachments'],
    // Agent Tools Phase 4. The clean case now needs a capability that actually ASKS for the tool
    // being granted, because `tool_not_required_by_capability` refuses one that does not. This
    // is the positive control for that rule as much as for the others: if the clean case did not
    // include `send_email` here, every refusal below would be passing for the wrong reason.
    capabilityRequiredTools: ['send_email', 'read_attachments'],
    // Phase 2b. The clean case names a real environment and a CATALOGUED dataset, for the same
    // reason the line above names a tool the capability asks for: if the clean case carried an
    // uncatalogued name or a blank environment, every scope refusal below would pass for the
    // wrong reason and the suite would prove nothing about any of them.
    //
    // `requestScope` is deliberately absent — this clean case cites no request, which is the
    // AF3.5 capability-promotion shape. The ceiling rules bring their own clean cases.
    environment: 'sandbox',
    datasets: ['interaction_outcomes'],
    knownDatasets: KNOWN_DATASETS,
    ...over,
  };
}

const rules = (v: ReturnType<typeof acceptToolGrant>): string[] =>
  (v.ok ? [] : v.issues.map((i) => i.rule));

describe('the clean case — without this every refusal below proves nothing', () => {
  it('accepts a confirmed capability, a registered tool and a configured approver', () => {
    const verdict = acceptToolGrant(clean());
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.grant.toolName).toBe('send_email');
    expect(verdict.grant.approvedBy).toBe(ALI);
    expect(verdict.grant.capabilityId).toBe('admissions.CAP.reply');
  });

  it('appends the new tool and keeps the existing order, because order is load-bearing', () => {
    // maybeReclassifyAutonomyLevel compares JSON.stringify of before and after. A reordered
    // list with identical membership would read as a change and rewrite autonomy_level.
    const verdict = acceptToolGrant(clean({
      agent: { id: 'a', agentName: 'Maya', toolsGranted: ['z_tool', 'a_tool'] },
    }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.grant.toolsGrantedAfter).toEqual(['z_tool', 'a_tool', 'send_email']);
  });

  it('is idempotent: granting a tool already held changes nothing and says so', () => {
    const verdict = acceptToolGrant(clean({
      agent: { id: 'a', agentName: 'Maya', toolsGranted: ['send_email'] },
    }));
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.grant.alreadyGranted).toBe(true);
    expect(verdict.grant.toolsGrantedAfter).toEqual(['send_email']);
  });
});

describe('who is asking', () => {
  it('REFUSES an empty roster as its own reason, not as permission', () => {
    // absence is not approval. This is the refusal that carries the weight, because
    // isNonHumanIdentity returns false for the identities that actually walk through.
    expect(rules(acceptToolGrant(clean({ recordedHumans: [] }))))
      .toContain('approver_roster_absent');
  });

  it('REFUSES an unreadable roster the same way as an empty one', () => {
    expect(rules(acceptToolGrant(clean({ recordedHumans: null }))))
      .toContain('approver_roster_absent');
  });

  it('REFUSES the four-hour auto-approve timer identity', () => {
    expect(rules(acceptToolGrant(clean({ approvedBy: 'system:auto_approve_timeout' }))))
      .toContain('approver_is_non_human');
  });

  it('REFUSES "unknown", which is the identity that actually walks through', () => {
    // approvalRequestController writes `req.admin?.email || 'unknown'`, and
    // isNonHumanIdentity('unknown') is FALSE — so only the positive roster catches it.
    const verdict = acceptToolGrant(clean({ approvedBy: 'unknown', recordedHumans: [ALI] }));
    expect(rules(verdict)).toContain('approver_not_a_recorded_human');
  });

  it('REFUSES somebody real who is not a configured approver', () => {
    const other = 'ram@colaberry.com';
    const verdict = acceptToolGrant(clean({ approvedBy: other, recordedHumans: [other] }));
    expect(rules(verdict)).toContain('approver_not_configured');
    // and NOT for being a stranger — he is a real person, which is a different check
    expect(rules(verdict)).not.toContain('approver_not_a_recorded_human');
  });

  it('REFUSES everybody when the approver set somehow arrives empty', () => {
    expect(rules(acceptToolGrant(clean({ approvers: [] }))))
      .toContain('approver_not_configured');
  });

  it('REFUSES the proposer, even when they are a configured approver', () => {
    // The whole point of keeping the proposer check independent of the approver set.
    const verdict = acceptToolGrant(clean({ proposedBy: ALI }));
    expect(rules(verdict)).toContain('approver_is_the_proposer');
  });

  it('does not refuse the proposer when nobody is recorded as having proposed it', () => {
    expect(rules(acceptToolGrant(clean({ proposedBy: null }))))
      .not.toContain('approver_is_the_proposer');
  });

  it('compares the proposer case-insensitively, so casing cannot defeat it', () => {
    expect(rules(acceptToolGrant(clean({ proposedBy: 'ALI@Colaberry.com' }))))
      .toContain('approver_is_the_proposer');
  });
});

describe('what is being granted', () => {
  it('REFUSES a tool nothing implements', () => {
    expect(rules(acceptToolGrant(clean({ toolName: 'summon_a_pony' }))))
      .toContain('tool_not_registered');
  });

  it('REFUSES when the registered list could not be read, rather than assuming', () => {
    expect(rules(acceptToolGrant(clean({ registeredToolNames: null }))))
      .toContain('tool_catalog_unreadable');
  });

  it('REFUSES an unnamed tool', () => {
    expect(rules(acceptToolGrant(clean({ toolName: '   ' })))).toContain('tool_name_missing');
  });

  it('REFUSES an agent id that matched nothing', () => {
    expect(rules(acceptToolGrant(clean({ agent: null })))).toContain('agent_not_found');
  });
});

/**
 * Agent Tools Phase 4 — the tie between the tool and the capability it is granted for.
 *
 * Before this rule, `capability_id` on a grant was decoration: a grant could name any confirmed
 * capability while granting a tool that capability never asked for, and nothing noticed. That is
 * the gap that made "every action is tied to a tool" unprovable, because the tie was recorded
 * and never checked.
 */
describe('the tool must be one the capability actually requires', () => {
  it('REFUSES a tool the capability does not list', () => {
    expect(rules(acceptToolGrant(clean({ capabilityRequiredTools: ['read_attachments'] }))))
      .toContain('tool_not_required_by_capability');
  });

  it('REFUSES when the capability requires no tools at all', () => {
    // Distinct from "unreadable": an empty list is a capability that asks for nothing, which
    // cannot justify a tool.
    expect(rules(acceptToolGrant(clean({ capabilityRequiredTools: [] }))))
      .toContain('tool_not_required_by_capability');
  });

  it('FAILS CLOSED when the required tools cannot be read', () => {
    // "I could not check" is not "it is fine" — the same posture as tool_catalog_unreadable.
    const out = rules(acceptToolGrant(clean({ capabilityRequiredTools: null })));
    expect(out).toContain('capability_required_tools_unreadable');
    expect(out).not.toContain('tool_not_required_by_capability');
  });

  it('ACCEPTS when the capability does require it — the positive control for this rule', () => {
    const verdict = acceptToolGrant(clean({ capabilityRequiredTools: ['send_email', 'other'] }));
    expect(verdict.ok).toBe(true);
  });

  it('tells the person what the capability DOES ask for, so the refusal is actionable', () => {
    const verdict = acceptToolGrant(clean({ capabilityRequiredTools: ['read_attachments'] }));
    expect(verdict.ok).toBe(false);
    const detail = (verdict as { issues: Array<{ rule: string; detail: string }> }).issues
      .find((i) => i.rule === 'tool_not_required_by_capability')!.detail;
    expect(detail).toContain('read_attachments');
    expect(detail).toContain('required_tools');
  });

  it('says so plainly when the capability lists nothing', () => {
    const verdict = acceptToolGrant(clean({ capabilityRequiredTools: [] }));
    const detail = (verdict as { issues: Array<{ rule: string; detail: string }> }).issues
      .find((i) => i.rule === 'tool_not_required_by_capability')!.detail;
    expect(detail).toContain('no required tools at all');
  });

  it('does NOT pile this rule on top of a capability that was already refused', () => {
    // Telling somebody their tool is not required by a capability that was rejected is noise on
    // top of the real refusal, and a refusal list that cries wolf gets skimmed.
    const out = rules(acceptToolGrant(clean({
      capabilityState: 'rejected',
      capabilityRequiredTools: ['read_attachments'],
    })));
    expect(out).toContain('capability_rejected');
    expect(out).not.toContain('tool_not_required_by_capability');
  });

  it('does NOT pile this rule on top of a missing capability id', () => {
    const out = rules(acceptToolGrant(clean({ capabilityId: '', capabilityRequiredTools: null })));
    expect(out).toContain('capability_id_missing');
    expect(out).not.toContain('capability_required_tools_unreadable');
  });

  it('does NOT pile this rule on top of an unregistered tool', () => {
    const out = rules(acceptToolGrant(clean({
      toolName: 'not_a_real_tool',
      capabilityRequiredTools: ['send_email'],
    })));
    expect(out).toContain('tool_not_registered');
    expect(out).not.toContain('tool_not_required_by_capability');
  });
});

describe('what it is being granted for', () => {
  it('REFUSES a capability still in draft', () => {
    expect(rules(acceptToolGrant(clean({ capabilityState: 'draft' }))))
      .toContain('capability_not_confirmed');
  });

  it('REFUSES a capability that matched no record at all', () => {
    expect(rules(acceptToolGrant(clean({ capabilityState: null }))))
      .toContain('capability_not_confirmed');
  });

  it('REFUSES a rejected capability by its own name, not as "not confirmed"', () => {
    // Granting on a rejected capability is a REVERSAL, a different decision with a different
    // author. Collapsing it into capability_not_confirmed would hide that.
    const r = rules(acceptToolGrant(clean({ capabilityState: 'rejected' })));
    expect(r).toContain('capability_rejected');
    expect(r).not.toContain('capability_not_confirmed');
  });

  it('REFUSES a grant naming no capability', () => {
    expect(rules(acceptToolGrant(clean({ capabilityId: '' }))))
      .toContain('capability_id_missing');
  });

  it('ACCEPTS once the capability is confirmed — the positive control AF11.0 made possible', () => {
    // Before AF11.0 all 443 capabilities were draft with no way to change that, so the draft
    // refusal refused every grant that could ever be requested and could not be shown to work.
    expect(acceptToolGrant(clean({ capabilityState: 'draft' })).ok).toBe(false);
    expect(acceptToolGrant(clean({ capabilityState: 'confirmed' })).ok).toBe(true);
  });
});

describe('every refusal is returned, not the first', () => {
  it('reports the approver, the tool and the capability problems together', () => {
    const r = rules(acceptToolGrant(clean({
      approvedBy: 'unknown',
      toolName: 'summon_a_pony',
      capabilityState: 'draft',
    })));
    expect(r).toEqual(expect.arrayContaining([
      'approver_not_a_recorded_human', 'tool_not_registered', 'capability_not_confirmed',
    ]));
    expect(r.length).toBeGreaterThanOrEqual(3);
  });
});

describe('WHAT DATA, and WHERE — Phase 2b, the scope the grant records', () => {
  describe('the ranking the whole environment rule rests on', () => {
    it('ranks every environment the enum allows, so a third one cannot default to a rank', () => {
      // The reason the ranks are written out rather than derived from TOOL_ENVIRONMENTS' order.
      // Add 'staging' to the enum and this fails, instead of it silently inheriting index 2 and
      // ranking as the most dangerous environment because of where somebody typed it.
      for (const environment of TOOL_ENVIRONMENTS) {
        const verdict = acceptToolGrant(clean({ environment }));
        expect({ environment, ranked: rules(verdict) })
          .toEqual({ environment, ranked: [] });
      }
    });
  });

  describe('WHERE', () => {
    it('REFUSES a grant that does not say where it applies', () => {
      expect(rules(acceptToolGrant(clean({ environment: '' }))))
        .toContain('grant_environment_missing');
    });

    it('REFUSES an environment the storage constraint would reject anyway', () => {
      // Two checks that agree. Without this the row reaches chk_adtg_environment_known and
      // fails as a 500 from the driver instead of a sentence naming the two valid values.
      expect(rules(acceptToolGrant(clean({ environment: 'staging' }))))
        .toContain('grant_environment_unknown');
    });

    it('ACCEPTS production, which is the point — this narrows grants, it does not forbid them', () => {
      const verdict = acceptToolGrant(clean({ environment: 'production' }));
      expect(verdict.ok).toBe(true);
      if (!verdict.ok) return;
      expect(verdict.grant.environment).toBe('production');
    });
  });

  describe('the names have to be real, in BOTH environments', () => {
    it('REFUSES a dataset that is not in the catalog', () => {
      const r = rules(acceptToolGrant(clean({ datasets: ['leadz'] })));
      expect(r).toContain('grant_datasets_not_catalogued');
    });

    it('names every uncatalogued dataset, not just the first', () => {
      const verdict = acceptToolGrant(clean({ datasets: ['leadz', 'leads', 'enrolments'] }));
      expect(verdict.ok).toBe(false);
      if (verdict.ok) return;
      const detail = verdict.issues.find((i) => i.rule === 'grant_datasets_not_catalogued')!.detail;
      expect(detail).toContain('leadz');
      expect(detail).toContain('enrolments');
      // And not the one that IS catalogued.
      expect(detail).not.toContain('leads,');
    });

    it('refuses a typo on the SANDBOX too, which is the deliberate part', () => {
      // Ali's ruling widens what a sandbox grant may REACH. It does not make a misspelled
      // dataset name acceptable there — accepting one means the first time anybody finds out is
      // the production grant, by which point the wrong name is already in a permission record.
      expect(rules(acceptToolGrant(clean({ environment: 'sandbox', datasets: ['leadz'] }))))
        .toContain('grant_datasets_not_catalogued');
      expect(rules(acceptToolGrant(clean({ environment: 'production', datasets: ['leadz'] }))))
        .toContain('grant_datasets_not_catalogued');
    });

    it('REFUSES when the catalog could not be read AND a dataset was named', () => {
      expect(rules(acceptToolGrant(clean({ knownDatasets: null, datasets: ['leads'] }))))
        .toContain('grant_dataset_roster_absent');
    });

    it('does NOT refuse an unreadable catalog when the grant names no dataset', () => {
      // The roster is consulted only when there is something to check against it. A tool that
      // reads no table must stay grantable during a metadata outage.
      const verdict = acceptToolGrant(clean({ knownDatasets: null, datasets: [] }));
      expect(verdict.ok).toBe(true);
    });

    it('ACCEPTS an empty scope, because a tool that sends email reads no table', () => {
      const verdict = acceptToolGrant(clean({ datasets: [] }));
      expect(verdict.ok).toBe(true);
      if (!verdict.ok) return;
      expect(verdict.grant.datasets).toEqual([]);
    });

    it('de-duplicates and trims what it records', () => {
      const verdict = acceptToolGrant(clean({
        datasets: ['leads', ' leads ', 'enrollments', ''],
      }));
      expect(verdict.ok).toBe(true);
      if (!verdict.ok) return;
      expect(verdict.grant.datasets).toEqual(['leads', 'enrollments']);
    });

    it('does not throw on a JSONB value that is not an array', () => {
      // `datasets` is jsonb, which the MODEL types and the database does not. Iterating a
      // string threw a TypeError here, which surfaces as a 500 rather than as a refusal — and a
      // 500 teaches the caller the endpoint is broken instead of what is wrong with the grant.
      const verdict = acceptToolGrant(clean({ datasets: 'leads' as never }));
      expect(verdict.ok).toBe(true);
      if (!verdict.ok) return;
      // Coerced to NO scope, never to the wider reading.
      expect(verdict.grant.datasets).toEqual([]);
    });
  });

  describe('the cited request is a CEILING', () => {
    it('ACCEPTS a grant that matches what the request asked for — the positive control', () => {
      const verdict = acceptToolGrant(clean({
        environment: 'production',
        datasets: ['leads'],
        requestScope: { environment: 'production', datasets: ['leads', 'enrollments'] },
      }));
      expect(verdict.ok).toBe(true);
    });

    it('REFUSES a production grant against a sandbox request', () => {
      expect(rules(acceptToolGrant(clean({
        environment: 'production',
        datasets: ['leads'],
        requestScope: { environment: 'sandbox', datasets: ['leads'] },
      })))).toContain('grant_environment_exceeds_request');
    });

    it('ACCEPTS a sandbox grant against a production request, because that is a NARROWING', () => {
      // This is the direction Ali's ruling makes safe, and it is why environment is ranked
      // rather than compared for equality. An approver may always give less.
      const verdict = acceptToolGrant(clean({
        environment: 'sandbox',
        datasets: ['leads'],
        requestScope: { environment: 'production', datasets: ['leads'] },
      }));
      expect(verdict.ok).toBe(true);
    });

    it('REFUSES a production grant covering a dataset the request never named', () => {
      const verdict = acceptToolGrant(clean({
        environment: 'production',
        datasets: ['leads', 'enrollments'],
        requestScope: { environment: 'production', datasets: ['leads'] },
      }));
      expect(rules(verdict)).toContain('grant_datasets_exceed_request');
      if (verdict.ok) return;
      const detail = verdict.issues.find((i) => i.rule === 'grant_datasets_exceed_request')!.detail;
      expect(detail).toContain('enrollments');
    });

    it('REFUSES a production grant naming datasets when the request declared none', () => {
      // Falls out of the same subset rule with no special case: a production request with no
      // datasets declared no database reads at all, so anything named here is outside review.
      expect(rules(acceptToolGrant(clean({
        environment: 'production',
        datasets: ['leads'],
        requestScope: { environment: 'production', datasets: [] },
      })))).toContain('grant_datasets_exceed_request');
    });

    it('does NOT treat the request list as a ceiling on the sandbox — Ali\'s ruling', () => {
      // An unscoped sandbox read is explicitly legitimate, so an empty `read_datasets` on a
      // sandbox request means "no ceiling was declared", NOT "no datasets". Reading it as a
      // ceiling of zero would refuse every sandbox grant that named a table, which is the
      // common case, and the picker would have made the product worse.
      const verdict = acceptToolGrant(clean({
        environment: 'sandbox',
        datasets: ['leads', 'enrollments'],
        requestScope: { environment: 'sandbox', datasets: [] },
      }));
      expect(verdict.ok).toBe(true);
    });

    it('REFUSES when a request was cited and its scope could not be read', () => {
      // `null` is "cited and unreadable", which must not collapse into `undefined`, which is
      // "no request cited". Collapsing them makes an unreadable request the MOST permissive
      // case instead of the most suspicious one.
      expect(rules(acceptToolGrant(clean({
        environment: 'production', datasets: ['leads'], requestScope: null,
      })))).toContain('grant_request_scope_unreadable');
    });

    it('REFUSES when the cited request records an environment nothing can rank', () => {
      // What a HALF-APPLIED Phase 2a deploy looks like: `ADD COLUMN` ran, `SET NOT NULL` did
      // not, and the detail row carries no environment. Without this the grant is written with
      // a scope nobody checked.
      expect(rules(acceptToolGrant(clean({
        environment: 'production',
        datasets: ['leads'],
        requestScope: { environment: '', datasets: ['leads'] },
      })))).toContain('grant_request_scope_unreadable');
    });

    it('applies NO ceiling when no request was cited, which is the promotion path', () => {
      const verdict = acceptToolGrant(clean({
        environment: 'production', datasets: ['leads', 'enrollments'],
      }));
      expect(verdict.ok).toBe(true);
    });
  });

  describe('a re-grant cannot widen the row', () => {
    it('ACCEPTS a re-grant of exactly what is already recorded', () => {
      const verdict = acceptToolGrant(clean({
        environment: 'sandbox',
        datasets: ['leads'],
        recordedScope: { environment: 'sandbox', datasets: ['leads'] },
      }));
      expect(verdict.ok).toBe(true);
    });

    it('ACCEPTS a re-grant that narrows, and the caller is told the row kept the wider scope', () => {
      const verdict = acceptToolGrant(clean({
        environment: 'sandbox',
        datasets: ['leads'],
        recordedScope: { environment: 'sandbox', datasets: ['leads', 'enrollments'] },
      }));
      expect(verdict.ok).toBe(true);
    });

    it('REFUSES a re-grant that adds a dataset, rather than reporting a success that changed nothing', () => {
      const verdict = acceptToolGrant(clean({
        environment: 'sandbox',
        datasets: ['leads', 'enrollments'],
        recordedScope: { environment: 'sandbox', datasets: ['leads'] },
      }));
      expect(rules(verdict)).toContain('grant_scope_conflicts_with_recorded');
      if (verdict.ok) return;
      const detail = verdict.issues
        .find((i) => i.rule === 'grant_scope_conflicts_with_recorded')!.detail;
      expect(detail).toContain('enrollments');
    });

    it('REFUSES a re-grant that promotes sandbox to production', () => {
      // The dangerous one. `findOrCreate` returns the sandbox row untouched, so without this
      // rule the caller gets a 200 and believes production access was granted.
      expect(rules(acceptToolGrant(clean({
        environment: 'production',
        datasets: ['leads'],
        recordedScope: { environment: 'sandbox', datasets: ['leads'] },
      })))).toContain('grant_scope_conflicts_with_recorded');
    });

    it('REFUSES a re-grant against a recorded environment it cannot rank', () => {
      // Fails closed. A corrupt recorded environment is not a licence to overwrite it.
      expect(rules(acceptToolGrant(clean({
        environment: 'sandbox',
        datasets: ['leads'],
        recordedScope: { environment: '', datasets: ['leads'] },
      })))).toContain('grant_scope_conflicts_with_recorded');
    });
  });

  describe('scope refusals are not suppressed by unrelated ones', () => {
    it('reports an approver problem AND a scope problem in the same verdict', () => {
      // judgeScope gates its later checks on its OWN issue list, not the shared one. Reading the
      // shared list would mean a caller who fixed their approver met the scope problem for the
      // first time on the resubmit — the half-truth this file's header rules out.
      const r = rules(acceptToolGrant(clean({
        approvedBy: 'unknown',
        environment: 'production',
        datasets: ['leads'],
        requestScope: { environment: 'sandbox', datasets: ['leads'] },
      })));
      expect(r).toEqual(expect.arrayContaining([
        'approver_not_a_recorded_human', 'grant_environment_exceeds_request',
      ]));
    });
  });
});
