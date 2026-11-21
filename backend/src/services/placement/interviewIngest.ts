import type { InboxEvent } from './inboxEventSchema';

/**
 * Career Prep v27, CP8.1: where an `interview.detected` / `interview.updated` event from the inbox manager becomes a
 * placement interview. STUB until T15 (CP8.1a) replaces it with the real ingestion: it does nothing and answers
 * `deferred`, so the event is stored (inbox_events) with processed_at NULL and T15 ingests exactly those rows.
 */
/** `deferred` = not handled yet (left for later); T15 adds the outcomes of a real ingestion. */
export type IngestResult = { status: 'deferred' } | { status: 'ingested' };

export async function ingestInterviewEvent(_event: InboxEvent): Promise<IngestResult> {
  return { status: 'deferred' };
}
