import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryEvent — the structured delivery event stream (master plan §14).
 *
 * NO FOREIGN KEYS, ANYWHERE. This table is append-only and write-hot, and it must outlive
 * what it describes: archiving a project or removing an identity cannot be allowed to
 * cascade away the record of what happened. Same reasoning the multi-tenancy work applied
 * to `tenant_access_audits` and to keeping FKs off `page_events` / `visitor_sessions`.
 *
 * NO updated_at, for the same reason `tenant_access_audits` has none. An event is not
 * edited. A stream you can rewrite is not a stream.
 *
 * `correlation_id` is the whole point of the table. Root CLAUDE.md's observability rule
 * is that if a failure cannot be traced from symptom back to root cause through a single
 * correlation ID, the observability is incomplete — so the id generated at the entry point
 * of a request or job flows through every event here.
 *
 * NOT A REPLACEMENT FOR STRUCTURED LOGS. Application logs are for debugging and roll off;
 * this is the durable delivery narrative that a client, an auditor or a case study reads.
 * `context` must never carry secrets or raw client source (master plan §11, §14).
 */
export type DeliveryEventOutcome = 'success' | 'failure' | 'partial';

export const DELIVERY_EVENT_OUTCOMES: readonly DeliveryEventOutcome[] = [
  'success',
  'failure',
  'partial',
];

/**
 * The canonical event names from master plan §14. Typed as a union for call sites, but
 * stored as a plain string so adding an event is not a migration.
 */
export type DeliveryEventType =
  | 'delivery_project.created'
  | 'delivery_contract.approved'
  | 'delivery_decision.recorded'
  | 'design_variant.generated'
  | 'design_decision.approved'
  | 'story.ready'
  | 'execution_run.queued'
  | 'execution_run.started'
  | 'execution_run.failed'
  | 'execution_run.completed'
  | 'evidence.recorded'
  | 'release.ready'
  | 'release.accepted'
  | 'release.deployed'
  | 'operational_signal.recorded'
  | 'candidate_story.created';

export const DELIVERY_EVENT_TYPES: readonly DeliveryEventType[] = [
  'delivery_project.created',
  'delivery_contract.approved',
  'delivery_decision.recorded',
  'design_variant.generated',
  'design_decision.approved',
  'story.ready',
  'execution_run.queued',
  'execution_run.started',
  'execution_run.failed',
  'execution_run.completed',
  'evidence.recorded',
  'release.ready',
  'release.accepted',
  'release.deployed',
  'operational_signal.recorded',
  'candidate_story.created',
];

export interface DeliveryEventAttributes {
  id?: string;
  /** Nullable: an engagement-level event has no project yet. */
  delivery_project_id?: string | null;
  engagement_id?: string | null;
  /** Denormalised so the event stays scopeable after its project is archived. */
  tenant_id?: string | null;
  event_type: string;
  correlation_id?: string | null;
  actor_identity_id?: string | null;
  outcome?: DeliveryEventOutcome | null;
  context?: Record<string, any> | null;
  created_at?: Date;
}

class DeliveryEvent extends Model<DeliveryEventAttributes> implements DeliveryEventAttributes {
  declare id: string;
  declare delivery_project_id: string | null;
  declare engagement_id: string | null;
  declare tenant_id: string | null;
  declare event_type: string;
  declare correlation_id: string | null;
  declare actor_identity_id: string | null;
  declare outcome: DeliveryEventOutcome | null;
  declare context: Record<string, any> | null;
  declare created_at: Date;
}

DeliveryEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    // Every column below is FK-free by design. See the class comment.
    delivery_project_id: { type: DataTypes.UUID, allowNull: true },
    engagement_id: { type: DataTypes.UUID, allowNull: true },
    tenant_id: { type: DataTypes.UUID, allowNull: true },
    event_type: { type: DataTypes.STRING(60), allowNull: false },
    correlation_id: { type: DataTypes.UUID, allowNull: true },
    actor_identity_id: { type: DataTypes.UUID, allowNull: true },
    outcome: { type: DataTypes.STRING(20), allowNull: true },
    context: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      // "What happened on this project, newest first" — the timeline query.
      {
        fields: ['delivery_project_id', 'created_at'],
        name: 'idx_delivery_events_project_created',
      },
      // "Trace this one request end to end" — the debugging query.
      { fields: ['correlation_id'], name: 'idx_delivery_events_correlation' },
    ],
  },
);

export default DeliveryEvent;
