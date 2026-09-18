/**
 * caseStudyVisual - runtime companions to the visual story section.
 *
 * The TYPES live in `caseStudy.ts`, which is a leaf module by contract
 * (`caseStudyContracts.test.ts`: "caseStudy.ts imports nothing at all"), and are
 * re-exported here so callers can import everything visual from one place. This
 * file holds what a leaf type file should not: the size limits the validator
 * enforces and the Studio displays.
 */
export type {
  CaseStudyVisualSchemaVersion,
  CaseStudyVisualPresentationVersion,
  CaseStudyWorkflowRole,
  CaseStudyWorkflowStatus,
  CaseStudyWorkflowLane,
  CaseStudyWorkflowType,
  CaseStudyWorkflowPanelKey,
  CaseStudyWorkflowNode,
  CaseStudyWorkflowEdge,
  CaseStudyWorkflowPanel,
  CaseStudyWorkflowVisual,
  CaseStudyVisualChartKind,
  CaseStudyVisualChartPart,
  CaseStudyVisualChart,
  CaseStudyVisualOutcomeCard,
  CaseStudyVisualGenerator,
  CaseStudyVisualState,
  CaseStudyVisualProvenance,
  CaseStudyVisualMotion,
  CaseStudyVisualStorySection,
} from './caseStudy';
export {
  CASE_STUDY_VISUAL_SCHEMA_VERSION,
  CASE_STUDY_VISUAL_PRESENTATION_VERSIONS,
  CASE_STUDY_WORKFLOW_ROLES,
  CASE_STUDY_WORKFLOW_STATUSES,
  CASE_STUDY_WORKFLOW_LANES,
  CASE_STUDY_WORKFLOW_TYPES,
  CASE_STUDY_WORKFLOW_PANEL_KEYS,
  CASE_STUDY_VISUAL_CHART_KINDS,
  CASE_STUDY_VISUAL_GENERATORS,
  CASE_STUDY_VISUAL_STATES,
  CASE_STUDY_VISUAL_MOTION,
} from './caseStudy';

/** Size limits the validator enforces. Exported so the Studio can show them. */
export const CASE_STUDY_VISUAL_LIMITS = Object.freeze({
  nodeLabel: 40,
  nodeSublabel: 48,
  nodeKicker: 60,
  nodeDetail: 280,
  nodeEvidence: 240,
  edgeLabel: 40,
  edgeCondition: 60,
  panelLabel: 40,
  panelSummary: 200,
  title: 90,
  caption: 200,
  description: 600,
  caveat: 240,
  limitation: 240,
  nodesPerPanel: 16,
  edgesPerPanel: 24,
  outcomeCards: 3,
  charts: 6,
  chartParts: 8,
});

