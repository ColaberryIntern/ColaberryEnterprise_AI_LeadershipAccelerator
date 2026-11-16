/**
 * Synthetic fixtures for the Gap Detector tests. Ids are fake; names mirror the shape of the real catalog (no client
 * names: the repo is public). Never production state.
 */
import type { CaseStudyEvidence, CatalogService } from '../serviceGapTypes';

export const svc = (id: string, name: string, status: CatalogService['status'], keywords: string[], extra: Partial<CatalogService> = {}): CatalogService => ({
  id, name, status, category: extra.category ?? null, description: extra.description ?? null, keywords, naicsCodes: [], confirmedProofCount: extra.confirmedProofCount ?? 0, ...extra,
});

export const CATALOG: CatalogService[] = [
  svc('00000000-0000-4000-8000-000000000001', 'Computer Vision & Industrial AI', 'active', ['computer vision', 'defect detection', 'inspection', 'manufacturing', 'image'], { category: 'AI Engineering' }),
  svc('00000000-0000-4000-8000-000000000002', 'AI Agents & Managed AI Workforce', 'active', ['agents', 'automation', 'chatbot', 'workflow', 'eligibility'], { category: 'AI Engineering' }),
  svc('00000000-0000-4000-8000-000000000003', 'Responsible AI Governance & Assurance', 'active', ['governance', 'assurance', 'testing', 'audit', 'prompt'], { category: 'AI Governance' }),
  svc('00000000-0000-4000-8000-000000000004', 'Geospatial Analytics', 'growth', ['geospatial', 'gis', 'satellite', 'mapping']),
  svc('00000000-0000-4000-8000-000000000005', 'Training and Documentation', 'retired', ['training', 'documentation']),
];

const LONG = 'The team built a model that reads sensor history from transformers and industrial motors, estimates thermal aging, '
  + 'and schedules maintenance before failure. Delivered a dashboard and an alerting service for plant engineers.';

export const ev = (over: Partial<CaseStudyEvidence> = {}): CaseStudyEvidence => ({
  id: '10000000-0000-4000-8000-000000000001', title: 'Digital Twin-Based Thermal Aging Prediction for Transformers and Industrial Motors',
  sourceKind: 'outside', status: 'draft', industry: 'Manufacturing', canonicalSummary: null, primaryCapability: null,
  analysis: { summary: LONG, problem: 'Unplanned motor and transformer failures.', approach: 'Digital twin plus survival model.', outcomes: ['Earlier maintenance windows'], capabilities: ['Predictive maintenance', 'Digital twin'], keywords: ['digital twin', 'predictive maintenance', 'manufacturing'], techStack: ['Python'] },
  analysisError: null, ...over,
});
