/**
 * enterpriseIntakeService - the Colaberry Enterprise intake, Phase 1 (W28).
 *
 *     "an intake process that starts from the moment they decide to fill out the form...
 *      upon completing that they can have the AI call them."  (Ali, 2026-11-20)
 *
 * Decisions (Ali, 2026-11-20): the AI interview runs right after the form (Q1 A); the time
 * figure shown is built from their own numbers (Q2 A); calls come from a new Enterprise
 * agent with its own number (Q3 A).
 *
 * What this module owns is only the Enterprise door. The interview itself is the ONE intake
 * (`runIntakeTurn` / `finishIntake`, shared with AI Flotation and the admin side), so the
 * mirror rule holds: a change to how we interview changes it everywhere. Two things differ
 * here, on purpose:
 *   - Nothing is built. An Enterprise prospect gets a first meeting with pilot options, not
 *     a student project, so every turn and every call ends with `buildFor: none`.
 *   - The written brief is composed on the server from the stored form and put in front of
 *     the conversation, so the interviewer never asks what the form already answered and
 *     the browser cannot rewrite what the form said.
 */
import { randomUUID } from 'crypto';
import { z } from 'zod';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import { createLead, leadSchema } from '../leadService';
import { capturePhoneConsent } from '../consent/capturePhoneConsent';
import { requiredPhone } from '../../schemas/phone';
import { runIntakeTurn, boundTurns } from '../delivery/projectIntake';
import type { IntakeOutcome } from '../delivery/projectIntake';
import { requestInstantCallback } from '../callbackRequestService';
import { env } from '../../config/env';
import { ENTERPRISE_INTAKE_SOURCE } from './enterpriseIntakeSource';

export const FORM_TYPE = 'demo_pilot_request';

const text = (max: number) => z.string().trim().max(max).optional().default('');
const figure = (max: number) => z.number().min(0).max(max).nullable().optional().default(null);

export const intakeFormSchema = z.object({
  fullName: z.string().trim().min(1, 'Name is required').max(255),
  email: z.string().trim().email('Invalid email address').max(255),
  company: z.string().trim().min(1, 'Company is required').max(255),
  role: text(100),
  // PH1 (Ali 2026-11-19): every public lead form requires a phone number. Same rule as /api/leads.
  phone: requiredPhone,
  callConsent: z.boolean().optional().default(false),
  website: text(255),
  service: text(50),
  department: text(100),
  process: z.string().trim().min(1, 'Name one process').max(5000),
  peopleCount: figure(100000),
  hoursPerWeek: figure(100000),
  requiredReturn: text(500),
  startTiming: text(50),
  otherDeciders: text(500),
  consentContact: z.literal(true, { message: 'Consent is required' }),
  utmSource: text(255),
  utmMedium: text(255),
  utmCampaign: text(255),
  pageUrl: text(500),
});

export type IntakeForm = z.infer<typeof intakeFormSchema>;

/** A number we may dial: the person gave one AND ticked "the AI may call me". */
export const callable = (i: { phone: string; call_consent: boolean }): boolean =>
  i.call_consent && i.phone.replace(/\D/g, '').length >= 7;

/** Whether "Call me now" can work at all on this server. Unset agent means typing only. */
export const voiceConfigured = (): boolean =>
  Boolean(env.enableVoiceCalls && env.synthflowApiKey && env.synthflowEnterpriseIntakeAgentId);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function findIntake(token: string): Promise<EnterpriseIntake | null> {
  if (!UUID.test(String(token || ''))) return null;
  return EnterpriseIntake.findByPk(token);
}

const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

/**
 * Everything the form said, as the person's own opening message. It is the lead's message
 * (so the existing pipeline sees every answer), the first turn of the typed interview, and
 * the brief the call opens from.
 */
export function writtenBrief(i: {
  company: string; role: string; website: string; service: string; department: string;
  process: string; people_count: number | null; hours_per_week: number | null;
  required_return: string; start_timing: string; other_deciders: string;
}): string {
  const people = num(i.people_count);
  const hours = num(i.hours_per_week);
  const cost =
    people !== null || hours !== null
      ? [people !== null ? `${people} ${people === 1 ? 'person' : 'people'}` : null,
         hours !== null ? `${hours} hours a week in total` : null].filter(Boolean).join(', ')
      : 'not stated';
  const or = (v: string) => (v && v.trim()) || 'not stated';
  return [
    `Company: ${or(i.company)}${i.website ? ` (${i.website})` : ''}`,
    `My role: ${or(i.role)}`,
    `Service considered: ${or(i.service)}`,
    `Department: ${or(i.department)}`,
    '',
    'Process to start with:',
    or(i.process),
    '',
    `Who does it today: ${cost}`,
    `What AI needs to return: ${or(i.required_return)}`,
    `When we want to start: ${or(i.start_timing)}`,
    `Who else decides: ${or(i.other_deciders)}`,
  ].join('\n');
}

export interface CreatedIntake {
  token: string;
  callAvailable: boolean;
}

/**
 * The form arrives: write the lead (the pipeline everyone already watches), record the
 * phone permission against the number, then open the intake.
 */
export async function createEnterpriseIntake(
  form: IntakeForm,
  meta: { ipAddress: string | null; userAgent: string | null },
): Promise<CreatedIntake> {
  const row = {
    full_name: form.fullName,
    email: form.email.toLowerCase(),
    company: form.company,
    role: form.role,
    phone: form.phone,
    call_consent: Boolean(form.callConsent && form.phone),
    website: form.website,
    service: form.service,
    department: form.department,
    process: form.process,
    people_count: form.peopleCount === null ? null : Math.round(form.peopleCount),
    hours_per_week: form.hoursPerWeek,
    required_return: form.requiredReturn,
    start_timing: form.startTiming,
    other_deciders: form.otherDeciders,
  };

  const leadData = leadSchema.parse({
    name: form.fullName,
    email: form.email,
    company: form.company,
    title: form.role,
    phone: form.phone,
    message: writtenBrief(row),
    form_type: FORM_TYPE,
    consent_contact: true,
    phone_consent: row.call_consent,
    interest_area: form.service,
    timeline: form.startTiming.slice(0, 50),
    utm_source: form.utmSource,
    utm_medium: form.utmMedium,
    utm_campaign: form.utmCampaign,
    page_url: form.pageUrl,
  });
  const { lead } = await createLead(leadData);

  // Before the response, as /api/leads does: a stored number must never exist without the
  // grant that lets us call it.
  await capturePhoneConsent({
    phone: leadData.phone,
    email: leadData.email,
    phoneConsent: leadData.phone_consent,
    source: `lead_form:${FORM_TYPE}`,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });

  const intake = await EnterpriseIntake.create({
    ...row,
    lead_id: (lead as any)?.id ?? null,
    status: 'form',
    call_id: null,
    call_requested_at: null,
    understanding_id: null,
    interviewed_via: null,
    interviewed_at: null,
    bc_todolist_id: null,
  });

  return { token: intake.id, callAvailable: voiceConfigured() && callable(intake) };
}

const factsOf = (i: EnterpriseIntake) => ({ name: i.full_name, company: i.company || null, role: i.role || null });

export type EnterpriseTurnResult =
  | { done: false; message: string; exchanges?: number }
  | { done: true; message: string; understood: boolean };

/**
 * One turn of the typed interview. The browser sends only the conversation; the brief is
 * put back in front of it here, from the stored form.
 */
export async function runEnterpriseInterviewTurn(
  intake: EnterpriseIntake,
  rawTurns: unknown,
): Promise<EnterpriseTurnResult> {
  const turns = [{ role: 'user' as const, text: writtenBrief(intake) }, ...boundTurns(rawTurns)];
  const result = await runIntakeTurn({
    turns,
    facts: factsOf(intake),
    sourceRef: `enterprise-chat:${intake.id}`,
    leadId: intake.lead_id,
    buildFor: { kind: 'none' },
  });
  if (!result.done) return { done: false, message: result.message, exchanges: result.exchanges };

  const understood = await recordInterviewed(intake, result, 'chat');
  return { done: true, message: result.message, understood };
}

async function recordInterviewed(
  intake: EnterpriseIntake,
  outcome: IntakeOutcome,
  via: 'chat' | 'call',
): Promise<boolean> {
  const ok = (outcome.understanding === 'created' || outcome.understanding === 'deduplicated') && !!outcome.understanding_id;
  if (ok) {
    await intake.update({
      status: 'interviewed',
      understanding_id: outcome.understanding_id!,
      interviewed_via: via,
      interviewed_at: new Date(),
    });
  }
  return ok;
}

/** Called by the shared call completion once an Enterprise intake call has a write-up. */
export async function recordEnterpriseCallOutcome(callId: string, outcome: IntakeOutcome): Promise<void> {
  const intake = await EnterpriseIntake.findOne({ where: { call_id: callId } });
  if (intake) await recordInterviewed(intake, outcome, 'call');
}

export type CallRequestResult =
  | { status: 'calling' | 'already_calling'; callId: string | null }
  | { status: 'not_allowed' | 'unavailable' | 'blocked' | 'failed'; reason: string };

/** "Call me now": the same call AI Flotation places, on the Enterprise agent and script. */
export async function requestEnterpriseIntakeCall(intake: EnterpriseIntake): Promise<CallRequestResult> {
  if (!callable(intake)) return { status: 'not_allowed', reason: 'no_phone_or_consent' };
  if (!voiceConfigured()) return { status: 'unavailable', reason: 'voice_not_configured' };

  const result = await requestInstantCallback(
    {
      name: intake.full_name,
      email: intake.email,
      phone: intake.phone,
      source: ENTERPRISE_INTAKE_SOURCE,
      company: intake.company || undefined,
      role: intake.role || undefined,
      message: writtenBrief(intake),
      consent_contact: true,
    } as any,
    randomUUID(),
  );

  if (result.status === 'call_initiated' || result.status === 'deduplicated') {
    if (result.call_id) {
      await intake.update({ status: 'call_requested', call_id: result.call_id, call_requested_at: new Date() });
    }
    return { status: result.status === 'deduplicated' ? 'already_calling' : 'calling', callId: result.call_id };
  }
  if (result.status === 'skipped') return { status: 'unavailable', reason: result.reason || 'skipped' };
  return { status: result.status, reason: result.reason || result.status };
}
