/**
 * enterpriseIntakeReminders - "do my AI interview later" (v2, 2026-11-21).
 *
 * Ali: "Give them an option to do their AI interview now or later when they have more time to
 * prepare." At the time they picked, the 5-minute sweep reminds them once: an email with their
 * interview link, or (when they chose a call, may be called, and voice is configured) the AI
 * calls them.
 *
 * Once-only: an atomic claim on interview_reminder_sent_at, which also bumps the attempt count.
 * A failed send releases the claim (the count stays), so the next sweep retries; after
 * MAX_REMINDER_ATTEMPTS it is dead-lettered (logged, never tried again).
 */
import { Op } from 'sequelize';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import { env } from '../../config/env';
import { callable, requestEnterpriseIntakeCall, voiceConfigured } from './enterpriseIntakeService';
import { meetingWhen } from './enterpriseIntakeTime';
import { sendInterviewReminder } from './enterpriseIntakeEmails';

export const MAX_REMINDER_ATTEMPTS = 3;

const log = (event: string, outcome: 'success' | 'failure', context: Record<string, unknown>, error_class?: string) =>
  (outcome === 'failure' ? console.error : console.log)(JSON.stringify({
    level: outcome === 'failure' ? 'error' : 'info', service: 'enterprise-intake-reminders', event, outcome, ...(error_class ? { error_class } : {}), context,
  }));

export const interviewLink = (id: string): string => `${(env.frontendUrl || 'https://enterprise.colaberry.ai').replace(/\/$/, '')}/demo-pilot?intake=${id}`;

/** Remind one intake if it is due. 'sent' | 'called' | 'not_due' | 'claimed_elsewhere' | 'failed'. */
export async function remindOne(intake: EnterpriseIntake, now = new Date()): Promise<'sent' | 'called' | 'not_due' | 'claimed_elsewhere' | 'failed'> {
  const attempts = intake.interview_reminder_attempts || 0;
  if (intake.interview_mode !== 'later' || !intake.interview_scheduled_for || intake.interviewed_at || intake.interview_reminder_sent_at
    || new Date(intake.interview_scheduled_for).getTime() > now.getTime() || attempts >= MAX_REMINDER_ATTEMPTS
    || intake.signed_at || intake.lost_at) return 'not_due';

  const [n] = await EnterpriseIntake.update(
    { interview_reminder_sent_at: now, interview_reminder_attempts: attempts + 1 } as Partial<EnterpriseIntake>,
    { where: { id: intake.id, interview_reminder_sent_at: null, interview_reminder_attempts: attempts } as Record<string, unknown> },
  );
  if (n !== 1) return 'claimed_elsewhere';

  try {
    if (intake.interview_via_pref === 'call' && voiceConfigured() && callable(intake)) {
      const r = await requestEnterpriseIntakeCall(intake);
      if (r.status === 'calling' || r.status === 'already_calling') {
        log('enterprise_interview_reminder_called', 'success', { intake_id: intake.id });
        return 'called';
      }
      // A call that cannot be placed falls back to the email, in the same attempt.
    }
    await sendInterviewReminder({
      to: intake.email,
      fullName: intake.full_name,
      company: intake.company,
      link: interviewLink(intake.id),
      meetingWhen: intake.meeting_start ? meetingWhen(new Date(intake.meeting_start)) : null,
    });
    log('enterprise_interview_reminder_sent', 'success', { intake_id: intake.id, attempt: attempts + 1 });
    return 'sent';
  } catch (err) {
    await EnterpriseIntake.update({ interview_reminder_sent_at: null } as Partial<EnterpriseIntake>, { where: { id: intake.id } as Record<string, unknown> })
      .catch((e) => log('enterprise_interview_reminder_release_failed', 'failure', { intake_id: intake.id, message: String((e as Error)?.message || e).slice(0, 200) }, 'UpstreamUnavailable'));
    const dead = attempts + 1 >= MAX_REMINDER_ATTEMPTS;
    log(dead ? 'enterprise_intake_dead_letter' : 'enterprise_interview_reminder_failed', 'failure', {
      intake_id: intake.id, step: 'interview_reminder', attempt: attempts + 1, message: String((err as Error)?.message || err).slice(0, 200),
    }, (err as { error_class?: string })?.error_class || 'UpstreamUnavailable');
    return 'failed';
  }
}

/** Sweep: every reminder that is due. */
export async function syncInterviewReminders(limit = 20, now = new Date()): Promise<{ sent: number; failed: number }> {
  const due = await EnterpriseIntake.findAll({
    where: {
      interview_mode: 'later',
      interviewed_at: null,
      interview_reminder_sent_at: null,
      interview_scheduled_for: { [Op.lte]: now },
      interview_reminder_attempts: { [Op.lt]: MAX_REMINDER_ATTEMPTS },
      signed_at: null,
      lost_at: null,
    } as Record<string, unknown>,
    order: [['interview_scheduled_for', 'ASC']],
    limit,
  });
  const out = { sent: 0, failed: 0 };
  for (const i of due) {
    const r = await remindOne(i, now);
    if (r === 'sent' || r === 'called') out.sent++;
    else if (r === 'failed') out.failed++;
  }
  return out;
}
