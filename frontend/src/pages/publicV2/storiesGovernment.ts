/**
 * The Government chapter's vocabulary: the seven procurement categories and the
 * three delivery contexts, said the way a contracting officer would say them.
 *
 * WHY A CATALOG AND NOT `humanizeFacetLabel`. The open facets (stack, capability)
 * are the reader's own words, so a humaniser is the right tool. These two are
 * CLOSED vocabularies whose members mean something specific in a federal
 * response - each category is the thing a solicitation is classified under, and
 * the NAICS / PSC codes beside it are what a capture team searches by. That is
 * copy a human authored once, not a slug to prettify.
 *
 * THE CODES ARE DISPLAY COPY. They are printed so a public-sector reader can see
 * at a glance where the work fits; nothing filters on them and they never reach
 * a URL. The filter VALUE is the category slug, exactly as the server stores it.
 *
 * THE ORDER IS THE BACKEND'S. `CASE_STUDY_GOV_CAPABILITIES` fixes the canonical
 * sequence, and this catalog is walked in that order so the chapter, the
 * sidebar and a card's chips all agree.
 */
import {
  CASE_STUDY_GOV_CAPABILITIES,
} from '../../services/caseStudyPublicTypes';
import type {
  CaseStudyDeliveryContext,
  CaseStudyGovCapability,
} from '../../services/caseStudyPublicTypes';

export interface GovCapabilityEntry {
  readonly key: CaseStudyGovCapability;
  readonly label: string;
  /** One line: what the buyer is actually purchasing. */
  readonly buys: string;
  readonly naics: readonly string[];
  readonly psc: readonly string[];
}

const ENTRIES: Readonly<Record<CaseStudyGovCapability, Omit<GovCapabilityEntry, 'key'>>> = {
  'ai-strategy-readiness': {
    label: 'AI strategy & readiness',
    buys: 'Enterprise AI strategy, roadmaps, readiness assessment, AI RMF crosswalks, vendor evaluation.',
    naics: ['541611', '541519'],
    psc: ['R408', 'DF01'],
  },
  'agentic-multi-agent-ai': {
    label: 'Agentic & multi-agent AI',
    buys: 'Production multi-agent orchestration with human-in-the-loop gates on consequential decisions.',
    naics: ['541511'],
    psc: ['DA01'],
  },
  'rag-document-intelligence': {
    label: 'RAG & document intelligence',
    buys: 'Retrieval over agency corpora, document shredding and extraction, accessibility remediation.',
    naics: ['541511', '518210'],
    psc: ['DA01', 'DF01'],
  },
  'data-engineering-modernization': {
    label: 'Data engineering & modernisation',
    buys: 'Pipelines, semantic layers, source-of-truth governance, migration off legacy stores.',
    naics: ['541512', '518210'],
    psc: ['DA01', 'DF01'],
  },
  'decision-intelligence-forecasting': {
    label: 'Decision intelligence & forecasting',
    buys: 'Risk scoring, anomaly detection, demand and lead-time models, operational dashboards.',
    naics: ['541512', '541513'],
    psc: ['R408', 'DA01'],
  },
  'ai-workforce-enablement': {
    label: 'AI workforce enablement',
    buys: 'AI literacy curriculum, instructional design, microlearning at enterprise scale, adoption programmes.',
    naics: ['611430', '541611'],
    psc: ['U008', 'R408'],
  },
  'ai-governance-assurance': {
    label: 'AI governance & assurance',
    buys: 'Observability, evaluation harnesses, adversarial review gates, model-risk documentation.',
    naics: ['541519', '541611'],
    psc: ['DF01', 'R408'],
  },
};

export const GOV_CAPABILITY_CATALOG: readonly GovCapabilityEntry[] =
  CASE_STUDY_GOV_CAPABILITIES.map((key) => ({ key, ...ENTRIES[key] }));

export const GOV_CAPABILITY_LABELS: Readonly<Record<CaseStudyGovCapability, string>> =
  Object.freeze(Object.fromEntries(
    GOV_CAPABILITY_CATALOG.map((e) => [e.key, e.label]),
  ) as Record<CaseStudyGovCapability, string>);

export interface DeliveryContextEntry {
  readonly key: CaseStudyDeliveryContext;
  readonly label: string;
  readonly meaning: string;
}

/**
 * Same words the card prints (`DELIVERY_CONTEXT_LABELS` in the surface config),
 * plus the one sentence a buyer needs to read them correctly. The third entry's
 * sentence is the point of the whole field.
 */
export const DELIVERY_CONTEXT_CATALOG: readonly DeliveryContextEntry[] = [
  {
    key: 'client_delivery',
    label: 'Client delivery',
    meaning: 'Delivered to a client under an engagement. The closest thing here to past performance.',
  },
  {
    key: 'internal_platform',
    label: 'Internal platform',
    meaning: 'Our own system, running in our own production, with the figures it reports.',
  },
  {
    key: 'capability_demonstration',
    label: 'Capability demonstration',
    meaning: 'Real work built against real public-sector requirements, not delivered under a contract. '
      + 'Shown to demonstrate capability; never presented as past performance.',
  },
];
