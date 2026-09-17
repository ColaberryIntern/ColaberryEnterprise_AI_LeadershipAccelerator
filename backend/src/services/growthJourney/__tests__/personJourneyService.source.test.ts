import * as fs from 'fs';
import * as path from 'path';

/**
 * T410 - the Person 360 service at source level: stored rows only (its import
 * list is the models and the two tenancy helpers, nothing of the pipeline -
 * the T312 discipline), the column lists name no email column and no blob,
 * and the scope clause is the list routes' clause plus the lead.
 */

jest.mock('../../../models', () => ({}));
jest.mock('../../../modules/tenancy/leadContextService', () => ({ getAuthorizedLeadContexts: jest.fn() }));

import {
  PERSON_CLASSIFICATION_ATTRIBUTES,
  PERSON_CONVERSATION_ATTRIBUTES,
  PERSON_DECISION_ATTRIBUTES,
  PERSON_HANDOFF_ATTRIBUTES,
  PERSON_OUTCOME_ATTRIBUTES,
  PERSON_RELATIONSHIP_ATTRIBUTES,
  PERSON_TRANSITION_ATTRIBUTES,
  personScopeWhere,
} from '../personJourneyService';

const src = fs.readFileSync(path.join(__dirname, '..', 'personJourneyService.ts'), 'utf8');
const imports = Array.from(src.matchAll(/^import .* from '([^']+)';/gm)).map((m) => m[1]);

it('imports the models and the two tenancy helpers and nothing else - no strategy, no scorer, no resolver, no service that writes', () => {
  expect(imports.sort()).toEqual(['../../models', '../../modules/tenancy/leadContextService', '../../modules/tenancy/tenantAuthorization']);
  expect(src).not.toMatch(/strategies\/|scoring\/|governor\/|decisionService|classificationService|subjectResolver|handoffService|dispositionService|emailService|sendNewLeadAlert|notify/);
  expect(src).not.toMatch(/\.(create|update|destroy|upsert|bulkCreate)\(/);
});

it('the relationships come from the authorized reader - the confidentiality rule - never from the model directly', () => {
  expect(src).toMatch(/getAuthorizedLeadContexts\(leadId, ctx\.authorizedTenantIds, ctx\.isPlatformSuperAdmin\)/);
  expect(src).not.toMatch(/LeadTenantContext/);
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
