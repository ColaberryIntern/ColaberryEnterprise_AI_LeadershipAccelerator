import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';
import type { DeliveryStoryContract } from '../services/delivery/deliveryStoryContract';

/**
 * DeliveryStory — a persisted Story Contract.
 *
 * Gate 7 shipped the Story Contract as **pure logic with nowhere to live**. That was
 * survivable while nothing consumed a story, and stopped being survivable the moment the
 * quality gate was wired: `evaluateQualityGate` takes a `DeliveryStoryContract`, and
 * there was no way to produce a persisted one.
 *
 * ## The contract is JSONB, deliberately
 *
 * `DeliveryStoryContract` has eighteen optional fields, most of them arrays, and it is
 * still moving. A column per field would mean a migration every time Gate 7's shape
 * changed — and `validateStoryContract`, not the database, is what decides whether a
 * contract is well-formed. Postgres would only be able to enforce presence, which is the
 * least interesting of that function's rules.
 *
 * The promoted columns are the ones something queries or filters by: `title`, `status`,
 * `risk_level`. `is_ui_story` is promoted too because the quality gate reads it to decide
 * whether browser, visual and accessibility evidence are required — a field that changes
 * what is *required* deserves to be visible without parsing a blob.
 */
export interface DeliveryStoryAttributes {
  id: string;
  delivery_project_id: string;
  /** The caller's stable id — the `storyId` inside the contract. Unique per project. */
  story_key: string;
  title: string;
  status: string;
  risk_level: string | null;
  is_ui_story: boolean;
  contract: DeliveryStoryContract;
  created_by_identity_id: string | null;
  created_at: Date;
  updated_at: Date;
}

class DeliveryStory extends Model<DeliveryStoryAttributes> implements DeliveryStoryAttributes {
  declare id: string;
  declare delivery_project_id: string;
  declare story_key: string;
  declare title: string;
  declare status: string;
  declare risk_level: string | null;
  declare is_ui_story: boolean;
  declare contract: DeliveryStoryContract;
  declare created_by_identity_id: string | null;
  declare created_at: Date;
  declare updated_at: Date;
}

DeliveryStory.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    story_key: { type: DataTypes.STRING(120), allowNull: false },
    title: { type: DataTypes.TEXT, allowNull: false },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'proposed' },
    risk_level: { type: DataTypes.STRING(20), allowNull: true },
    // Read by the quality gate to decide whether browser, visual and a11y evidence are
    // required. Promoted out of the blob because it changes what is REQUIRED.
    is_ui_story: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    contract: { type: DataTypes.JSONB, allowNull: false },
    created_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: 'delivery_stories',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      // Two stories with the same key on one project would make evidence ambiguous —
      // the one thing evidence cannot afford to be.
      {
        unique: true,
        fields: ['delivery_project_id', 'story_key'],
        name: 'delivery_stories_project_key_unique',
      },
      { fields: ['delivery_project_id', 'status'], name: 'idx_delivery_stories_project_status' },
    ],
  },
);

export default DeliveryStory;
