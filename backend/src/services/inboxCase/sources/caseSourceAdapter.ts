import { CaseMode, CaseProvider, CaseSourceType } from '../../../types/inboxCase';
import { BasecampReference } from '../textNormalization';

// Common contract every provider adapter (Gmail, Hotmail, Basecamp) must
// satisfy so caseDiscoveryService can call them uniformly. Every raw
// candidate returned here is UNSCORED — matchScoring.ts turns these fields
// into MatchReasons against the case's known identity/topic terms.

export interface DiscoveryParams {
  mode: CaseMode;
  windowDays: number | null;
  knownEmails: string[];
  knownDisplayNames: string[];
  companyDomains: string[];
  subjectVariants: string[];
  exactPhrase: string;
  // Basecamp URLs/recording IDs already found while scanning email bodies —
  // fed into the Basecamp adapter so it can do exact-ID lookups first,
  // per root directive section 14 ("Use exact Basecamp URLs/IDs found in
  // emails first").
  basecampRefsFromEmails: BasecampReference[];
  // Hard per-adapter timeout in ms — every external call in this subsystem
  // has an explicit timeout, per root CLAUDE.md > Failure-First Design.
  timeoutMs: number;
}

export interface RawCandidateItem {
  source_type: CaseSourceType;
  source_id: string;
  provider: CaseProvider;
  source_url: string | null;
  title: string;
  occurred_at: Date;
  participants: string[];
  subject_normalized: string;
  thread_id: string | null;
  message_id: string | null;
  in_reply_to: string[];
  basecamp_refs: BasecampReference[];
  attachment_names: string[];
  body_excerpt: string;
  snapshot: Record<string, unknown>;
}

export interface CaseSourceAdapter {
  provider: CaseProvider;
  isConfigured(): boolean;
  findCandidates(params: DiscoveryParams): Promise<RawCandidateItem[]>;
}

export class ProviderTimeoutError extends Error {
  error_class = 'ProviderTimeoutError';
  constructor(public provider: string, public timeoutMs: number) {
    super(`${provider} discovery timed out after ${timeoutMs}ms`);
    this.name = 'ProviderTimeoutError';
  }
}

export async function withTimeout<T>(promise: Promise<T>, provider: string, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderTimeoutError(provider, timeoutMs)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export const DEFAULT_PROVIDER_TIMEOUT_MS = 20_000;
