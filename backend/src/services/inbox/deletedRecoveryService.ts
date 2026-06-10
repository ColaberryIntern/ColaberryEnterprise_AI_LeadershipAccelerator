// "Deleted But Potentially Valuable" — scores emails sitting in Trash/Spam
// (ingested by inboxDeletedSyncService) with the SAME deterministic engine used
// for hidden mail, and returns the ones that resemble historically-engaged
// communications, with a recovery recommendation. Self/system mail is excluded.

import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  scoreEmail,
  buildPositiveCorpus,
  SELF_INBOX_EXCLUSION_SQL,
  SELF_SENDERS,
} from './opportunityScoringService';
import type { ScoreFactor, ScoreTopic } from '../../models/InboxOpportunityScore';

// Structurally compatible with MissedEmailRow (report service) plus a recovery
// recommendation, so it can populate the report's deletedButValuable array.
export interface DeletedRecoveryRow {
  emailId: string;
  score: number;
  band: string;
  subject: string;
  fromName: string | null;
  fromAddress: string;
  receivedAt: string;
  currentFolder: string;       // "Trash" | "Spam"
  reasonHidden: string | null; // deletion reason
  explanation: string;         // recovery recommendation + top factors
  factors: ScoreFactor[];
  topics: ScoreTopic[];
  confidence: number;
}

interface DeletedDbRow {
  id: string;
  provider: string;
  folder: 'trash' | 'spam';
  from_address: string;
  from_name: string | null;
  subject: string | null;
  body_text: string | null;
  headers: Record<string, any> | null;
  to_addresses: any;
  received_at: string;
}

function recommendation(band: string, folder: string): string {
  if (band === 'high') return `Recovery recommended — strong opportunity signals despite landing in ${folder}.`;
  if (band === 'medium') return `Worth a look — some opportunity signals; review before it is purged from ${folder}.`;
  return `Low priority — minimal opportunity signals.`;
}

// rolling=true => trailing 24h by received_at; false => all stored (bounded by
// what the ingester keeps). Returns medium+ scorers, highest first.
export async function getDeletedButValuable(rolling = true, limit = 15): Promise<DeletedRecoveryRow[]> {
  const windowClause = rolling ? `AND e.received_at >= NOW() - INTERVAL '24 hours'` : '';
  const rows = await sequelize.query<DeletedDbRow>(
    `SELECT e.id, e.provider, e.folder, e.from_address, e.from_name, e.subject,
            e.body_text, e.headers, e.to_addresses, e.received_at
       FROM inbox_deleted_emails e
      WHERE 1=1 ${windowClause}
        AND ${SELF_INBOX_EXCLUSION_SQL}
      ORDER BY e.received_at DESC`,
    { type: QueryTypes.SELECT, replacements: { selfSenders: SELF_SENDERS } },
  );
  if (!rows.length) return [];

  const corpus = await buildPositiveCorpus();
  const scored: DeletedRecoveryRow[] = [];
  for (const r of rows) {
    const folderLabel = r.folder === 'spam' ? 'Spam' : 'Trash';
    const { score, band, factors, topics } = scoreEmail(
      {
        id: r.id,
        from_address: r.from_address,
        from_name: r.from_name,
        subject: r.subject,
        body_text: r.body_text,
        headers: r.headers,
        to_addresses: r.to_addresses,
        state: 'DELETED',
        confidence: null,
        reasoning: `In ${folderLabel}`,
      },
      corpus,
    );
    if (score < 40) continue; // only surface medium+ recovery candidates
    const positives = factors.filter((f) => f.points > 0).sort((a, b) => b.points - a.points).slice(0, 3).map((f) => f.label);
    scored.push({
      emailId: r.id,
      score,
      band,
      subject: r.subject || '(no subject)',
      fromName: r.from_name,
      fromAddress: r.from_address,
      receivedAt: r.received_at,
      currentFolder: folderLabel,
      reasonHidden: `Found in ${folderLabel}`,
      explanation: `${recommendation(band, folderLabel)}${positives.length ? ' Signals: ' + positives.join('; ') + '.' : ''}`,
      factors,
      topics,
      confidence: 0,
    });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
