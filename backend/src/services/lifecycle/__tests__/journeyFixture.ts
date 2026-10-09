import { QueryTypes, type Sequelize } from 'sequelize';

/**
 * Fixture plumbing for the lifecycle journey suite.
 *
 * Extracted when `lifecycleJourneys.integration.test.ts` crossed CLAUDE.md's 500-line ceiling
 * after Journey 4 was rewritten to drive the real execution machine. It follows
 * `evidenceFixture.ts` beside it: a test fixture module, not another test file.
 *
 * `sequelize` is passed IN rather than imported, because the suite imports it lazily — a
 * top-level `new Sequelize(...)` runs in CI, where there is no database.
 *
 * Everything here is FIXTURE PLUMBING, deliberately not behaviour. It seeds and removes rows and
 * counts them. The journeys that assert production behaviour do it by calling production
 * services, and the two that cannot say so in their own bodies.
 */
export interface JourneyFixture {
  /** Seed a lifecycle row for one journey and return its id. */
  seedLifecycle(projectId: string, stage: string): Promise<string>;
  lifecycleRow(projectId: string): Promise<{
    stage: string; condition: string | null; condition_reason: string | null;
  }>;
  countFor(table: string, column: string, projectId: string): Promise<number>;
  /** Remove everything one journey wrote. Called per journey, not only at the end. */
  deleteFixture(projectId: string): Promise<void>;
}

export function journeyFixture(sequelize: Sequelize, tenantId: string): JourneyFixture {
  return {
    async seedLifecycle(projectId, stage) {
      const rows = await sequelize.query<{ id: string }>(
        `INSERT INTO project_lifecycle_states (tenant_id, delivery_project_id, stage)
         VALUES ($1, $2, $3) RETURNING id`,
        { bind: [tenantId, projectId, stage], type: QueryTypes.SELECT },
      );
      return rows[0].id;
    },

    async lifecycleRow(projectId) {
      const rows = await sequelize.query<{
        stage: string; condition: string | null; condition_reason: string | null;
      }>(
        `SELECT stage, condition, condition_reason FROM project_lifecycle_states
          WHERE tenant_id = $1 AND delivery_project_id = $2`,
        { bind: [tenantId, projectId], type: QueryTypes.SELECT },
      );
      return rows[0];
    },

    async countFor(table, column, projectId) {
      // `table` and `column` are interpolated because an identifier cannot be bound. Every call
      // site passes a literal written here in this repository; nothing reaches this from a
      // request. Said plainly because interpolating into SQL is otherwise a defect.
      const rows = await sequelize.query<{ n: string }>(
        `SELECT count(*) AS n FROM ${table} WHERE tenant_id = $1 AND ${column} = $2`,
        { bind: [tenantId, projectId], type: QueryTypes.SELECT },
      );
      return Number(rows[0].n);
    },

    async deleteFixture(projectId) {
      await sequelize.query(
        `DELETE FROM blueprint_approvals WHERE manifest_id IN (
           SELECT id FROM operating_blueprint_manifests
            WHERE tenant_id = $1 AND delivery_project_id = $2)`,
        { bind: [tenantId, projectId] },
      );
      await sequelize.query(
        'DELETE FROM lifecycle_stage_failures WHERE lifecycle_state_id IN ('
        + 'SELECT id FROM project_lifecycle_states WHERE tenant_id = $1 AND delivery_project_id = $2)',
        { bind: [tenantId, projectId] },
      );
      await sequelize.query(
        'DELETE FROM operating_blueprint_manifests WHERE tenant_id = $1 AND delivery_project_id = $2',
        { bind: [tenantId, projectId] },
      );
      await sequelize.query(
        'DELETE FROM project_lifecycle_states WHERE tenant_id = $1 AND delivery_project_id = $2',
        { bind: [tenantId, projectId] },
      );
    },
  };
}
