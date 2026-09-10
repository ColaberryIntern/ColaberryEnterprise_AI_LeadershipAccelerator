import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

/**
 * JourneyPath — one offer family inside one journey program.
 *
 * A program says whose journey it is; its paths say what may be offered along
 * it. Colaberry Enterprise runs business training, consulting, workflow
 * automation, application builds and general AI projects; AI Flotation runs the
 * same set minus training. Each of those is a path.
 *
 * `offer_family` IS A PLAIN STRING, NOT A POSTGRES ENUM. §4 lists eleven
 * families today and the set is expected to grow, and a Postgres enum cannot
 * have a value removed once added — the migration to undo a mistake is worse
 * than the mistake. What is permitted per brand is enforced by the brand-offer
 * policy table (T202) and its contract test, where the AI Flotation training
 * exclusion is asserted and mutation-checked rather than living in a type.
 *
 * A TYPE UNION STILL EXISTS for callers, so TypeScript catches a typo at the
 * call site. The database stays permissive; the code stays strict. That split
 * is deliberate: a bad value should fail a test, not require a migration.
 */

/** §4's eleven offer families (`request.md:264-276`). */
export type OfferFamily =
  | 'learner_free_training'
  | 'learner_paid_training'
  | 'learner_community_subscription'
  | 'learner_certification'
  | 'learner_internship'
  | 'business_training'
  | 'ai_consulting'
  | 'workflow_automation'
  | 'application_build'
  | 'ai_project'
  | 'paid_discovery';

export const OFFER_FAMILIES: readonly OfferFamily[] = [
  'learner_free_training',
  'learner_paid_training',
  'learner_community_subscription',
  'learner_certification',
  'learner_internship',
  'business_training',
  'ai_consulting',
  'workflow_automation',
  'application_build',
  'ai_project',
  'paid_discovery',
];

/**
 * The five families AI Flotation may never be offered (§4:287).
 *
 * Exported so the policy seed and its contract test share one list rather than
 * each carrying a copy that can drift. `business_training` plus every
 * `learner_*` family — six in total with training, which is the count an
 * earlier draft of the plan got wrong by naming only four.
 */
export const LEARNER_OFFER_FAMILIES: readonly OfferFamily[] = OFFER_FAMILIES.filter(
  (f) => f.startsWith('learner_'),
);

export type JourneyPathStatus = 'draft' | 'active' | 'paused' | 'retired';

export interface JourneyPathAttributes {
  id?: string;
  program_id: string;
  offer_family: OfferFamily;
  name: string;
  status?: JourneyPathStatus;
  /**
   * Ordering hint within a program. Lower runs first.
   *
   * NOT a second priority system — the Governor's arbiter owns action priority
   * (AD-6). This orders paths for display and for tie-breaking inside one
   * program, nothing more.
   */
  priority?: number;
  metadata?: Record<string, unknown> | null;
  created_at?: Date;
  updated_at?: Date;
}

export class JourneyPath extends Model<JourneyPathAttributes> implements JourneyPathAttributes {
  declare id: string;
  declare program_id: string;
  declare offer_family: OfferFamily;
  declare name: string;
  declare status: JourneyPathStatus;
  declare priority: number;
  declare metadata: Record<string, unknown> | null;
  declare readonly created_at: Date;
  declare readonly updated_at: Date;
}

JourneyPath.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    program_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'journey_programs', key: 'id' },
    },
    offer_family: { type: DataTypes.STRING(64), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'draft' },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, allowNull: true },
  },
  {
    sequelize,
    tableName: 'journey_paths',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      {
        // One path per offer family per program. Two `ai_consulting` paths in
        // one program is a seeding bug, and the database catches it rather than
        // an application-level "have we added this already?" check that loses
        // to a concurrent seed.
        unique: true,
        name: 'journey_paths_program_family_unique',
        fields: ['program_id', 'offer_family'],
      },
    ],
  },
);

export default JourneyPath;
