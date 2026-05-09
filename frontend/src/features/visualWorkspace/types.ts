/**
 * Visual Engineering Workspace V1 — local types.
 *
 * The backend `useVisualReviewSession` hook already exposes the canonical
 * session / critique / suggestion / decision shapes. These local types
 * narrow them for the V1 productized UI surface (pin overlay, sidebar
 * sections, prompt preview).
 */

export type CritiqueKind =
  | 'spacing'
  | 'alignment'
  | 'color'
  | 'typography'
  | 'interaction'
  | 'accessibility'
  | 'hierarchy'
  | 'responsiveness'
  | 'workflow'
  | 'copy';

export type CritiqueSeverity = 'low' | 'medium' | 'high';

export type IssueStatus = 'open' | 'suggested' | 'ready' | 'verifying' | 'resolved';

export interface PinCoordinate {
  /** % of stage width, 0..1 */
  x: number;
  /** % of stage height, 0..1 */
  y: number;
  /** % width — defaults to 0 (point pin) */
  width: number;
  /** % height — defaults to 0 (point pin) */
  height: number;
}

export interface DraftAnnotation {
  pin: PinCoordinate;
  title: string;
  description: string;
  kind: CritiqueKind;
  severity: CritiqueSeverity;
  expected_outcome: string;
  target_selector: string;
}

export interface SidebarSectionCount {
  open: number;
  suggested: number;
  ready: number;
  verifying: number;
  resolved: number;
  total: number;
}

export const CRITIQUE_KINDS: CritiqueKind[] = [
  'spacing', 'alignment', 'color', 'typography', 'interaction',
  'accessibility', 'hierarchy', 'responsiveness', 'workflow', 'copy',
];

export const SEVERITIES: CritiqueSeverity[] = ['low', 'medium', 'high'];
