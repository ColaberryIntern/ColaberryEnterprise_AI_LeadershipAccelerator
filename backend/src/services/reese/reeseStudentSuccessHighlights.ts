import { getStudentSuccessSnapshot } from '../studentSuccessSnapshot';

/**
 * Reese Agentic AI Employee mission, Checkpoint C wiring — a short,
 * high-value addition to Reese's own mentor prompt drawn from the Student
 * Success 360 evidence service, covering facts learnerContextService.ts's
 * own LearnerContext does NOT already carry: open support interventions,
 * certification readiness, and whether this is a continuing conversation.
 *
 * Deliberately Reese-specific, not wired into the generic
 * agentSystemPrompt.ts: getStudentSuccessSnapshot()'s
 * previousReeseCommunications field resolves REESE's own real enrollment
 * id specifically (getReeseEnrollmentId()) — rendering "you've exchanged N
 * messages with this student" would be a real correctness bug for any
 * other future agent that reused the generic builder unconditionally.
 *
 * Deliberately tight — a few lines, not all 15 categories — this feeds a
 * token-budgeted prompt (buildAgentSystemPrompt has no hard cap itself,
 * but a sprawling context block degrades a mentor reply's focus the same
 * way learnerContextService.ts's own 900-char budget exists to prevent).
 * Never throws; a lookup failure returns '' and the mentor prompt degrades
 * to exactly its pre-existing content, matching every other block in this
 * assembly's own established fail-safe posture.
 */
export async function getReeseStudentSuccessHighlights(enrollmentId: string): Promise<string> {
  try {
    const snapshot = await getStudentSuccessSnapshot(enrollmentId);
    const lines: string[] = [];

    const tickets = snapshot.ticketsInterventions;
    if (tickets.status === 'known' && tickets.value && tickets.value.openCount > 0) {
      lines.push(
        `- ${tickets.value.openCount} open support ticket${tickets.value.openCount === 1 ? '' : 's'} for this student — check before assuming a fresh start.`,
      );
    }

    const cert = snapshot.certReadiness;
    if (cert.status === 'known' && cert.value) {
      const caption = cert.value.weightsAvailable ? 'certification readiness' : 'certification readiness (coverage estimate, not exam-weighted)';
      const score = cert.value.overallScaled != null ? ` (${Math.round(cert.value.overallScaled)}/100)` : '';
      lines.push(`- ${caption}: ${cert.value.overallState}${score}.`);
    }

    const comms = snapshot.previousReeseCommunications;
    if (comms.status === 'known' && comms.value && comms.value.messageCount > 0) {
      lines.push(
        `- You've exchanged ${comms.value.messageCount} message${comms.value.messageCount === 1 ? '' : 's'} with this student before — a continuing relationship, not a first contact.`,
      );
    }

    if (!lines.length) return '';
    return 'ADDITIONAL CONTEXT:\n' + lines.join('\n');
  } catch {
    return '';
  }
}
