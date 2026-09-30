/** RuntimeNote — the student's AI Notebook: notes, bookmarks, highlights, and
 *  flashcards captured during activities. Searchable per student. */
import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

class RuntimeNote extends Model {
  declare id: string;
  declare enrollment_id: string;
  declare card_id: string | null;
  declare kind: string;         // note | bookmark | highlight | flashcard
  declare title: string | null;
  declare body: string | null;
  declare back: string | null;  // flashcard back
  declare created_at: Date;
}

RuntimeNote.init({
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  enrollment_id: { type: DataTypes.UUID, allowNull: false },
  card_id: { type: DataTypes.UUID, allowNull: true },
  kind: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'note' },
  title: { type: DataTypes.STRING(400), allowNull: true },
  body: { type: DataTypes.TEXT, allowNull: true },
  back: { type: DataTypes.TEXT, allowNull: true },
}, { sequelize, modelName: 'RuntimeNote', tableName: 'runtime_notes', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false });

export default RuntimeNote;
