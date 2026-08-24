import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * DeliveryProjectSourceLink — the bridge between a student `Project` and a
 * `DeliveryProject`.
 *
 * WHY A TABLE AND NOT A COLUMN. Putting `delivery_project_id` on `projects` would mean
 * altering the table 32 files already read, for a relationship that is absent in the
 * overwhelming majority of rows. Master plan §Gate 1 forbids destructively migrating
 * student projects, and this keeps `projects` untouched: a student project that is never
 * linked is bit-for-bit what it was before this feature existed.
 *
 * ABSENCE IS THE NORMAL CASE. A commercial client project has no student project behind
 * it and never will. A student project usually has no delivery context. The link exists
 * for the case where an existing capstone is pulled into a real engagement, and nothing
 * degrades when it is missing.
 *
 * UNIQUE ON student_project_id. Master plan §15 requires "same source link ⇒ one link",
 * and beyond replay-safety it stops one student's project being claimed by two delivery
 * projects — which would make "whose evidence is this?" unanswerable at exactly the
 * moment builder credit is awarded.
 */
export interface DeliveryProjectSourceLinkAttributes {
  id?: string;
  delivery_project_id: string;
  student_project_id: string;
  linked_by_identity_id?: string | null;
  /** Why this student project was pulled into a delivery context. Free text, for humans. */
  link_reason?: string | null;
  created_at?: Date;
}

class DeliveryProjectSourceLink
  extends Model<DeliveryProjectSourceLinkAttributes>
  implements DeliveryProjectSourceLinkAttributes
{
  declare id: string;
  declare delivery_project_id: string;
  declare student_project_id: string;
  declare linked_by_identity_id: string | null;
  declare link_reason: string | null;
  declare created_at: Date;
}

DeliveryProjectSourceLink.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    delivery_project_id: { type: DataTypes.UUID, allowNull: false },
    student_project_id: { type: DataTypes.UUID, allowNull: false },
    linked_by_identity_id: { type: DataTypes.UUID, allowNull: true },
    link_reason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    tableName: 'delivery_project_source_links',
    // No updated_at: a link is created or removed, never edited into a different link.
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
    indexes: [
      {
        unique: true,
        fields: ['student_project_id'],
        name: 'delivery_project_source_links_student_unique',
      },
      { fields: ['delivery_project_id'], name: 'idx_delivery_source_links_delivery' },
    ],
  },
);

export default DeliveryProjectSourceLink;
