import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * PlatformDeliveryEvent - append-only record of every exchange with a provider.
 *
 * The column is `payload_redacted`, not `payload`. Provider request and response bodies carry
 * access tokens, and a column named `payload` invites somebody to write the raw one into it.
 * The name states the contract at the point of use, where a convention in a document does not
 * reach. This repo already has a table whose name asserts something untrue about its contents
 * - github_connections.access_token_encrypted holds plaintext - which is the failure mode
 * being avoided here.
 *
 * timestamps: false - append-only, occurred_at only.
 */
export type DeliveryEventDirection = 'request' | 'response' | 'webhook' | 'internal';

export const DELIVERY_EVENT_DIRECTIONS: readonly DeliveryEventDirection[] = [
  'request', 'response', 'webhook', 'internal',
];

export interface PlatformDeliveryEventAttributes {
  id?: string;
  publishing_job_id?: string | null;
  provider: string;
  direction: DeliveryEventDirection;
  event_type: string;
  http_status?: number | null;
  provider_code?: string | null;
  message?: string | null;
  /** REDACTED payload only. Never write a raw provider body here. */
  payload_redacted?: Record<string, any>;
  correlation_id?: string | null;
  occurred_at?: Date;
}

class PlatformDeliveryEvent
  extends Model<PlatformDeliveryEventAttributes>
  implements PlatformDeliveryEventAttributes {
  declare id: string;
  declare publishing_job_id: string | null;
  declare provider: string;
  declare direction: DeliveryEventDirection;
  declare event_type: string;
  declare http_status: number | null;
  declare provider_code: string | null;
  declare message: string | null;
  declare payload_redacted: Record<string, any>;
  declare correlation_id: string | null;
  declare occurred_at: Date;
}

PlatformDeliveryEvent.init(
  {
    id: { type: DataTypes.BIGINT, autoIncrement: true, primaryKey: true },
    publishing_job_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'publishing_jobs', key: 'id' },
    },
    provider: { type: DataTypes.STRING(40), allowNull: false },
    direction: { type: DataTypes.STRING(12), allowNull: false },
    event_type: { type: DataTypes.STRING(60), allowNull: false },
    http_status: { type: DataTypes.INTEGER, allowNull: true },
    provider_code: { type: DataTypes.STRING(80), allowNull: true },
    message: { type: DataTypes.TEXT, allowNull: true },
    payload_redacted: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    correlation_id: { type: DataTypes.STRING(64), allowNull: true },
    occurred_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: 'platform_delivery_events', timestamps: false },
);

export default PlatformDeliveryEvent;
