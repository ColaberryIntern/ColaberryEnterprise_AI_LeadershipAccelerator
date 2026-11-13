import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * AgentDomainToolRequestBuildEvent — one milestone in delivering an approved tool request.
 *
 * Agent Tools Phase 3. Ali asked that a request be tracked "until it is built out and handed
 * over". Before this, approval was the last thing anything recorded, so a request read
 * "approved" forever whether it shipped the next day or was never started.
 *
 * ## Why not a wider status on the request
 *
 * `agent_domain_change_requests.status` is the GOVERNANCE state and has four values with a
 * transition machine and existing readers. Approval is Ali's decision; building is the
 * builder's work. Putting both in one column would mean every reader of that column silently
 * acquires two values it has never seen, and would conflate "was this allowed" with "did
 * somebody do it".
 *
 * ## What it deliberately cannot hold
 *
 * No `status`, no `verb`, no `tools_granted`, no `autonomy_level`. It cannot approve or grant
 * anything. A request that was never approved cannot have a build event at all, which the
 * service refuses by name — so this table can never become a way around the approval it
 * depends on.
 */
export type ToolRequestBuildEventName = 'started_build' | 'handed_over';

/** The two milestones, mirrored by chk_adtrbe_event_is_known in the schema. */
export const TOOL_REQUEST_BUILD_EVENTS: ReadonlyArray<ToolRequestBuildEventName> = [
  'started_build',
  'handed_over',
];

export interface AgentDomainToolRequestBuildEventAttributes {
  id?: string;
  change_request_id: string;
  event: ToolRequestBuildEventName;
  /** Who recorded it. Refused blank at the database by chk_adtrbe_actor_is_not_blank. */
  actor_identity: string;
  occurred_at?: Date;
  /** Optional words. A handover naming what was handed over is worth more than a bare date. */
  note?: string | null;
  created_at?: Date;
}

class AgentDomainToolRequestBuildEvent
  extends Model<AgentDomainToolRequestBuildEventAttributes>
  implements AgentDomainToolRequestBuildEventAttributes {
  declare id: string;
  declare change_request_id: string;
  declare event: ToolRequestBuildEventName;
  declare actor_identity: string;
  declare occurred_at: Date;
  declare note: string | null;
  declare created_at: Date;
}

AgentDomainToolRequestBuildEvent.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    change_request_id: { type: DataTypes.UUID, allowNull: false },
    event: { type: DataTypes.TEXT, allowNull: false },
    actor_identity: { type: DataTypes.TEXT, allowNull: false },
    occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    note: { type: DataTypes.TEXT, allowNull: true },
    created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'agent_domain_tool_request_build_events',
    timestamps: false,
    indexes: [{ fields: ['change_request_id', 'occurred_at'] }],
  },
);

export default AgentDomainToolRequestBuildEvent;
