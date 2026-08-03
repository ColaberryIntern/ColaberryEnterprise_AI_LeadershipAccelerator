import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// ProofDesk Work Graph (Milestone 3). One directed edge in a ticket's work-unit DAG:
// work_unit_id depends on (is blocked by) depends_on_work_unit_id.

interface WorkUnitDependencyAttributes {
  id?: string;
  work_unit_id: string;
  depends_on_work_unit_id: string;
  dependency_type?: string;
  created_at?: Date;
}

class WorkUnitDependency
  extends Model<WorkUnitDependencyAttributes>
  implements WorkUnitDependencyAttributes
{
  declare id: string;
  declare work_unit_id: string;
  declare depends_on_work_unit_id: string;
  declare dependency_type: string;
  declare created_at: Date;
}

WorkUnitDependency.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    work_unit_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'ticket_work_units', key: 'id' },
    },
    depends_on_work_unit_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'ticket_work_units', key: 'id' },
    },
    dependency_type: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'blocks',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: 'work_unit_dependencies',
    timestamps: false,
    indexes: [{ fields: ['work_unit_id'] }, { fields: ['depends_on_work_unit_id'] }],
  }
);

export default WorkUnitDependency;
