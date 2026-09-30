import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * ChecklistInstance — Reese Agentic AI Employee mission, Capability 6
 * ("Create persistent checklist instances tied to a real assessment,
 * intervention, ticket, report, or follow-up. A static checklist component
 * is not sufficient."). Confirmed absent anywhere in this codebase at
 * discovery — SessionChecklist.ts is a same-named-sounding but structurally
 * unrelated per-live-class-session logistics checklist (flat boolean items,
 * no gate, no bypass, no audit); not reused, not extended.
 *
 * Generic by construction: `subject_type`/`subject_id` bridge by id only
 * (never a typed FK), mirroring WorkLedgerEvent's own
 * source_record_type/source_record_id convention — the same generality
 * reason applies here, since a future Outreach/Closure checklist instance
 * won't have a `student_assessments` row to point at.
 *
 * Mutable, unlike StudentAssessment's immutable-per-run convention: a
 * bypass is a real human action that happens AFTER an instance already
 * exists, updating it in place (bypassed_at/bypassed_by_email/
 * bypass_reason) — closer to MetricReliabilityRecord's mutate-in-place
 * shape than StudentAssessment's append-only one.
 */
export interface ChecklistInstanceAttributes {
  id?: string;
  checklist_type: string;
  subject_type: string;
  subject_id: string;
  items: Record<string, boolean>;
  /** Every incomplete item (required or not), for honest display —
   * `complete` below is the only field that actually gates. */
  incomplete_items: string[];
  complete: boolean;
  bypassed_at: Date | null;
  bypassed_by_email: string | null;
  bypass_reason: string | null;
}

class ChecklistInstance extends Model<ChecklistInstanceAttributes> implements ChecklistInstanceAttributes {
  declare id: string;
  declare checklist_type: string;
  declare subject_type: string;
  declare subject_id: string;
  declare items: Record<string, boolean>;
  declare incomplete_items: string[];
  declare complete: boolean;
  declare bypassed_at: Date | null;
  declare bypassed_by_email: string | null;
  declare bypass_reason: string | null;
  declare createdAt: Date;
  declare updatedAt: Date;
}

ChecklistInstance.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    checklist_type: { type: DataTypes.STRING(30), allowNull: false },
    subject_type: { type: DataTypes.STRING(50), allowNull: false },
    subject_id: { type: DataTypes.UUID, allowNull: false },
    items: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    incomplete_items: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    complete: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    bypassed_at: { type: DataTypes.DATE, allowNull: true },
    bypassed_by_email: { type: DataTypes.STRING(255), allowNull: true },
    bypass_reason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'checklist_instances',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['subject_type', 'subject_id'], name: 'idx_checklist_instance_subject' },
    ],
  }
);

export default ChecklistInstance;
