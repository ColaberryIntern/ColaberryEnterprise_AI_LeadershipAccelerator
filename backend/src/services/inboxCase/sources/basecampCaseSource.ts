import { Op } from 'sequelize';
import { bcGet } from '../../ops/basecampClient';
import OpsBcTodo from '../../../models/OpsBcTodo';
import { extractBasecampReferences, normalizeQuery } from '../textNormalization';
import { CaseSourceAdapter, DiscoveryParams, RawCandidateItem, withTimeout } from './caseSourceAdapter';

// Basecamp case-discovery adapter. Reuses the SHARED basecampClient.ts
// (bcGet — same auth/retry/backoff/pacing as the rest of Ops) rather than a
// second Basecamp client. Per root directive section 14, discovery order is:
//   1. Exact Basecamp URLs/recording IDs already found in email bodies
//      (basecampRefsFromEmails, passed in from the Gmail/Hotmail adapters).
//   2. The existing OpsBcTodo local mirror (already-synced active work).
//   3. Live Basecamp search fallback is intentionally NOT a general
//      full-text query here — Basecamp's public API has no cross-project
//      search endpoint, so "live fallback" for this adapter means resolving
//      an exact reference that ISN'T yet in the mirror (a comment,
//      message, or document the recurring OpsBcTodo sync never mirrors),
//      not an open-ended keyword crawl.
// Comments are fetched on demand, per matched item, bounded by the shared
// adapter-level timeout (withTimeout wraps the whole findCandidates call).

interface BcRecordingSummary {
  id: number;
  title?: string;
  content?: string;
  subject?: string;
  app_url?: string;
  bucket?: { id: number; name?: string };
  created_at?: string;
  updated_at?: string;
  creator?: { name?: string; email_address?: string };
}

interface BcComment {
  id: number;
  content: string;
  created_at: string;
  creator?: { name?: string; email_address?: string };
}

const MAX_MIRROR_MATCHES = 30;
const MAX_COMMENTS_PER_ITEM = 20;

// Exported for reuse by caseAutoSyncService.ts — the same OpsBcTodo-row-to-
// RawCandidateItem normalization is needed for the "recent Basecamp
// activity" auto-sync fetch, not just this file's own mirror-search step.
export function todoToCandidate(todo: OpsBcTodo): RawCandidateItem {
  return {
    source_type: 'basecamp_todo',
    source_id: todo.bc_id,
    provider: 'basecamp',
    source_url: todo.bc_app_url,
    title: todo.title,
    occurred_at: new Date(todo.bc_updated_at || todo.bc_created_at),
    participants: [],
    subject_normalized: normalizeQuery(todo.title),
    thread_id: null,
    message_id: null,
    in_reply_to: [],
    basecamp_refs: [],
    attachment_names: [],
    body_excerpt: (todo.description || '').slice(0, 2000),
    snapshot: {
      project_id: todo.project_id,
      todolist_name: todo.todolist_name,
      status: todo.status,
      due_on: todo.due_on,
      assignee_ids: todo.assignee_ids,
    },
  };
}

async function fetchExactReference(
  ref: { accountId: string; projectId: string; recordingType: string; recordingId: string; url: string }
): Promise<RawCandidateItem | null> {
  try {
    const path = `/buckets/${ref.projectId}/${ref.recordingType}/${ref.recordingId}.json`;
    const rec = await bcGet<BcRecordingSummary>(path);
    return {
      source_type: ref.recordingType === 'todos' ? 'basecamp_todo' : ref.recordingType === 'messages' ? 'basecamp_message' : 'basecamp_comment',
      source_id: String(rec.id),
      provider: 'basecamp',
      source_url: rec.app_url || ref.url,
      title: rec.title || rec.subject || `Basecamp ${ref.recordingType} ${ref.recordingId}`,
      occurred_at: new Date(rec.updated_at || rec.created_at || Date.now()),
      participants: rec.creator?.email_address ? [rec.creator.email_address] : [],
      subject_normalized: normalizeQuery(rec.title || rec.subject || ''),
      thread_id: null,
      message_id: null,
      in_reply_to: [],
      basecamp_refs: [],
      attachment_names: [],
      body_excerpt: (rec.content || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),
      snapshot: { bucket: rec.bucket, exact_reference: true },
    };
  } catch (err: any) {
    console.error(`[InboxCase][basecamp] Exact-reference lookup failed for ${ref.url}: ${err?.message}`);
    return null;
  }
}

async function fetchCommentsForItem(projectId: string, recordingId: string, parentUrl: string | null): Promise<RawCandidateItem[]> {
  try {
    const comments = await bcGet<BcComment[]>(`/buckets/${projectId}/recordings/${recordingId}/comments.json`);
    return comments.slice(0, MAX_COMMENTS_PER_ITEM).map((c) => ({
      source_type: 'basecamp_comment' as const,
      source_id: String(c.id),
      provider: 'basecamp' as const,
      // Basecamp has no separate comment permalink in this API response —
      // point at the parent item's page, which contains the comment.
      source_url: parentUrl,
      title: `Comment on Basecamp item ${recordingId}`,
      occurred_at: new Date(c.created_at),
      participants: c.creator?.email_address ? [c.creator.email_address] : [],
      subject_normalized: '',
      thread_id: recordingId,
      message_id: null,
      in_reply_to: [],
      basecamp_refs: [],
      attachment_names: [],
      body_excerpt: (c.content || '').replace(/<[^>]+>/g, ' ').slice(0, 2000),
      snapshot: { parent_recording_id: recordingId, project_id: projectId },
    }));
  } catch (err: any) {
    console.error(`[InboxCase][basecamp] Comment fetch failed for ${recordingId}: ${err?.message}`);
    return [];
  }
}

export const basecampCaseSource: CaseSourceAdapter = {
  provider: 'basecamp',
  isConfigured: () => true, // basecampClient resolves its own token; no separate env gate here

  async findCandidates(params: DiscoveryParams): Promise<RawCandidateItem[]> {
    const run = async () => {
      const items: RawCandidateItem[] = [];

      // 1. Exact references found in email bodies — highest-trust source.
      const exactRefs = params.basecampRefsFromEmails.slice(0, 25);
      const exactResults = await Promise.all(exactRefs.map(fetchExactReference));
      const exactItems = exactResults.filter((i): i is RawCandidateItem => i !== null);
      items.push(...exactItems);

      // 2. Local OpsBcTodo mirror — already-synced active work, no live BC call.
      const searchTerms =
        params.mode === 'PERSON'
          ? [...params.knownDisplayNames]
          : [params.exactPhrase, ...params.subjectVariants];
      const likeClauses = searchTerms
        .filter((t) => t && t.length > 1)
        .map((t) => ({ title: { [Op.iLike]: `%${t}%` } }));

      if (likeClauses.length > 0) {
        const mirrorMatches = await OpsBcTodo.findAll({
          where: { [Op.or]: likeClauses } as any,
          limit: MAX_MIRROR_MATCHES,
        });
        for (const todo of mirrorMatches) {
          items.push(todoToCandidate(todo));
        }
      }

      // 3. Comments on demand for exact-reference todos/messages only —
      // bounded fan-out, never a blanket comment crawl.
      const commentTargets = exactItems.filter((i) => i.source_type !== 'basecamp_comment').slice(0, 10);
      for (const target of commentTargets) {
        const projectId = (target.snapshot as any)?.bucket?.id;
        if (projectId) {
          items.push(...(await fetchCommentsForItem(String(projectId), target.source_id, target.source_url)));
        }
      }

      return items;
    };

    try {
      return await withTimeout(run(), 'basecamp', params.timeoutMs);
    } catch (err: any) {
      console.error(`[InboxCase][basecamp] discovery failed: ${err?.message}`);
      return [];
    }
  },
};
