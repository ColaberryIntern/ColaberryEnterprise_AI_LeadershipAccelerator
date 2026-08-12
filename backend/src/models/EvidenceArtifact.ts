import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Milestone 2 (Proof & Ticket Experience). One row = one reference to a
// piece of evidence (screenshot, log excerpt, diff, receipt) proving a ticket's
// claimed outcome. This table NEVER stores binary payloads — `storage_ref` is a path
// string, following the exact convention already used repo-wide by
// DOMSnapshot.screenshot_path / VisualReviewSession.primary_screenshot_path /
// UXRemediationOutcome.{before,after}_screenshot_path. `dom_snapshot_id` and
// `visual_review_session_id` let an artifact reference an existing capture instead of
// duplicating it; `source_event_id` lets it reference the work_ledger_events row that
// produced it (Milestone 1). Reference-by-ID, never copy, matching workLedgerService's
// own bridging convention.

export type EvidenceArtifactType = 'screenshot' | 'log' | 'diff' | 'receipt' | 'other';

interface EvidenceArtifactAttributes {
  id?: string;
  ticket_id?: string | null;
  artifact_type: EvidenceArtifactType;
  storage_ref?: string | null;
  dom_snapshot_id?: string | null;
  visual_review_session_id?: string | null;
  source_event_id?: string | null;
  title?: string | null;
  captured_at?: Date | null;
  metadata?: Record<string, any>;
  created_at?: Date;
}

class EvidenceArtifact extends Model<EvidenceArtifactAttributes> implements EvidenceArtifactAttributes {
  declare id: string;
  declare ticket_id: string | null;
  declare artifact_type: EvidenceArtifactType;
  declare storage_ref: string | null;
  declare dom_snapshot_id: string | null;
  declare visual_review_session_id: string | null;
  declare source_event_id: string | null;
  declare title: string | null;
  declare captured_at: Date | null;
  declare metadata: Record<string, any>;
  declare created_at: Date;
}

EvidenceArtifact.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    ticket_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'tickets', key: 'id' } },
    artifact_type: { type: DataTypes.STRING(30), allowNull: false },
    storage_ref: { type: DataTypes.STRING(512), allowNull: true },
    dom_snapshot_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'dom_snapshots', key: 'id' } },
    visual_review_session_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'visual_review_sessions', key: 'id' } },
    source_event_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'work_ledger_events', key: 'event_id' } },
    title: { type: DataTypes.STRING(255), allowNull: true },
    captured_at: { type: DataTypes.DATE, allowNull: true },
    metadata: { type: DataTypes.JSONB, allowNull: true, defaultValue: {} },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'evidence_artifacts',
    timestamps: false,
    indexes: [
      { fields: ['ticket_id'] },
      { fields: ['artifact_type'] },
      { fields: ['source_event_id'] },
    ],
  }
);

export default EvidenceArtifact;
