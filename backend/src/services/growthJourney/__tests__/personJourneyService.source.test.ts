import * as fs from 'fs';
import * as path from 'path';

/**
 * T410 - the Person 360 service at source level: stored rows only (its import
 * list is the models and the two tenancy helpers, nothing of the pipeline -
 * the T312 discipline), the column lists name no email column and no blob,
 * and the scope clause is the list routes' clause plus the lead.
 */

// T211 attempt 3: the models mock was `{}`, which was enough for the pure
// functions and the source scans below but could not drive `loadPersonJourney`.
// A mutation sweep then showed why that mattered: changing the view's emitted
// `subject_ref` to a DIFFERENT identity for the same person left every suite in
// the repo green, because nothing anywhere asserted it. The stubs below exist so
// the last test in this file can run the real view and read what it emits.
const leadFindByPk = jest.fn();
const classificationFindAll = jest.fn();
const emptyFindAll = jest.fn();
const conversationFindOne = jest.fn();

jest.mock('../../../models', () => ({
  Lead: { findByPk: (...a: unknown[]) => leadFindByPk(...a) },
  GrowthJourneyClassification: { findAll: (...a: unknown[]) => classificationFindAll(...a) },
  GrowthJourneyDecision: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  GrowthJourneyTransition: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  GrowthJourneyHandoff: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  GrowthJourneyOutcome: { findAll: (...a: unknown[]) => emptyFindAll(...a) },
  GrowthJourneyConversationOwnership: { findOne: (...a: unknown[]) => conversationFindOne(...a) },
}));
const getAuthorizedLeadContexts = jest.fn();
jest.mock('../../../modules/tenancy/leadContextService', () => ({
  getAuthorizedLeadContexts: (...a: unknown[]) => getAuthorizedLeadContexts(...a),
}));

import {
  PERSON_CLASSIFICATION_ATTRIBUTES,
  PERSON_CONVERSATION_ATTRIBUTES,
  PERSON_DECISION_ATTRIBUTES,
  PERSON_HANDOFF_ATTRIBUTES,
  PERSON_OUTCOME_ATTRIBUTES,
  PERSON_RELATIONSHIP_ATTRIBUTES,
  PERSON_TRANSITION_ATTRIBUTES,
  loadPersonJourney,
  matchesScope,
  personScopeWhere,
} from '../personJourneyService';
import { subjectRefFrom } from '../../identity/identifierPrecedence';

const src = fs.readFileSync(path.join(__dirname, '..', 'personJourneyService.ts'), 'utf8');
const imports = Array.from(src.matchAll(/^import .* from '([^']+)';/gm)).map((m) => m[1]);

/**
 * The exact import set this read-only view is allowed.
 *
 * `identity/identifierPrecedence` was added by T211 attempt 3, and it is here
 * with a determination rather than by widening the assertion:
 *
 *   It is the ONE builder for the `subject_ref` spelling (T208) — pure, with an
 *   empty import list of its own, no I/O and no model access. This view used to
 *   spell `` `lead:${leadId}` `` inline, which was the FIFTH copy of that
 *   spelling in the codebase; a T211 tripwire caught it. Importing the shared
 *   builder is the opposite of what this allowlist exists to prevent: it adds a
 *   pure function, not a strategy, scorer, resolver or writer, and the two
 *   assertions below still prove none of those arrived.
 *
 * Nothing joins this list without a reason beside it.
 */
const ALLOWED_IMPORTS = [
  '../../models',
  '../../modules/tenancy/leadContextService',
  '../../modules/tenancy/tenantAuthorization',
  '../identity/identifierPrecedence',
];

it('imports the models and the two tenancy helpers and nothing else - no strategy, no scorer, no resolver, no service that writes', () => {
  expect(imports.sort()).toEqual([...ALLOWED_IMPORTS].sort());
  expect(src).not.toMatch(/strategies\/|scoring\/|governor\/|decisionService|classificationService|subjectResolver|handoffService|dispositionService|emailService|sendNewLeadAlert|notify/);
  expect(src).not.toMatch(/\.(create|update|destroy|upsert|bulkCreate)\(/);
});

it('the relationships come from the authorized reader - the confidentiality rule - never from the model directly, and are then filtered by the queries\' own clause', () => {
  expect(src).toMatch(/getAuthorizedLeadContexts\(leadId, ctx\.authorizedTenantIds, ctx\.isPlatformSuperAdmin\)/);
  expect(src).not.toMatch(/LeadTenantContext/);
  expect(src).toMatch(/\.filter\(\(c\) => matchesScope\(c, where\)\)/);
  // One scope rule: no second brand or tenant predicate written by hand.
  expect(src).not.toMatch(/inBrandScope|authorizedBrandIds\.includes|authorizedTenantIds\.includes|brand_id === /);
});

it('matchesScope reads a clause the way the query would: equality, membership, and the empty clause matching all', () => {
  expect(matchesScope({ lead_id: 501, tenant_id: 't-1', brand_id: 'b-1' }, { lead_id: 501, tenant_id: 't-1' })).toBe(true);
  expect(matchesScope({ lead_id: 501, tenant_id: 't-2', brand_id: 'b-1' }, { lead_id: 501, tenant_id: 't-1' })).toBe(false);
  expect(matchesScope({ lead_id: 501, tenant_id: 't-1', brand_id: 'b-1' }, { lead_id: 501, tenant_id: ['t-1', 't-2'], brand_id: ['b-1'] })).toBe(true);
  expect(matchesScope({ lead_id: 501, tenant_id: 't-1', brand_id: 'b-2' }, { lead_id: 501, tenant_id: ['t-1', 't-2'], brand_id: ['b-1'] })).toBe(false);
  expect(matchesScope({ lead_id: 501, tenant_id: 't-1', brand_id: 'b-2' }, { lead_id: 501 })).toBe(true);
  expect(matchesScope({ lead_id: 501, tenant_id: 't-1' }, { lead_id: 501, tenant_id: null })).toBe(false);
});

it('no column list names an email, a message body, a candidate blob, an evidence packet or free metadata of a context', () => {
  const all = [...PERSON_RELATIONSHIP_ATTRIBUTES, ...PERSON_CLASSIFICATION_ATTRIBUTES, ...PERSON_DECISION_ATTRIBUTES, ...PERSON_TRANSITION_ATTRIBUTES, ...PERSON_HANDOFF_ATTRIBUTES, ...PERSON_OUTCOME_ATTRIBUTES, ...PERSON_CONVERSATION_ATTRIBUTES];
  for (const col of all) expect(col).not.toMatch(/email|phone|message|body|candidates|suppressed|deferred_actions|scores|contact_evidence|selected_content|evidence|talking_points|qualification_gaps/);
  expect(PERSON_RELATIONSHIP_ATTRIBUTES).not.toContain('metadata');
  expect(PERSON_HANDOFF_ATTRIBUTES).not.toContain('idempotency_key');
  // What the plan names, present: status, queue, SLA and disposition on a handoff; date, action, reason and state on a decision.
  for (const c of ['status', 'owner_queue', 'sla_due_at', 'disposition']) expect(PERSON_HANDOFF_ATTRIBUTES).toContain(c);
  for (const c of ['id', 'decision_date', 'selected_action', 'reason', 'state_at_decision']) expect(PERSON_DECISION_ATTRIBUTES).toContain(c);
});

it('the scope clause is tenantScopeWhere plus the lead plus the requested brand', () => {
  const base = { platformIdentityId: 'p', organizationId: null, roles: [], isPlatformSuperAdmin: false };
  expect(personScopeWhere({ ...base, tenantId: 't-1', brandId: null, authorizedTenantIds: ['t-1'], authorizedBrandIds: null }, 501)).toEqual({ lead_id: 501, tenant_id: 't-1' });
  expect(personScopeWhere({ ...base, tenantId: 't-1', brandId: null, authorizedTenantIds: ['t-1'], authorizedBrandIds: ['b-tr'] }, 501)).toEqual({ lead_id: 501, tenant_id: 't-1', brand_id: ['b-tr'] });
  expect(personScopeWhere({ ...base, tenantId: 't-1', brandId: 'b-ent', authorizedTenantIds: ['t-1'], authorizedBrandIds: null }, 501)).toEqual({ lead_id: 501, tenant_id: 't-1', brand_id: 'b-ent' });
  expect(personScopeWhere({ ...base, tenantId: null, brandId: null, authorizedTenantIds: [], authorizedBrandIds: null, isPlatformSuperAdmin: true }, 501)).toEqual({ lead_id: 501 });
  expect(personScopeWhere({ ...base, tenantId: null, brandId: null, authorizedTenantIds: [], authorizedBrandIds: null }, 501)).toEqual({ lead_id: 501, tenant_id: null });
});

/**
 * T211 attempt 3 — the view's own identity, pinned at last.
 *
 * A verifier found that `personChainService` carried a local re-implementation
 * of the subject-ref spelling and that nothing caught changing it. Fixing that
 * exposed a second, worse case here: this view built `` `lead:${leadId}` ``
 * inline — a FIFTH copy — and a mutation to `` `visitor:${leadId}-MUTANT` ``,
 * a DIFFERENT identity for the same person, left all 109 tests in T211's
 * evidence set green, and every other suite in the repo too. The acceptance
 * suite drives `loadPersonJourney` but never looks at `subject_ref`.
 *
 * The expected value CALLS the shared builder instead of hardcoding 'lead:501'.
 * A literal would still pass if the view and the builder drifted together,
 * which is precisely the disagreement this criterion exists to prevent.
 */
it('T211: emits the subject ref the ONE shared builder produces, not its own spelling', async () => {
  const LEAD = 501;
  leadFindByPk.mockResolvedValue({ get: () => LEAD });
  getAuthorizedLeadContexts.mockResolvedValue([
    { lead_id: LEAD, tenant_id: 't-1', brand_id: 'b-ent' },
  ]);
  classificationFindAll.mockResolvedValue([{ enrollment_id: null }]);
  emptyFindAll.mockResolvedValue([]);
  conversationFindOne.mockResolvedValue(null);

  const res = await loadPersonJourney({
    leadId: LEAD,
    ctx: {
      tenantId: 't-1', brandId: 'b-ent',
      authorizedTenantIds: ['t-1'], authorizedBrandIds: null,
      isPlatformSuperAdmin: false,
    } as never,
    limit: 25,
  });

  if (res.status !== 'found') throw new Error(`expected found, got ${res.status}`);

  const expected = subjectRefFrom({ leadId: LEAD });
  // The control: the builder really produced a ref, so `undefined === undefined`
  // cannot pass this pair.
  expect(expected).toBe('lead:501');
  expect(res.person.subject.subject_ref).toBe(expected);
});
