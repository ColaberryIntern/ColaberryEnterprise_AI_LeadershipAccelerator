/**
 * factoryPerspective — two reported checks over a decomposition's POINT OF VIEW (L10.4).
 *
 * ## The defect these exist for, and why a prompt rule alone was not enough
 *
 * On 5 Nov 2026 the Herriman decomposition (`delivery_project 80b35be2`) came back with a real
 * human/AI split for the first time — and three of its nine tasks were the BUYER's work:
 *
 *   t-receive-proposals   from REQ-003/REQ-050, "copies of Responses are required to be
 *                         submitted by email to Herriman City" — OUR duty to submit
 *   t-review-proposals    from REQ-022, "Vendors must indicate their compliance" — OUR duty
 *                         to state it
 *   t-select-vendor       from REQ-020, "The successful Proposer will be required to enter
 *                         into a written agreement" — OUR duty to execute it
 *
 * Every one of those six requirement rows genuinely binds us. The triage was right, the
 * demotion was right, and the model still wrote our obligations from the City's side of the
 * table. A requirement that says what we must do describes OUR task; the counterparty's half of
 * that same duty is not a task in our process at all.
 *
 * `factoryDecomposePrompt` now says so. A prompt rule is an instruction, not a guarantee — which
 * is the lesson of the whole ladder — so these checks are the part that does not depend on the
 * model having read it.
 *
 * ## Both are WARNINGS, and that is deliberate
 *
 * Wired through `factoryValidate` exactly as `structureFindings` is, for the same reason recorded
 * there: every decomposition stored before today was generated under the old prompt, so a veto
 * would retroactively un-approve the existing corpus and block regeneration of the one live bid.
 * These report; they do not refuse.
 *
 * ## What they CANNOT do
 *
 * `BUYER_SIDE_TASK` is a lexical heuristic over the title's leading verb. It cannot read intent.
 * A legitimately external task — a city's portal, a notarisation — can carry a counterparty verb
 * honestly, which is why the check also requires the task to cite NOTHING BUT requirement blocks
 * before it says anything, and why it reports rather than rejects. It will have false positives;
 * a reported finding that names the task and its cited rows lets a human judge in seconds.
 */
import type { FactoryProject, FactoryTask, SourceBlock } from './contracts/factoryContract';

export interface PerspectiveFinding {
  /** Stable rule id, so a consumer filters without matching prose. */
  rule: 'BUYER_SIDE_TASK' | 'CITATION_BUCKET';
  /** The task the finding is about. */
  ref: string;
  detail: string;
}

/**
 * Verbs that name the COUNTERPARTY's half of a duty that falls on us.
 *
 * DERIVED FROM THE THREE REAL FAILURES ABOVE, not from whichever verbs came to mind. An earlier
 * draft of this list omitted `review` — the verb in `Review Proposals`, one of the very failures
 * the check was written for. It would have passed its own tests while half its evidence stayed
 * invisible, which is the self-confirming fixture this project keeps having to catch. The suite
 * asserts every verb here has a test and that all three production titles fire.
 */
export const BUYER_SIDE_VERBS = [
  'receive', 'review', 'evaluate', 'score', 'rank', 'shortlist', 'award', 'select', 'solicit', 'issue',
] as const;

/**
 * A task citing more than this share of all requirement blocks is a bucket rather than a task.
 *
 * The 5 Nov run had `t-assess-requirements` citing 23 of 36 binding requirements, or 64%. That
 * satisfies SOURCE_COVERAGE without decomposing anything: coverage is a floor on citations, and
 * one task can meet it for the whole document while telling nobody what the work is.
 *
 * 0.4 rather than something tighter because a legitimate first task — read the solicitation,
 * extract obligations — honestly touches a lot of the document. The 5 Nov case is well clear of
 * it. This reports the shape; it does not produce a better decomposition, which is the
 * generative half of L10.4 and is not built.
 */
export const CITATION_BUCKET_SHARE = 0.4;

/**
 * The OBJECT a counterparty verb has to be acting on before the title is an inversion.
 *
 * ## Why a verb alone was not enough
 *
 * The 6 Nov Herriman regeneration produced `Review Compliance with Requirements`. That leads with
 * `review` and cites nothing but requirement blocks, so the rule fired — and it was wrong.
 * Reviewing OUR compliance before we submit is our own work; reviewing THEIR proposals is not.
 * The verb is identical in both and the citations are identical in both. The object is the only
 * thing that differs, so the object is what the rule now has to find.
 *
 * Checked against all four production cases: `Receive Proposals`, `Review Proposals` and
 * `Select Vendor` each name something the buyer judges and still fire; `Review Compliance with
 * Requirements` names our own obligation and goes quiet.
 *
 * ## What this deliberately gives up
 *
 * Precision over recall, because these are WARNINGS a person reads. `Select the winning firm`
 * names no noun in this list and will be missed. An advisory that cries wolf gets filtered out
 * entirely, and then it catches nothing at all — a miss costs one finding, a false positive costs
 * the rule's standing. `response` is excluded for exactly that reason: our own submission is "the
 * response", so `Review the response` is as likely to be our QA step as their evaluation.
 */
export const COUNTERPARTY_OBJECTS = [
  'proposal', 'proposals', 'bid', 'bids', 'vendor', 'vendors', 'proposer', 'proposers',
  'offer', 'offers', 'submission', 'submissions', 'respondent', 'respondents',
  'quote', 'quotes', 'applicant', 'applicants', 'supplier', 'suppliers',
] as const;

const leadingVerb = (title: string): string =>
  title.trim().toLowerCase().replace(/^[^a-z]+/, '').split(/[\s:,]+/)[0] ?? '';

/**
 * The counterparty-side noun a title names, if any — looked for AFTER the leading verb, so a verb
 * that happens to double as one of these nouns cannot satisfy its own second condition.
 */
const counterpartyObject = (title: string): string | null => {
  const words = title.trim().toLowerCase().split(/[^a-z]+/).filter(Boolean).slice(1);
  return words.find((w) => (COUNTERPARTY_OBJECTS as readonly string[]).includes(w)) ?? null;
};

/** The input is narrow on purpose, so a test does not have to build a whole project. */
export type PerspectiveInput = Pick<FactoryProject, 'tasks' | 'source_blocks'>;

function requirementBlockIds(blocks: readonly SourceBlock[]): Set<string> {
  return new Set(blocks.filter((b) => b.kind === 'requirement').map((b) => b.id));
}

/** Tasks that are real work, not the START/END markers nobody performs. */
function realTasks(tasks: readonly FactoryTask[]): readonly FactoryTask[] {
  return tasks.filter((t) => t.kind !== 'START' && t.kind !== 'END');
}

export function evaluatePerspective(input: PerspectiveInput): PerspectiveFinding[] {
  const findings: PerspectiveFinding[] = [];
  const reqIds = requirementBlockIds(input.source_blocks);
  const tasks = realTasks(input.tasks);

  for (const task of tasks) {
    const cited = task.source_evidence ?? [];
    const citedReqs = cited.filter((id) => reqIds.has(id));

    // BUYER_SIDE_TASK — a counterparty verb over nothing but obligations that bind us.
    //
    // The second condition is what keeps this narrow. A task citing a `context` or
    // `out_of_scope` block may legitimately describe something the buyer does; a task built
    // ONLY from requirement blocks is built only from duties, and a duty on us performed by
    // them is a misreading rather than a task.
    // A THIRD CONDITION SINCE 6 NOV: the verb must be acting on something the buyer judges.
    // `Review Compliance with Requirements` satisfied the first two conditions and was still our
    // own work. See COUNTERPARTY_OBJECTS for the four production cases this is calibrated against.
    const verb = leadingVerb(task.title);
    const isBuyerVerb = (BUYER_SIDE_VERBS as readonly string[]).includes(verb);
    const object = counterpartyObject(task.title);
    if (isBuyerVerb && object !== null && cited.length > 0 && citedReqs.length === cited.length) {
      findings.push({
        rule: 'BUYER_SIDE_TASK',
        ref: task.id,
        detail: `"${task.title}" leads with "${verb}" acting on "${object}", which names the counterparty's half of a duty that binds us. `
          + `It cites only requirement blocks (${citedReqs.join(', ')}), so the obligation is ours and the task should state OUR action.`,
      });
    }

    // CITATION_BUCKET — one task standing in for the whole document.
    if (reqIds.size > 0 && citedReqs.length / reqIds.size > CITATION_BUCKET_SHARE) {
      const pct = Math.round((citedReqs.length / reqIds.size) * 100);
      findings.push({
        rule: 'CITATION_BUCKET',
        ref: task.id,
        detail: `"${task.title}" cites ${citedReqs.length} of ${reqIds.size} requirement blocks (${pct}%), over the ${Math.round(CITATION_BUCKET_SHARE * 100)}% bucket threshold. `
          + 'One task covering most of the document satisfies SOURCE_COVERAGE without decomposing the work.',
      });
    }
  }

  return findings;
}
