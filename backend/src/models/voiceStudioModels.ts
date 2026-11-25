/**
 * Voice AI Studio Sequelize models (VS1.4), generated from the same specs as the boot DDL
 * (db/voiceStudioTableSpecs.ts), so a model attribute always equals a database column.
 *
 * Defaults (UUIDs, timestamps, the identity `seq`) live in the database, so attributes carry no
 * client-side defaultValue: an insert that omits a column gets the database default.
 * Grouped in one file like growthJourneyModels.ts; re-exported from models/index.ts.
 */
import { Model, ModelStatic } from 'sequelize';
import { sequelize } from '../config/database';
import { VOICE_TABLE_SPECS, TableSpec } from '../db/voiceStudioTableSpecs';

function defineVoiceModel(spec: TableSpec): ModelStatic<Model> {
  class VoiceStudioModel extends Model {}
  const attributes = Object.fromEntries(spec.columns.map((col) => [col.name, {
    type: col.type as never, // a Sequelize DataType from the spec; typed loosely there to keep the spec table readable
    allowNull: col.allowNull,
    primaryKey: col.name === 'id',
  }]));
  VoiceStudioModel.init(attributes, { sequelize, modelName: spec.model, tableName: spec.table, timestamps: false });
  return VoiceStudioModel;
}

const built = Object.fromEntries(VOICE_TABLE_SPECS.map((s) => [s.model, defineVoiceModel(s)])) as Record<string, ModelStatic<Model>>;

export const VoiceAgentProfile = built.VoiceAgentProfile;
export const VoiceAgentVersion = built.VoiceAgentVersion;
export const VoiceNumber = built.VoiceNumber;
export const VoiceRoute = built.VoiceRoute;
export const VoiceCall = built.VoiceCall;
export const VoiceCallEvent = built.VoiceCallEvent;
export const VoiceDialReservation = built.VoiceDialReservation;
export const VoiceTurn = built.VoiceTurn;
export const VoiceToolRun = built.VoiceToolRun;
export const VoiceArtifact = built.VoiceArtifact;
export const VoiceEvaluationRun = built.VoiceEvaluationRun;
export const VoiceTestCase = built.VoiceTestCase;
export const VoiceUsage = built.VoiceUsage;
export const VoiceTokenUse = built.VoiceTokenUse;

/** Every Voice Studio model by name (used by tests and the retention job). */
export const VOICE_STUDIO_MODELS: Readonly<Record<string, ModelStatic<Model>>> = built;
