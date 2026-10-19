import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

// One Game Room play run (Colaberry Campus C10): its server-measured seconds and, once submitted, its score. Created lazily by
// db/ensureGameScoresSchema.ts like CampusLook; not registered in models/index.ts. Never touches learning points.
export interface GameScoreAttributes {
  id: string;
  enrollment_id: string;
  cohort_id: string | null;
  game: string;
  central_date: string;
  started_at: Date;
  last_beat_at: Date;
  seconds_used: number;
  score: number | null;
  submitted_at: Date | null;
}

class GameScore extends Model<GameScoreAttributes> implements GameScoreAttributes {
  declare id: string;
  declare enrollment_id: string;
  declare cohort_id: string | null;
  declare game: string;
  declare central_date: string;
  declare started_at: Date;
  declare last_beat_at: Date;
  declare seconds_used: number;
  declare score: number | null;
  declare submitted_at: Date | null;
}

GameScore.init(
  {
    id: { type: DataTypes.UUID, primaryKey: true, allowNull: false },
    enrollment_id: { type: DataTypes.UUID, allowNull: false },
    cohort_id: { type: DataTypes.UUID, allowNull: true },
    game: { type: DataTypes.STRING(20), allowNull: false },
    central_date: { type: DataTypes.DATEONLY, allowNull: false },
    started_at: { type: DataTypes.DATE, allowNull: false },
    last_beat_at: { type: DataTypes.DATE, allowNull: false },
    seconds_used: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    score: { type: DataTypes.INTEGER, allowNull: true },
    submitted_at: { type: DataTypes.DATE, allowNull: true },
  },
  { sequelize, tableName: 'game_scores', timestamps: false, underscored: true },
);

export default GameScore;
