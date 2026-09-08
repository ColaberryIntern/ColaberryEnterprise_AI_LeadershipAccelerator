import { env } from '../../config/env';
import {
  guardedSendMail,
  resolveEmailRecipient,
  htmlToPlainText,
  emailHeaders,
} from '../emailService';

/**
 * The question-review email: one domain of the CCAR-F bank, rendered so a human
 * can read it carefully and reply in prose.
 *
 * A LEAF MODULE RATHER THAN AN EIGHTH SENDER IN emailService.ts, which is 2,796
 * lines against a 500-line ceiling. The repo rule is that the next change to an
 * oversize file splits it before adding code, so this adds none: the four
 * transport primitives were exported and the new sender lives here.
 *
 * WHAT THE FORMAT IS FOR. The reviewer is reading for whether the item is TRUE,
 * which is the one thing no automated check in this repo can test. So every
 * question shows the answer, the reasoning for it, and the reasoning against
 * each distractor — a reviewer cannot judge a distractor they cannot see the
 * case for. The question key leads each block in monospace so a reply can say
 * "CCARF-D1-07: C is also defensible" and be unambiguous.
 *
 * NOTHING HERE APPROVES ANYTHING. Replying to this email does not change a
 * review status; a named human still approves in the admin queue. The email is
 * how the reading happens, not how the decision is recorded.
 */

export interface ReviewEmailItem {
  question_key: string;
  revision: number;
  domain_id: string;
  objective_id: string;
  difficulty: string;
  stem: string;
  options: { key: string; text: string }[];
  correct_keys: string[];
  rationale: string | null;
  distractor_rationales: Record<string, string> | null;
  review_status: string;
}

export interface ReviewEmailInput {
  to: string;
  domainId: string;
  part: number;
  ofParts: number;
  items: ReviewEmailItem[];
}

/** Domain names as the published blueprint words them, not our slugs. */
const DOMAIN_LABEL: Record<string, string> = {
  D1: 'Agentic Architecture',
  D2: 'Tool Design and MCP',
  D3: 'Claude Code Configuration',
  D4: 'Prompt Engineering',
  D5: 'Context and Reliability',
};

const esc = (v: unknown): string => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function renderItem(item: ReviewEmailItem, n: number): string {
  const correct = new Set(item.correct_keys ?? []);
  const options = (item.options ?? []).map((o) => {
    const isRight = correct.has(o.key);
    const why = isRight ? null : (item.distractor_rationales ?? {})[o.key] ?? null;
    return `
      <tr>
        <td style="padding:5px 8px 5px 0;vertical-align:top;width:26px;
                   font-family:Consolas,monospace;font-size:13px;font-weight:700;
                   color:${isRight ? '#0E6B54' : '#6B7280'}">${esc(o.key)}.</td>
        <td style="padding:5px 0;vertical-align:top;font-size:14px;
                   color:${isRight ? '#0E6B54' : '#2E3138'};font-weight:${isRight ? 600 : 400}">
          ${esc(o.text)}${isRight ? ' <span style="font-size:11px;letter-spacing:.06em">&#9664; ANSWER</span>' : ''}
          ${why ? `<div style="font-size:12px;color:#9AA0AA;margin-top:2px">${esc(why)}</div>` : ''}
        </td>
      </tr>`;
  }).join('');

  return `
    <div style="border:1px solid #E4E6EB;border-radius:10px;padding:14px 16px;margin:0 0 14px;background:#FFFFFF">
      <div style="font-family:Consolas,monospace;font-size:12px;color:#6B7280;margin-bottom:6px">
        <b style="color:#1A1A1A">${esc(item.question_key)}</b>
        &nbsp;&middot;&nbsp; ${esc(item.objective_id)}
        &nbsp;&middot;&nbsp; ${esc(item.difficulty)}
        &nbsp;&middot;&nbsp; rev ${esc(item.revision)}
        &nbsp;&middot;&nbsp; <span style="color:#C4102E">${esc(item.review_status)}</span>
      </div>
      <div style="font-size:15px;color:#1A1A1A;font-weight:600;line-height:1.45;margin-bottom:8px">
        ${n}. ${esc(item.stem)}
      </div>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${options}</table>
      ${item.rationale ? `
      <div style="margin-top:9px;padding-top:9px;border-top:1px solid #EDEFF3;font-size:13px;
                  color:#2E3138;line-height:1.5">
        <b style="color:#0E6B54">Why:</b> ${esc(item.rationale)}
      </div>` : ''}
    </div>`;
}

export function buildReviewHtml(input: ReviewEmailInput): string {
  const label = DOMAIN_LABEL[input.domainId] ?? input.domainId;
  const items = input.items.map((it, i) => renderItem(it, i + 1)).join('');

  return `
  <div style="background:#F5F6F8;padding:24px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
    <div style="max-width:720px;margin:0 auto;padding:0 16px">

      <div style="background:#FFFFFF;border:1px solid #E4E6EB;border-radius:12px;padding:20px 22px;margin-bottom:16px">
        <div style="font-family:Consolas,monospace;font-size:11px;letter-spacing:.12em;
                    text-transform:uppercase;color:#C4102E;margin-bottom:8px">
          CCAR-F question review &middot; part ${input.part} of ${input.ofParts}
        </div>
        <h1 style="margin:0 0 8px;font-size:22px;color:#1A1A1A;line-height:1.2">
          ${esc(input.domainId)} &mdash; ${esc(label)}
        </h1>
        <p style="margin:0;font-size:14px;color:#2E3138;line-height:1.6">
          ${input.items.length} question${input.items.length === 1 ? '' : 's'} for your review. These are
          drafts: nothing here is being served to a student, and a sitting currently returns
          "no approved questions" until somebody approves them.
        </p>
        <p style="margin:10px 0 0;font-size:14px;color:#2E3138;line-height:1.6">
          <b>What to look for:</b> is the marked answer actually right, and is every distractor
          actually wrong? Every automated check we have covers structure, weighting and cueing.
          None of them can tell whether an item is true.
        </p>
        <p style="margin:10px 0 0;font-size:14px;color:#2E3138;line-height:1.6">
          <b>To reply:</b> just answer this email. Quote the question key, for example
          <span style="font-family:Consolas,monospace;background:#EEF0F4;padding:1px 5px;border-radius:4px">CCARF-${esc(input.domainId)}-07</span>
          and say what is wrong. Anything you do not mention is taken as read.
        </p>
      </div>

      ${items}

      <div style="font-size:12px;color:#9AA0AA;line-height:1.6;padding:6px 4px 0">
        Colaberry Enterprise AI Leadership Accelerator &middot; certification readiness bank.
        Replying does not change any review status; approval still happens in the admin queue
        under a named reviewer.
      </div>
    </div>
  </div>`;
}

export async function sendCertReviewEmail(
  input: ReviewEmailInput,
): Promise<{ subject: string; messageId?: string }> {
  const label = DOMAIN_LABEL[input.domainId] ?? input.domainId;
  // The date and the count are in the subject on purpose: this is a review loop
  // and a second send is a second draft, not a duplicate to be suppressed.
  const stamp = new Date().toISOString().slice(0, 10);
  const subject = `CCAR-F review ${input.part}/${input.ofParts}: ${input.domainId} ${label} `
    + `(${input.items.length} items, ${stamp})`;

  const html = buildReviewHtml(input);
  const r = await resolveEmailRecipient(input.to, subject);

  const info = await guardedSendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('cert-question-review'),
  });

  return { subject: r.subject, messageId: info?.messageId };
}


/* ────────────────────────────────────────────────────────────────────────────
 * THE TRIAGE REPORT
 *
 * A SEPARATE BUILDER FROM buildReviewHtml, deliberately. That one ships the five
 * per-domain review emails and its input has no counts in it; widening it would
 * make an ordinary domain email carry a triage denominator that is false for it.
 *
 * THE HEADER IS THE DELIVERABLE, not the list underneath it.
 *
 * An earlier draft of this feature put the sentence "no_concerns is not
 * clearance" in a handoff document. Nobody reads a handoff document. The only
 * artifact a human opens is this email, and an email that says "nothing was
 * approved" above a list of twelve items is read as "the other hundred and
 * thirty-eight passed review" — which is the precise outcome this whole process
 * exists to prevent, and which ends with somebody approving 138 unread
 * questions in good faith.
 *
 * So the denominator leads, it names the reviewer, and it forecloses the
 * inference in the same breath. The counts are COMPUTED. A hard-coded number in
 * a sentence whose entire job is honesty would be the joke writing itself.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TriageReportConcern {
  kind: string;
  option: string | null;
  detail: string;
}

export interface TriageReportItem {
  question_key: string;
  domain_id: string;
  objective_id: string;
  stem: string;
  severity: string | null;
  verdict: string;
  concerns: TriageReportConcern[];
}

export interface TriageReportInput {
  to: string;
  /** Every question the reviewer scored. The denominator. */
  scoredCount: number;
  /** Those the reviewer objected to, or could not read. */
  flagged: TriageReportItem[];
  reviewerModel: string;
  runId: string;
}

const SEVERITY_COLOR: Record<string, string> = {
  high: '#C4102E', medium: '#8A5A0B', low: '#6B7280',
};

const KIND_LABEL: Record<string, string> = {
  defensible_distractor: 'A wrong option may also be right',
  ambiguous_stem: 'The question can be read two ways',
  factual_error: 'Something asserted is not true',
  answer_disputed: 'The marked answer is disputed',
  outdated: 'True once, not now',
  other: 'Other',
};

export function buildTriageReportHtml(input: TriageReportInput): string {
  const flaggedCount = input.flagged.length;
  const quiet = Math.max(0, input.scoredCount - flaggedCount);

  const items = input.flagged.map((item, i) => {
    const colour = SEVERITY_COLOR[String(item.severity)] ?? '#6B7280';
    const concerns = item.concerns.map((c) => `
      <div style="margin-top:7px;padding-left:11px;border-left:2px solid ${colour}">
        <div style="font-size:12px;font-weight:700;color:${colour}">
          ${esc(KIND_LABEL[c.kind] ?? c.kind)}${c.option ? ` &middot; option ${esc(c.option)}` : ''}
        </div>
        <div style="font-size:13px;color:#2E3138;line-height:1.5">${esc(c.detail)}</div>
      </div>`).join('');

    return `
      <div style="border:1px solid #E4E6EB;border-left:4px solid ${colour};border-radius:10px;
                  padding:13px 15px;margin:0 0 11px;background:#FFFFFF">
        <div style="font-family:Consolas,monospace;font-size:12px;color:#6B7280;margin-bottom:5px">
          <b style="color:#1A1A1A">${esc(item.question_key)}</b>
          &nbsp;&middot;&nbsp; ${esc(item.objective_id)}
          &nbsp;&middot;&nbsp; <span style="color:${colour};font-weight:700">${esc(item.severity ?? item.verdict)}</span>
        </div>
        <div style="font-size:14px;color:#1A1A1A;line-height:1.45">${i + 1}. ${esc(item.stem)}</div>
        ${concerns}
      </div>`;
  }).join('');

  return `
  <div style="background:#F5F6F8;padding:24px 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif">
    <div style="max-width:720px;margin:0 auto;padding:0 16px">

      <div style="background:#FFFFFF;border:1px solid #E4E6EB;border-radius:12px;padding:20px 22px;margin-bottom:16px">
        <div style="font-family:Consolas,monospace;font-size:11px;letter-spacing:.12em;
                    text-transform:uppercase;color:#C4102E;margin-bottom:8px">
          CCAR-F question triage
        </div>
        <h1 style="margin:0 0 10px;font-size:21px;color:#1A1A1A;line-height:1.25">
          ${flaggedCount} question${flaggedCount === 1 ? '' : 's'} need your judgement
        </h1>
        <p style="margin:0;font-size:15px;color:#2E3138;line-height:1.65">
          <b>${input.scoredCount} scored by ${esc(input.reviewerModel)}.
          ${quiet} drew no objection, which is not the same as checked by a person.
          ${flaggedCount} need your judgement. Nothing was approved and nothing became servable.</b>
        </p>
        <p style="margin:12px 0 0;font-size:13px;color:#6B7280;line-height:1.6">
          The reviewer is a language model asked to argue against each marked answer. It is a
          different model from the one that wrote these questions, which makes it a second
          opinion rather than a check. Start with the list below; it is where the reading is
          most likely to pay off, not the only place a problem could be.
        </p>
      </div>

      ${items || `<div style="background:#FFFFFF;border:1px solid #E4E6EB;border-radius:10px;
                              padding:16px 18px;font-size:14px;color:#2E3138">
          The reviewer raised no objection to any question. That is not clearance &mdash; it
          means one model failed to break them, and the bank still has not been read by a
          person.</div>`}

      <div style="font-size:12px;color:#9AA0AA;line-height:1.6;padding:8px 4px 0">
        Run <span style="font-family:Consolas,monospace">${esc(input.runId)}</span>.
        Approval remains a separate act by a named reviewer in the admin queue; replying to
        this email changes nothing.
      </div>
    </div>
  </div>`;
}

export async function sendTriageReportEmail(
  input: TriageReportInput,
): Promise<{ subject: string; messageId?: string }> {
  const stamp = new Date().toISOString().slice(0, 10);
  const subject = `CCAR-F triage: ${input.flagged.length} of ${input.scoredCount} need your judgement (${stamp})`;

  const html = buildTriageReportHtml(input);
  const r = await resolveEmailRecipient(input.to, subject);

  const info = await guardedSendMail({
    from: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    replyTo: `"Colaberry Enterprise AI" <${env.emailFrom}>`,
    to: r.to,
    subject: r.subject,
    html,
    text: htmlToPlainText(html),
    headers: emailHeaders('cert-question-triage'),
  });

  return { subject: r.subject, messageId: info?.messageId };
}
