import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export interface GitHubConnectionAttributes {
  id?: string;
  enrollment_id: string;
  repo_url?: string;
  repo_owner?: string;
  repo_name?: string;
  access_token_encrypted?: string;
  last_checked_at?: Date;
  status_json?: any;
  file_tree_json?: any;
  last_sync_at?: Date;
  commit_summary_json?: any;
  repo_language?: string;
  file_count?: number;
  created_at?: Date;
  /**
   * Persisted React Router registry (2026-05-20, Tier-3 A+E extension).
   * Populated by syncFileTree alongside file_tree_json. Engine refresh
   * reads this column instead of making per-refresh GitHub API calls
   * to fetch the 5 route files (App.tsx + 4 routes/*.tsx).
   *
   * Shape:
   *   routes:         registered paths from `path="..."` declarations
   *   captured_at:    ISO timestamp of last sync
   *   source_files:   which files contributed (for transparency)
   *   parsed_count:   number of source files successfully parsed
   */
  route_registry_json?: {
    routes: string[];
    captured_at: string;
    source_files: string[];
    parsed_count: number;
  } | null;
  /**
   * Component → route bindings (2026-05-20). Map of React component
   * name to the route that renders it, parsed from <Route path="x"
   * element={<Comp />}/> declarations. Lets the engine derive
   * cap.frontend_route from a cap's linked_frontend_components.
   */
  route_component_bindings_json?: {
    bindings: Record<string, string>; // componentName → route
    captured_at: string;
  } | null;
}

class GitHubConnection extends Model<GitHubConnectionAttributes> implements GitHubConnectionAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare repo_url: string;
  declare repo_owner: string;
  declare repo_name: string;
  declare access_token_encrypted: string;
  declare last_checked_at: Date;
  declare status_json: any;
  declare file_tree_json: any;
  declare last_sync_at: Date;
  declare commit_summary_json: any;
  declare repo_language: string;
  declare file_count: number;
  declare created_at: Date;
}

GitHubConnection.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    enrollment_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'enrollments', key: 'id' },
    },
    repo_url: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    repo_owner: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    repo_name: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    access_token_encrypted: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    last_checked_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    status_json: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    file_tree_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    last_sync_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    commit_summary_json: {
      type: DataTypes.JSONB,
      allowNull: true,
    },
    repo_language: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    file_count: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    // Tier-3 A+E extension (2026-05-20): persisted React Router registry.
    // See route_registry_json doc above. Populated by syncFileTree.
    route_registry_json: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },
    // Component → route bindings (2026-05-20). See doc above.
    route_component_bindings_json: { type: DataTypes.JSONB, allowNull: true, defaultValue: null },
  },
  {
    sequelize,
    tableName: 'github_connections',
    timestamps: false,
  }
);

export default GitHubConnection;
