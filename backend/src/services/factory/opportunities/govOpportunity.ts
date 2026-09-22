/**
 * A government-contract opportunity as the Factory entry page needs it — the card fields the admin picks
 * from. The live source is the external Opportunity Pulse (Bonfire) feed; when that is not configured the
 * page shows GOV_OPPORTUNITY_SNAPSHOT, a curated in-app snapshot clearly labeled with its date. The `source`
 * on the feed says which it is, so a snapshot is never presented as live.
 */
export interface GovOpportunity {
  /** Bonfire opportunity id (the external id space — distinct from delivery_projects.id). */
  uuid: string;
  title: string;
  agency: string;
  /** ISO date (YYYY-MM-DD) when the solicitation closes, or null if unknown. */
  closeDate: string | null;
  /** 0-100 best-fit score from Opportunity Pulse, or null. */
  fitScore: number | null;
  /** 0-100 priority score from Opportunity Pulse (the "priority" badge), or null/absent (snapshot omits it). */
  priorityScore?: number | null;
  /** Estimated contract value in USD, or null. Note: the live Bonfire feed returns cents — the mapper converts. */
  estimatedValue: number | null;
  /** AI category / sector tag from Opportunity Pulse (e.g. "IT Services"), or null/absent. */
  category?: string | null;
  /** Link to the agency's Bonfire portal / source, or null. */
  sourceUrl: string | null;
  /** Whether it is already being pursued (live: pursuitStatus !== 'none'; snapshot: explicit flag). */
  pursued?: boolean;
}

export interface GovOpportunityFeed {
  opportunities: GovOpportunity[];
  /** 'live' = pulled from Opportunity Pulse this request; 'snapshot' = the curated in-app fallback. */
  source: 'live' | 'snapshot';
  /** The snapshot's vintage (YYYY-MM-DD) when source === 'snapshot'; null when live. */
  snapshotDate: string | null;
}

/**
 * The date GOV_OPPORTUNITY_SNAPSHOT was captured from Opportunity Pulse. Shown on the page so the snapshot
 * is honestly dated (its close dates are historical) until the live pull is configured.
 */
export const SNAPSHOT_DATE = '2026-06-08';

/**
 * Curated snapshot of the best-fit gov proposals, captured from Opportunity Pulse (mirrors the hand-filtered
 * software/system candidate list the gov-bid scripts already used). Static, not user input. Replaced by the
 * live feed once OP_ADMIN_* + OPPORTUNITY_PULSE_LIST_PATH are configured in the environment.
 */
export const GOV_OPPORTUNITY_SNAPSHOT: readonly GovOpportunity[] = [
  { uuid: '8d98ee56-e817-4cb1-93c9-863210cd8db5', title: 'SLCC RFP - Computer Maintenance Management System (CMMS)', agency: 'U3P Utah', closeDate: '2026-06-22', fitScore: 75, estimatedValue: 500000, sourceUrl: 'https://utah.bonfirehub.com/opportunities/238670', pursued: false },
  { uuid: '62033082-b414-410d-9ab3-c385b34acc80', title: 'RFP - Financial Reporting System for Harris County Auditor', agency: 'Harris County', closeDate: '2026-06-22', fitScore: 75, estimatedValue: 300000, sourceUrl: 'https://harriscountytx.bonfirehub.com/opportunities/206717', pursued: false },
  { uuid: '3f55d2af-8396-4089-86be-e2bd94f68fa6', title: 'RFP - Election Management System for Harris County Clerk', agency: 'Harris County', closeDate: '2026-06-22', fitScore: 70, estimatedValue: 1000000, sourceUrl: 'https://harriscountytx.bonfirehub.com/opportunities/206717', pursued: false },
  { uuid: '2e287828-9040-4948-98fe-a0250a5d66a5', title: 'RFP - Agenda and Meeting Management System for Harris County', agency: 'Harris County', closeDate: '2026-06-22', fitScore: 70, estimatedValue: 300000, sourceUrl: 'https://harriscountytx.bonfirehub.com/opportunities/206717', pursued: true },
  { uuid: 'a3e41e69-e7ce-4804-ad13-1f49c22d1885', title: 'Community Engagement Platform', agency: 'City of Detroit', closeDate: '2026-06-22', fitScore: 70, estimatedValue: 500000, sourceUrl: 'https://detroit.bonfirehub.com/opportunities/228082', pursued: false },
  { uuid: 'db592612-b5da-4392-820a-f2333d57ab81', title: 'Professional Licensing & Registration System Modernization', agency: 'U3P Utah', closeDate: '2026-06-23', fitScore: 75, estimatedValue: 1000000, sourceUrl: 'https://utah.bonfirehub.com/opportunities/236841', pursued: false },
  { uuid: 'f8df4b8d-fa4f-4130-9d67-b696677ecaf2', title: 'Data Center Network Infrastructure Services', agency: 'City of Dallas', closeDate: '2026-06-26', fitScore: 75, estimatedValue: 750000, sourceUrl: 'https://dallascityhall.bonfirehub.com/opportunities/', pursued: false },
  { uuid: '2f5fd926-05f6-4d02-9388-c0ae3b141aed', title: 'Multifamily Management System', agency: 'TDHCA', closeDate: '2026-06-29', fitScore: 70, estimatedValue: 750000, sourceUrl: 'https://tdhca-texas-gov.bonfirehub.com/opportunities/', pursued: false },
  { uuid: '4dc18cd6-a1a3-4bdd-86f4-b4e97c6d6dd7', title: 'Community Development Software for Housing', agency: 'UT Dallas', closeDate: '2026-06-30', fitScore: 70, estimatedValue: 500000, sourceUrl: 'https://utdallas.bonfirehub.com/opportunities/', pursued: false },
  { uuid: '3dd7cb9c-be0f-4396-82e8-3502b3b9c8c8', title: 'Juvenile Justice Control System Modernization', agency: 'Galveston County', closeDate: '2026-07-02', fitScore: 70, estimatedValue: 750000, sourceUrl: 'https://galvestoncountytx.bonfirehub.com/opportunities/', pursued: false },
];
