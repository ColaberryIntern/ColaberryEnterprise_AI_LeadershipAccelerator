import { FollowUpSequence, ScheduledEmail, Lead } from '../models';

interface CreateSequenceParams {
  name: string;
  description?: string;
  steps: { delay_days: number; subject: string; body_template: string }[];
}

export async function createSequence(params: CreateSequenceParams) {
  return FollowUpSequence.create({
    name: params.name,
    description: params.description || '',
    steps: params.steps,
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

  // Cancel any pending scheduled emails for this sequence
  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { sequence_id: id, status: 'pending' } }
  );

  await seq.destroy();
  return true;
}

export async function enrollLeadInSequence(leadId: number, sequenceId: string) {
  const lead = await Lead.findByPk(leadId);
  if (!lead) throw new Error('Lead not found');

  const sequence = await FollowUpSequence.findByPk(sequenceId);
  if (!sequence || !sequence.is_active) throw new Error('Sequence not found or inactive');

  // Cancel any existing pending emails for this lead from any sequence
  await ScheduledEmail.update(
    { status: 'cancelled' } as any,
    { where: { lead_id: leadId, status: 'pending' } }
  );

  // Create scheduled emails for each step
  const now = new Date();
  const scheduledEmails = [];

  for (let i = 0; i < sequence.steps.length; i++) {
    const step = sequence.steps[i];
    const scheduledFor = new Date(now.getTime() + step.delay_days * 24 * 60 * 60 * 1000);

    // Replace template variables
    const body = step.body_template
      .replace(/\{\{name\}\}/g, lead.name)
      .replace(/\{\{company\}\}/g, lead.company || '')
      .replace(/\{\{title\}\}/g, lead.title || '')
      .replace(/\{\{email\}\}/g, lead.email);

    const subject = step.subject
      .replace(/\{\{name\}\}/g, lead.name)
      .replace(/\{\{company\}\}/g, lead.company || '');

    const email = await ScheduledEmail.create({
      lead_id: leadId,
      sequence_id: sequenceId,
      step_index: i,
      subject,
      body,
      to_email: lead.email,
      scheduled_for: scheduledFor,
      status: 'pending',
    } as any);

    scheduledEmails.push(email);
  }

  return scheduledEmails;
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
