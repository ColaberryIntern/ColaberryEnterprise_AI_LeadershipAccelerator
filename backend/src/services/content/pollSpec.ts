import { z } from 'zod';

/**
 * pollSpec — what a poll IS, in one place.
 *
 * A poll post has no media pipeline and no generated variants of its options: it is a question,
 * two to four short answers, and how long voting stays open. The route accepts exactly this
 * shape, it is stored as `content_items.metadata.poll`, the validator holds it against each
 * network's limits, and the adapters carry it to the wire. One schema so the four cannot drift.
 *
 * The numbers here are the widest any supported network allows; the per-network limits live in
 * providerCapabilities (LinkedIn: 30-character options, 1/3/7/14 days; X: 25 characters, any
 * length up to 7 days) and composerValidation applies them. A poll that fits here but not a
 * chosen network is blocked at validation with that network's number, not refused at the door.
 */

export const POLL_LIMITS = { minOptions: 2, maxOptions: 4, maxOptionChars: 80, maxQuestionChars: 280, minDays: 1, maxDays: 14 } as const;

export const PollSchema = z.object({
  question: z.string().trim().min(1).max(POLL_LIMITS.maxQuestionChars),
  options: z.array(z.string().trim().min(1).max(POLL_LIMITS.maxOptionChars)).min(POLL_LIMITS.minOptions).max(POLL_LIMITS.maxOptions),
  durationDays: z.number().int().min(POLL_LIMITS.minDays).max(POLL_LIMITS.maxDays),
}).strict().refine(
  (p) => new Set(p.options.map((o) => o.toLowerCase())).size === p.options.length,
  { message: 'Poll options must be different from each other.', path: ['options'] },
);

export type PollSpec = z.infer<typeof PollSchema>;

/** The poll on an item's metadata, or null when there is none or it does not parse (an old or hand-edited row). */
export function pollFromMetadata(metadata: unknown): PollSpec | null {
  const raw = metadata && typeof metadata === 'object' ? (metadata as { poll?: unknown }).poll : undefined;
  if (raw === undefined || raw === null) return null;
  const parsed = PollSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** A network's poll limits, as providerCapabilities declares them. */
export interface PollRule {
  minOptions: number;
  maxOptions: number;
  maxOptionChars: number;
  maxQuestionChars: number;
  /** Voting windows the network accepts, in days. */
  durationsDays: readonly number[];
}

/**
 * Every way a poll misses a network's rule, as sentences with the network's own numbers. Used
 * by the composer validator (as blocking problems) and by the LinkedIn adapter (as refusal
 * reasons) so both say the same thing.
 */
export function pollProblems(networkName: string, rule: PollRule, poll: PollSpec): string[] {
  const out: string[] = [];
  if (poll.options.length < rule.minOptions || poll.options.length > rule.maxOptions) {
    out.push(`${networkName}: polls take ${rule.minOptions} to ${rule.maxOptions} options; this one has ${poll.options.length}.`);
  }
  for (const [i, option] of poll.options.entries()) {
    if (option.length > rule.maxOptionChars) {
      out.push(`${networkName}: option ${i + 1} is ${option.length} characters, limit ${rule.maxOptionChars}.`);
    }
  }
  if (poll.question.length > rule.maxQuestionChars) {
    out.push(`${networkName}: the poll question is ${poll.question.length} characters, limit ${rule.maxQuestionChars}.`);
  }
  if (!rule.durationsDays.includes(poll.durationDays)) {
    out.push(`${networkName}: polls run for ${rule.durationsDays.join(', ')} days; ${poll.durationDays} is not offered.`);
  }
  return out;
}
