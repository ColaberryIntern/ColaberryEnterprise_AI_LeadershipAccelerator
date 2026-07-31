import { randomUUID } from 'crypto';
import InboxCaseItem from '../../models/InboxCaseItem';
import { CaseMode, CaseProvider, DISCOVERY_WINDOW_DAYS, DiscoveryWindow, MatchReason, MATCH_THRESHOLD_CANDIDATE } from '../../types/inboxCase';
import { openCase, transitionCase } from './caseRepository';
import { logCaseEvent } from './caseEventLog';
import { resolveIdentity, upsertAlias } from './identityResolver';
import { expandTopic } from './topicExpansion';
import { buildReason, scoreCandidate } from './matchScoring';
import { groupCandidates, deriveCaseTitle, ScoredCandidate } from './caseGroupingService';
import { computeSourceHash, domainOf, normalizeEmailAddress, normalizeSubject, termOverlapScore } from './textNormalization';
import { DiscoveryParams, RawCandidateItem, DEFAULT_PROVIDER_TIMEOUT_MS } from './sources/caseSourceAdapter';
import { gmailColaberryCaseSource, gmailPersonalCaseSource } from './sources/gmailCaseSource';
import { hotmailCaseSource } from './sources/hotmailCaseSource';
import { basecampCaseSource } from './sources/basecampCaseSource';

// Orchestrates Discover + Connect (root directive section 6). One query can
// legitimately fan out into MULTIPLE InboxCase rows — grouping happens
// BEFORE a case is opened, so "Kes" can resolve into three distinct cases
// in one discovery run instead of one case with seven unrelated items.

export interface DiscoverCasesInput {
  mode: CaseMode;
  query: string;
  window: DiscoveryWindow;
  providers?: CaseProvider[];
  openedBy: string;
}

export interface DiscoveredCaseSummary {
  caseId: string;
  title: string;
  itemCount: number;
  includedCount: number;
  candidateCount: number;
}

const EMAIL_ADAPTERS = [gmailColaberryCaseSource, gmailPersonalCaseSource, hotmailCaseSource];
const MAX_CANDIDATES_PER_CASE = 60;

// Counts how many DISTINCT candidates (across every provider) reference each
// Basecamp recording id. A basecamp_refs match only becomes a positive
// "exact_basecamp_url" signal when the count is >= 2 — i.e. a SECOND source
// (another email, or the Basecamp item itself once fetched) corroborates
// it. Without this, a single email containing any Basecamp link would
// trivially "match itself" the moment that link gets fed into
// basecampRefsFromEmails, which is a self-referential false positive, not
// evidence of anything.
function countBasecampRefOccurrences(allCandidates: RawCandidateItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of allCandidates) {
    const uniqueIds = new Set(item.basecamp_refs.map((r) => r.recordingId));
    for (const id of uniqueIds) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

function buildReasons(item: RawCandidateItem, params: DiscoveryParams, refCounts: Map<string, number>): MatchReason[] {
  const reasons: MatchReason[] = [];
  const participantsNorm = item.participants.map(normalizeEmailAddress);
  const knownEmailsNorm = params.knownEmails.map(normalizeEmailAddress);
  const knownDomains = new Set(params.companyDomains.map((d) => d.toLowerCase()));

  if (item.basecamp_refs.some((r) => (refCounts.get(r.recordingId) || 0) >= 2)) {
    reasons.push(buildReason('exact_basecamp_url', 'Basecamp reference corroborated by a second independent source'));
  }
  if (item.source_type === 'basecamp_todo' || item.source_type === 'basecamp_message' || item.source_type === 'basecamp_comment') {
    if ((item.snapshot as any)?.exact_reference) {
      reasons.push(buildReason('exact_basecamp_recording_id', 'Fetched via an exact Basecamp reference'));
    }
  }

  if (participantsNorm.some((p) => knownEmailsNorm.includes(p))) {
    reasons.push(buildReason('exact_email_address', 'Participant matches a known, previously-verified identity email'));
  }

  for (const p of participantsNorm) {
    const d = domainOf(p);
    if (d && knownDomains.has(d)) {
      reasons.push(buildReason('exact_normalized_company_or_project', `Participant domain ${d} matches known company domain`));
      break;
    }
  }

  if (params.mode === 'PERSON') {
    // Cold-start discovery (no confirmed alias yet): a participant whose
    // email LOCAL PART exactly equals the queried name is itself strong,
    // near-exact evidence — this is how a brand-new person's email address
    // gets discovered in the first place, per root directive section 5.
    const nameTerms = params.knownDisplayNames.map((n) => n.toLowerCase()).filter(Boolean);
    const localParts = participantsNorm.map((p) => p.split('@')[0]);
    const exactLocalPartMatch = nameTerms.some((n) => localParts.includes(n));
    const partialLocalPartMatch = !exactLocalPartMatch && nameTerms.some((n) => localParts.some((lp) => lp.includes(n)));
    const fromName = String((item.snapshot as any)?.from_name || '').toLowerCase();
    const fromNameMatch = !exactLocalPartMatch && !partialLocalPartMatch && nameTerms.some((n) => fromName.includes(n));

    if (exactLocalPartMatch) {
      reasons.push(buildReason('exact_email_address', 'Participant email local-part exactly matches the queried name'));
    } else if (partialLocalPartMatch || fromNameMatch) {
      reasons.push(buildReason('name_alias', 'Participant name/address partially matches the queried name'));
    } else {
      const haystack = `${item.title} ${item.body_excerpt}`.toLowerCase();
      const matchedName = nameTerms.find((n) => n.length > 2 && haystack.includes(n));
      if (matchedName) {
        // Mentioned in content but NOT as any participant's own identity —
        // a genuinely ambiguous third-party mention.
        reasons.push(buildReason('ambiguous_first_name_only', `Name "${matchedName}" mentioned with no participant corroboration`));
      }
    }
  }

  if (params.mode === 'TOPIC') {
    const haystack = normalizeSubject(`${item.title} ${item.body_excerpt}`);
    const exactNorm = normalizeSubject(params.exactPhrase);
    const matchesExact = exactNorm.length > 0 && haystack.includes(exactNorm);
    const matchesVariant = params.subjectVariants.some((v) => v && haystack.includes(normalizeSubject(v)));

    if (matchesExact || matchesVariant) {
      reasons.push(buildReason('exact_normalized_company_or_project', 'Content contains the exact normalized topic phrase'));
    } else {
      const overlap = termOverlapScore(params.exactPhrase, `${item.title} ${item.body_excerpt}`);
      if (overlap > 0.05) {
        reasons.push(buildReason('semantic_similarity', `Term overlap ${(overlap * 100).toFixed(0)}% with topic phrase`));
      } else {
        const genericHit = params.subjectVariants.some((v) => v && v.length > 3 && haystack.includes(v));
        if (genericHit) reasons.push(buildReason('generic_terminology', 'Only generic terminology overlap with topic phrase'));
      }
    }
  }

  return reasons;
}

// Medium "same_participants" corroboration: a participant recurring across
// 2+ items WITHIN one cluster is genuine evidence the cluster is really one
// conversation, independent of any single item's own content. This is the
// spec's medium-signal taxonomy applied at the cluster level rather than
// left unused, since per-item scoring alone can't see repetition across
// siblings.
function enrichWithParticipantCorroboration(cluster: ScoredCandidate[]): ScoredCandidate[] {
  const counts = new Map<string, number>();
  for (const item of cluster) {
    for (const p of new Set(item.participants.map(normalizeEmailAddress))) {
      counts.set(p, (counts.get(p) || 0) + 1);
    }
  }
  const recurring = new Set([...counts.entries()].filter(([, n]) => n >= 2).map(([p]) => p));
  if (recurring.size === 0) return cluster;

  return cluster.map((item) => {
    const hasRecurring = item.participants.some((p) => recurring.has(normalizeEmailAddress(p)));
    if (!hasRecurring || item.reasons.some((r) => r.kind === 'same_participants')) return item;
    const reasons = [...item.reasons, buildReason('same_participants', 'A participant recurs across multiple items in this case')];
    const { score, inclusionStatus } = scoreCandidate(reasons);
    return { ...item, reasons, score, inclusionStatus };
  });
}

// Last-resort corroboration for the rare item that shares NEITHER a
// recurring participant NOR its own content match with a cluster that is
// otherwise clearly relevant (e.g. a reply sent from a different personal
// address with no shared participant, threaded only by Message-ID). Once
// enrichWithParticipantCorroboration has run and a cluster still contains
// at least one CANDIDATE-or-better item, every remaining member inherits a
// corroborating strong-signal reason via its structural connector (thread
// id / reply-chain / Basecamp reference — the same STRONG connectors
// grouping itself uses, never bare participant overlap). This runs BEFORE
// the "drop all-excluded clusters" filter so a real thread with one strong
// hit and otherwise-quiet siblings still becomes one case with every
// message included, not one case with a single item and the rest silently
// dropped.
function propagateClusterCorroboration(cluster: ScoredCandidate[]): ScoredCandidate[] {
  const maxScore = Math.max(...cluster.map((c) => c.score));
  if (maxScore < MATCH_THRESHOLD_CANDIDATE) return cluster;

  return cluster.map((item) => {
    if (item.score >= MATCH_THRESHOLD_CANDIDATE) return item;
    const corroboration = buildReason(
      'exact_thread_id',
      'Linked via thread/reference-chain/Basecamp connector to an already-relevant item in this case'
    );
    const reasons = [...item.reasons, corroboration];
    const { score, inclusionStatus } = scoreCandidate(reasons);
    return { ...item, reasons, score, inclusionStatus };
  });
}

async function runAdapters(params: DiscoveryParams, providers?: CaseProvider[]): Promise<RawCandidateItem[]> {
  const emailSources = providers ? EMAIL_ADAPTERS.filter((a) => providers.includes(a.provider)) : EMAIL_ADAPTERS;
  const emailResults = await Promise.all(emailSources.map((a) => a.findCandidates(params)));
  const emailItems = emailResults.flat();

  if (providers && !providers.includes('basecamp')) return emailItems;

  const basecampRefs = Array.from(
    new Map(emailItems.flatMap((i) => i.basecamp_refs).map((r) => [r.recordingId, r])).values()
  );
  const basecampParams: DiscoveryParams = { ...params, basecampRefsFromEmails: basecampRefs };
  const basecampItems = await basecampCaseSource.findCandidates(basecampParams);

  return [...emailItems, ...basecampItems];
}

export async function discoverCases(input: DiscoverCasesInput): Promise<DiscoveredCaseSummary[]> {
  const windowDays = DISCOVERY_WINDOW_DAYS[input.window];
  const correlationId = randomUUID();

  let params: DiscoveryParams;
  let normalizedQueryLabel: string;

  if (input.mode === 'PERSON') {
    const identity = await resolveIdentity(input.query);
    params = {
      mode: 'PERSON',
      windowDays,
      knownEmails: identity.emails,
      knownDisplayNames: identity.displayNames,
      companyDomains: identity.companyDomains,
      subjectVariants: [],
      exactPhrase: input.query,
      basecampRefsFromEmails: [],
      timeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
    };
    normalizedQueryLabel = identity.canonicalName;
  } else {
    const expansion = await expandTopic(input.query);
    params = {
      mode: 'TOPIC',
      windowDays,
      knownEmails: [],
      knownDisplayNames: [],
      companyDomains: expansion.companyDomains,
      subjectVariants: expansion.subjectVariants,
      exactPhrase: expansion.exactPhrase,
      basecampRefsFromEmails: [],
      timeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
    };
    normalizedQueryLabel = expansion.normalizedQuery;
  }

  const rawCandidates = await runAdapters(params, input.providers);
  const refCounts = countBasecampRefOccurrences(rawCandidates);

  const seenHashes = new Set<string>();
  const scored: ScoredCandidate[] = [];
  for (const item of rawCandidates) {
    const sourceHash = computeSourceHash(item.provider, item.source_id);
    if (seenHashes.has(sourceHash)) continue; // cross-adapter dedup (e.g. same email surfaced twice)
    seenHashes.add(sourceHash);

    const reasons = buildReasons(item, params, refCounts);
    const { score, inclusionStatus } = scoreCandidate(reasons);
    scored.push({ ...item, score, reasons, sourceHash, inclusionStatus });
  }

  const clusters = groupCandidates(scored)
    .map(enrichWithParticipantCorroboration)
    .map(propagateClusterCorroboration)
    .filter((cluster) => cluster.some((c) => c.inclusionStatus !== 'EXCLUDED'));

  const summaries: DiscoveredCaseSummary[] = [];

  for (const cluster of clusters) {
    const bounded = [...cluster].sort((a, b) => b.score - a.score).slice(0, MAX_CANDIDATES_PER_CASE);
    const title = deriveCaseTitle(bounded);

    const createdCase = await openCase({
      title,
      mode: input.mode,
      normalized_query: normalizedQueryLabel,
      source_query: { mode: input.mode, query: input.query, window: input.window, providers: input.providers ?? null },
      opened_by: input.openedBy,
    });

    let includedCount = 0;
    let candidateCount = 0;

    for (const item of bounded) {
      const inclusionStatus = item.inclusionStatus;
      if (inclusionStatus === 'INCLUDED') includedCount++;
      if (inclusionStatus === 'CANDIDATE') candidateCount++;

      try {
        const created = await InboxCaseItem.create({
          case_id: createdCase.id,
          source_type: item.source_type,
          source_id: item.source_id,
          provider: item.provider,
          source_url: item.source_url,
          title: item.title,
          occurred_at: item.occurred_at,
          match_score: item.score,
          match_reasons: item.reasons,
          inclusion_status: inclusionStatus,
          disposition: null,
          disposition_reason: null,
          // thread_id/message_id/in_reply_to exist only on the transient
          // RawCandidateItem used for grouping — persist them into the
          // snapshot so a later reply action (Phase 5 executor) can thread
          // correctly. Losing these at persistence time would silently
          // break In-Reply-To/References headers on every proposed reply.
          snapshot: {
            ...item.snapshot,
            thread_id: item.thread_id,
            message_id: item.message_id,
            in_reply_to: item.in_reply_to,
          },
          source_hash: item.sourceHash,
        } as any);

        await logCaseEvent({
          case_id: createdCase.id,
          item_id: created.id,
          event_type: inclusionStatus === 'EXCLUDED' ? 'candidate_excluded' : 'candidate_included',
          actor_type: 'system',
          actor_id: 'case_discovery_service',
          details: { score: item.score, reasons: item.reasons, source_type: item.source_type },
          correlation_id: correlationId,
        });
      } catch (err: any) {
        // Unique (case_id, source_hash) violation on a re-run is expected and benign.
        if (err?.name !== 'SequelizeUniqueConstraintError') {
          console.error(`[InboxCase] Failed to persist case item: ${err?.message}`);
        }
      }
    }

    // Discover reusable identity aliases from co-occurrence: any participant
    // email seen inside a PERSON-mode cluster is worth persisting (low
    // confidence, unverified) so future searches find it without a human
    // having to re-teach the system the same alias every time.
    if (input.mode === 'PERSON') {
      const emails = new Set(bounded.flatMap((i) => i.participants.map(normalizeEmailAddress)).filter(Boolean));
      for (const email of emails) {
        await upsertAlias({ canonicalName: normalizedQueryLabel, aliasType: 'email', aliasValue: email, confidence: 60 });
      }
    }

    await transitionCase(createdCase.id, 'ASSESSING', {
      actor_type: 'system',
      actor_id: 'case_discovery_service',
      event_type: 'case_discovery_completed',
      details: { item_count: bounded.length, included: includedCount, candidates: candidateCount },
    });

    summaries.push({ caseId: createdCase.id, title, itemCount: bounded.length, includedCount, candidateCount });
  }

  return summaries;
}
