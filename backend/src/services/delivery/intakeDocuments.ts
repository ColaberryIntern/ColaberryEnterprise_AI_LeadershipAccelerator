/**
 * intakeDocuments — a document handed over mid-interview, and what it is allowed to do.
 *
 *     "Also I should be able to add documents to this process that can be analyzed
 *      before submitting the next question and can be used when creating the
 *      requirements."  (Ali, 2026-09-29)
 *
 * Two obligations in one sentence, and they land in different places:
 *
 *   ANALYZED BEFORE THE NEXT QUESTION — the interviewer reads the document as part of
 *   the turn that follows it, so it stops asking what the document already answers.
 *   That is `documentsForInterviewer`, which goes into the prompt.
 *
 *   USED WHEN CREATING THE REQUIREMENTS — the document reaches the extraction that
 *   builds the understanding, which is what the brief and therefore the requirements
 *   are made from. That is `documentsForTranscript`, which is appended to the
 *   conversation `finishIntake` records.
 *
 * Satisfying only the first would make documents feel like they worked while changing
 * nothing about the plan; only the second would make the interviewer re-ask things the
 * person had already handed over in writing. Both, or it is not done.
 *
 * ── WHY A DOCUMENT IS NOT A TURN ────────────────────────────────────────────────
 *
 * The obvious implementation is to append the document as another `user` turn. It is
 * wrong twice. `boundTurns` keeps only the last `MAX_EXCHANGES * 2 + 2` turns, so a
 * document attached early would be silently dropped from a long conversation — the
 * exact class of silent loss this whole area has been fixing. And `exchanges` is
 * counted as user turns, so a document would burn one of the twelve the person has to
 * actually talk in.
 *
 * So documents travel beside the transcript, not inside it, and are re-sent with each
 * turn the same way the transcript already is. The turn endpoint stays stateless, which
 * is what lets a page reload resume a conversation.
 *
 * ── WHY THE TEXT, NOT THE FILE ──────────────────────────────────────────────────
 *
 * Extraction happens ONCE, at upload, and what travels afterwards is text. Re-parsing a
 * PDF on every turn would pay for the same work twelve times, and storing the file would
 * make this the owner of an upload directory it has no other reason to have.
 */

/** A document as the interview sees it: a name, and what it said. */
export interface IntakeDocument {
  name: string;
  text: string;
}

/**
 * Per-document ceiling.
 *
 * `fileExtractionService` already caps extraction at 50k. This is tighter because
 * several documents share one prompt with the transcript: 20k is a long specification
 * and still leaves room for the conversation beside it.
 */
export const DOCUMENT_TEXT_MAX = 20_000;

/** How many documents one conversation may carry. */
export const DOCUMENTS_MAX = 6;

/**
 * Ceiling across all of them together.
 *
 * Separate from the per-document cap because six 20k documents would be 120k of prompt
 * on every turn, and the cost of that is paid twelve times over an interview.
 */
export const DOCUMENTS_TOTAL_MAX = 60_000;

export const DOCUMENT_NAME_MAX = 200;

const clip = (s: string, max: number): string => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

/**
 * Bound what a client sent.
 *
 * WHOLE DOCUMENTS, never a partial one: when the total ceiling is reached the remaining
 * documents are left out entirely rather than half-included. Half a specification reads
 * as a complete specification that happens to be missing requirements, which is worse
 * than one that is visibly absent — the same reason `packItems` never splits an item.
 */
export function boundDocuments(raw: unknown): IntakeDocument[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: IntakeDocument[] = [];
  let total = 0;

  for (const d of list) {
    if (out.length >= DOCUMENTS_MAX) break;
    if (!d || typeof (d as any).text !== 'string') continue;

    const text = String((d as any).text).trim();
    if (!text) continue;

    const clipped = clip(text, DOCUMENT_TEXT_MAX);
    if (total + clipped.length > DOCUMENTS_TOTAL_MAX) break;

    const rawName = typeof (d as any).name === 'string' ? (d as any).name.trim() : '';
    out.push({ name: clip(rawName || 'Untitled document', DOCUMENT_NAME_MAX), text: clipped });
    total += clipped.length;
  }

  return out;
}

/** The documents themselves, each under its own name. Shared by both renderings. */
function bodyOf(docs: IntakeDocument[]): string {
  return docs.map((d) => `--- ${d.name} ---\n${d.text}`).join('\n\n');
}

/**
 * For the interviewer's prompt: read this, and stop asking what it answers.
 *
 * The instruction is the point. Without it a model hands the document the same weight as
 * anything else in the context and cheerfully asks a question the first page answers,
 * which is the interrogation failure `flotationInterviewService`'s header is written
 * against — made worse, because the person can see they already provided the answer.
 */
export function documentsForInterviewer(docs: IntakeDocument[]): string {
  if (!docs.length) return '';
  return [
    'DOCUMENTS THEY PROVIDED, verbatim. Treat everything in them as something they have',
    'already told you. Do NOT ask about anything these answer — ask about what they leave open.',
    '',
    bodyOf(docs),
  ].join('\n');
}

/**
 * For the transcript the understanding is extracted from.
 *
 * Framed as the person handing it over, because that is what happened and because the
 * extractor reads a conversation. A document introduced any other way would be read as
 * our own material, and provenance is the one thing this pipeline refuses to blur — an
 * inference and a customer statement are kept apart everywhere else (`phraseForBrief`),
 * so a document the customer wrote must arrive as theirs.
 */
export function documentsForTranscript(docs: IntakeDocument[]): string {
  if (!docs.length) return '';
  return [
    'human: I also gave you these documents. Their contents follow, verbatim, and everything',
    'in them is part of what I am telling you.',
    '',
    bodyOf(docs),
  ].join('\n');
}
