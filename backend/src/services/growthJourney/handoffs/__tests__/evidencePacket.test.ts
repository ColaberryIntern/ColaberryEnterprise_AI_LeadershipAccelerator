import { DISPOSITION_OPTIONS, PACKET_FIELDS, assertPacketCarriesNoAddress, buildEvidencePacket, type BuildPacketArgs } from '../evidencePacket';
import { AddressInPayloadError } from '../../noAddress';
import type { DecisionRowView, StoredSignals } from '../types';

/**
 * T404 — the §9 packet is built from stored rows, names every field or says
 * why it cannot, and never carries an address.
 */

const AS_OF = new Date('2026-09-16T12:00:00Z');

const decision = (over: Partial<DecisionRowView> = {}): DecisionRowView => ({
  id: 'd-1', tenant_id: 't-col', brand_id: 'b-ent', program_id: 'p-ent', subject_ref: 'lead:501', lead_id: 501, enrollment_id: null,
  classification_id: 'c-1', decision_date: '2026-09-16', selected_action: 'WAIT', selected_path: 'ai_consulting', state_at_decision: 'DISCOVERY_READY',
  overlays_at_decision: [], scores: { summary: 62, available: true, computed_at: '2026-09-16T11:00:00Z', dimensions: [{ key: 'fit', value: 70, gap: null }, { key: 'urgency', value: null, gap: 'no_source' }] },
  score_gaps: ['urgency'], contact_evidence: { channels: { email: { eligible: true, reason: 'express_consent', evaluator: 'consent' }, sms: { eligible: false, reason: 'no_express_consent', evaluator: 'consent' }, voice: { eligible: false, reason: 'no_express_consent', evaluator: 'consent' }, in_app: { eligible: false, reason: 'no_app', evaluator: 'none' } } },
  human_conversation: 'no', sales_capacity: 'unknown', deferred_actions: [{ would: 'create_handoff', reason: 'commercial_state:DISCOVERY_READY', payload: { owner: 'sales' } }],
  requires_human_review: false, reason: 'no_candidate:commercial_state_needs_layer_4:DISCOVERY_READY', ruleset_version: 'business-1', created_at: AS_OF,
  ...over,
});

const signals = (over: Partial<StoredSignals> = {}): StoredSignals => ({
  lead: { pipeline_stage: 'meeting_scheduled', industry: 'logistics', employee_count: 120, annual_revenue: null, has_company: true },
  context: { organization_id: 'org-1', first_source_id: 'src-1', first_entry_point_id: 'ep-1', first_campaign_id: 'camp-1', first_touch_at: new Date('2026-08-01T00:00:00Z') },
  counts: { inbound: { replied: 1, booked_meeting: 1, answered: 0, declined: 0, no_response: 0 }, appointments: { scheduled: 1, completed: 0, no_show: 0, cancelled: 0 }, hasDeliveryEngagement: false },
  contacts: { by_channel: { email: { outbound: 3, inbound: 1, last_outbound_at: new Date('2026-09-10T00:00:00Z'), last_inbound_at: new Date('2026-09-11T00:00:00Z') } }, total_outbound: 3, total_inbound: 1 },
  explicit_request: { present: true, reasons: ['request_outcome_in_72h:1'] },
  sla_hours: 24,
  ...over,
});

const args = (over: Partial<BuildPacketArgs> = {}): BuildPacketArgs => ({
  trigger: { source: 'decision_deferral', owner_queue: 'sales', reason: 'commercial_state:DISCOVERY_READY' },
  refs: { tenant_id: 't-col', brand_id: 'b-ent', brand_slug: 'colaberry-enterprise', program: { id: 'p-ent', slug: 'business-growth', kind: 'business' }, subject_ref: 'lead:501', lead_id: 501, enrollment_id: null, path: 'ai_consulting' },
  decision: decision(),
  signals: signals(),
  urgent: true,
  expected_value: { value: 66, components: { state_rank: 4, path_weight: 4, engagement: 6 }, formula: 'state_rank*10 + path_weight*5 + engagement' },
  priority: 'critical',
  sla_due_at: new Date('2026-09-17T12:00:00Z'),
  built_at: AS_OF,
  ...over,
});

describe('every §9 field is present, or explicitly unavailable with a reason', () => {
  it('the full case names every field', () => {
    const p = buildEvidencePacket(args());
    for (const f of PACKET_FIELDS) expect(p).toHaveProperty(f);
    expect(p.person).toEqual({ subject_ref: 'lead:501', lead_id: 501, enrollment_id: null });
    expect(p.account).toEqual({ organization_id: 'org-1' });
    expect(p.origin).toEqual({ first_source_id: 'src-1', first_entry_point_id: 'ep-1', first_campaign_id: 'camp-1', first_touch_at: '2026-08-01T00:00:00.000Z' });
    expect(p.escalation_reason).toEqual({ source: 'decision_deferral', reason: 'commercial_state:DISCOVERY_READY', decision_id: 'd-1', decision_reason: 'no_candidate:commercial_state_needs_layer_4:DISCOVERY_READY' });
    expect((p.signals as { scores: { components: unknown[] } }).scores.components).toEqual([{ key: 'fit', value: 70, gap: null }, { key: 'urgency', value: null, gap: 'no_source' }]);
    expect(p.transcript).toEqual({ available: false, reason: 'permission_has_no_source' });
    expect(p.qualification_gaps).toEqual(['urgency', 'firmographic:annual_revenue']);
    expect(p.likely_need).toBe('a decision on where AI pays off first');
    expect(p.talking_points).toHaveLength(3);
    expect(p.best_permitted_channel).toBe('email');
    expect(p.sla).toEqual({ hours: 24, due_at: '2026-09-17T12:00:00.000Z' });
    expect(p.urgent).toEqual({ value: true, reasons: ['request_outcome_in_72h:1'] });
    expect(p.links).toEqual({ person: '/admin/people/lead:501', decision_id: 'd-1', organization_id: 'org-1' });
    expect(p.disposition_options).toBe(DISPOSITION_OPTIONS);
  });

  it('with no decision, no context, no counts, no policy and no path: every gap is named, nothing invented', () => {
    const p = buildEvidencePacket(args({
      decision: null,
      refs: { tenant_id: 't-col', brand_id: 'b-ent', brand_slug: 'colaberry-enterprise', program: null, subject_ref: 'lead:501', lead_id: 501, enrollment_id: null, path: null },
      signals: signals({ lead: null, context: null, counts: null, contacts: { by_channel: {}, total_outbound: 0, total_inbound: 0 }, explicit_request: { present: false, reasons: [] }, sla_hours: null }),
      urgent: false, priority: 'low', sla_due_at: null,
      trigger: { source: 'manual', owner_queue: 'human_review', reason: 'routing_rule:rp-1' },
    }));
    for (const f of PACKET_FIELDS) expect(p).toHaveProperty(f);
    expect(p.account).toEqual({ available: false, reason: 'no_organization_linked' });
    expect(p.origin).toEqual({ available: false, reason: 'no_lead_tenant_context' });
    expect((p.signals as { scores: unknown }).scores).toEqual({ available: false, reason: 'no_decision' });
    expect((p.contact_history as { outcomes: unknown }).outcomes).toEqual({ available: false, reason: 'counts_not_loaded' });
    expect(p.likely_need).toEqual({ available: false, reason: 'no_path' });
    expect(p.talking_points).toEqual([]);
    expect(p.consent).toEqual({ available: false, reason: 'no_decision' });
    expect(p.best_permitted_channel).toBeNull();
    expect(p.sla).toEqual({ available: false, reason: 'no_sla_policy' });
    expect(p.qualification_gaps).toEqual(['no_lead_row', 'no_decision']);
    expect(p.links).toEqual({ person: '/admin/people/lead:501', decision_id: null, organization_id: null });
  });

  it('T414: a family the brand refused is a named qualification gap - the path stays null, and no need or talking point is drawn from it', () => {
    const base = args().refs;
    const p = buildEvidencePacket(args({ refs: { ...base, brand_id: 'b-flot', brand_slug: 'ai-flotation', path: null, path_refused: 'business_training:explicit_deny' } }));
    expect(p.qualification_gaps).toEqual(['urgency', 'path_not_offered_by_brand:business_training:explicit_deny', 'firmographic:annual_revenue']);
    expect((p.brand_program_path as { path: unknown }).path).toBeNull();
    expect(p.likely_need).toEqual({ available: false, reason: 'no_path' });
    expect(p.talking_points).toEqual([]);
    // Absent refusal, absent gap: the full case above is unchanged.
    expect(buildEvidencePacket(args()).qualification_gaps).toEqual(['urgency', 'firmographic:annual_revenue']);
  });

  it('the best permitted channel is the first eligible in email, sms, voice, in_app order — and none when all are closed', () => {
    const closed = decision({ contact_evidence: { channels: { email: { eligible: false, reason: 'x', evaluator: 'y' }, sms: { eligible: true, reason: 'ok', evaluator: 'consent' } } } });
    expect(buildEvidencePacket(args({ decision: closed })).best_permitted_channel).toBe('sms');
    const none = decision({ contact_evidence: { channels: { email: { eligible: false, reason: 'x', evaluator: 'y' } } } });
    expect(buildEvidencePacket(args({ decision: none })).best_permitted_channel).toBeNull();
  });
});

describe('no address, no body, no transcript', () => {
  it('a packet built from ids and counts carries no @', () => {
    expect(() => assertPacketCarriesNoAddress(buildEvidencePacket(args()))).not.toThrow();
  });

  it('a packet that somehow carries an address is refused, naming the path', () => {
    const p = buildEvidencePacket(args());
    (p.links as Record<string, unknown>).person = '/admin/people/buyer@example.com';
    expect(() => assertPacketCarriesNoAddress(p)).toThrow(AddressInPayloadError);
    try {
      assertPacketCarriesNoAddress(p);
    } catch (e) {
      expect((e as AddressInPayloadError).path).toBe('evidence.links.person');
      expect((e as AddressInPayloadError).error_class).toBe('ContractViolation');
    }
  });

  it('the packet has no field for a message body or a transcript text, by construction', () => {
    const p = buildEvidencePacket(args());
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/"body"|"message"|"transcript_text"|"phone"/);
    // `email` appears only as a CHANNEL label (an object), never as a string value.
    expect(json).not.toMatch(/"email":"/);
    expect(json).toMatch(/"email":\{/);
  });
});
