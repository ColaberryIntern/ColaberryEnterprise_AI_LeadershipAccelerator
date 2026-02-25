import { FollowUpSequence, ScheduledEmail, Lead } from '../models';
import type { SequenceStep } from '../models/FollowUpSequence';
import type { CampaignChannel } from '../models/ScheduledEmail';

interface CreateSequenceParams {
  name: string;
  description?: string;
  steps: SequenceStep[];
}

export async function createSequence(params: CreateSequenceParams) {
  // Normalize steps: ensure channel defaults to 'email'
  const normalizedSteps = params.steps.map((s) => ({
    ...s,
    channel: s.channel || 'email' as CampaignChannel,
    max_attempts: s.max_attempts || (s.channel === 'voice' ? 2 : 1),
    fallback_channel: s.fallback_channel || null,
  }));

  return FollowUpSequence.create({
    name: params.name,
    description: params.description || '',
    steps: normalizedSteps,
    is_active: true,
  } as any);
}

export async function listSequences() {
  return FollowUpSequence.findAll({
    order: [['created_at', 'DESC']],
  });
}

export async function getSequenceById(id: string) {
  return FollowUpSequence.findByPk(id);
}

export async function updateSequence(id: string, updates: Record<string, any>) {
  const seq = await FollowUpSequence.findByPk(id);
  if (!seq) return null;

  const allowedFields = ['name', 'description', 'steps', 'is_active'];
  const filtered: Record<string, any> = {};
  for (const key of allowedFields) {
    if (updates[key] !== undefined) {
      filtered[key] = updates[key];
    }
  }
  filtered.updated_at = new Date();

  await seq.update(filtered);
  return seq;
}

export async function deleteSequence(id: string) {
  const seq = await FollowUpSequence.findByPk(id);
  if (!seq) return false;

  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { sequence_id: id, status: 'pending' } }
  );

  await seq.destroy();
  return true;
}

export async function enrollLeadInSequence(leadId: number, sequenceId: string, campaignId?: string) {
  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new Error('Lead not found');

  const sequence = await FollowUpSequence.findByPk(sequenceId);
  if (!sequence || !sequence.is_active) throw new Error('Sequence not found or inactive');

  // Cancel any existing pending actions for this lead from any sequence
  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { lead_id: leadId, status: 'pending' } }
  );

  const now = new Date();
  const scheduledActions = [];

  for (let i = 0; i < sequence.steps.length; i++) {
    const step = sequence.steps[i];
    const channel: CampaignChannel = step.channel || 'email';
    const scheduledFor = new Date(now.getTime() + step.delay_days * 24 * 60 * 60 * 1000);

    // Replace template variables in text content (fallback content)
    const replaceVars = (text: string) =>
      text
        .replace(/\{\{name\}\}/g, lead.name)
        .replace(/\{\{company\}\}/g, lead.company || '')
        .replace(/\{\{title\}\}/g, lead.title || '')
        .replace(/\{\{email\}\}/g, lead.email)
        .replace(/\{\{phone\}\}/g, lead.phone || '');

    const subject = replaceVars(step.subject || '');
    const body = replaceVars(
      channel === 'sms' && step.sms_template
        ? step.sms_template
        : step.body_template || ''
    );

    const action = await ScheduledEmail.create({
      lead_id: leadId,
      sequence_id: sequenceId,
      campaign_id: campaignId || null,
      step_index: i,
      channel,
      subject,
      body,
      to_email: lead.email,
      to_phone: lead.phone || null,
      voice_agent_type: channel === 'voice' ? (step.voice_agent_type || 'interest') : null,
      max_attempts: step.max_attempts || (channel === 'voice' ? 2 : 1),
      attempts_made: 0,
      fallback_channel: step.fallback_channel || null,
      scheduled_for: scheduledFor,
      status: 'pending',
      ai_instructions: step.ai_instructions || null,
      metadata: {
        step_goal: step.step_goal || null,
        ai_tone: step.ai_tone || null,
        ai_context_notes: step.ai_context_notes || null,
        voice_prompt: channel === 'voice' && step.voice_prompt ? step.voice_prompt : null,
      },
    } as any);

    scheduledActions.push(action);
  }

  return scheduledActions;
}

export async function cancelSequenceForLead(leadId: number) {
  const [count] = await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { lead_id: leadId, status: 'pending' } }
  );
  return count;
}

export async function getLeadSequenceStatus(leadId: number) {
  const emails = await ScheduledEmail.findAll({
    where: { lead_id: leadId },
    include: [{ model: FollowUpSequence, as: 'sequence', attributes: ['id', 'name'] }],
    order: [['step_index', 'ASC']],
  });

  return emails;
}
