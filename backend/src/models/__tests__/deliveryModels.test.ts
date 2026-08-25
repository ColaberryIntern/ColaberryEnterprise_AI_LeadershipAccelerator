/**
 * Model-level contract test for the Refactored AI Delivery OS (Gate 1).
 *
 * Asserts the properties that the DDL test cannot see: that the models are registered
 * with Sequelize (an unregistered model is an invisible one — the schema/model parity
 * test walks `sequelize.models`), that the DDL and the model agree on every column, and
 * that the ESC-1 relaxation is real at the application layer and not just in the
 * database. Sequelize enforces `allowNull` itself, so a model still declaring
 * `allowNull: false` would reject a null owner long before Postgres ever saw it.
 *
 * No database. Model definitions are inspected directly.
 */
import '../index';
import { sequelize } from '../../config/database';
import { REFACTORED_DELIVERY_SCHEMA_STATEMENTS } from '../../db/ensureRefactoredDeliverySchema';

const DELIVERY_MODELS: Record<string, string> = {
  DeliveryEngagement: 'delivery_engagements',
  DeliveryProject: 'delivery_projects',
  DeliveryProjectSourceLink: 'delivery_project_source_links',
  DeliveryProjectMember: 'delivery_project_members',
  DeliveryContract: 'delivery_contracts',
  DeliveryDecision: 'delivery_decisions',
  DeliveryEvent: 'delivery_events',
};

/** Column names declared inside a `CREATE TABLE IF NOT EXISTS <table> (...)` statement. */
function ddlColumnsFor(table: string): string[] {
  const stmt = REFACTORED_DELIVERY_SCHEMA_STATEMENTS.find((s) =>
    new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`).test(s),
  );
  if (!stmt) return [];
  const body = stmt.slice(stmt.indexOf('(') + 1, stmt.lastIndexOf(')'));
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/)[0].replace(/,$/, ''))
    .filter((name) => /^[a-z_]+$/.test(name));
}

describe('delivery models are registered with Sequelize', () => {
  it.each(Object.entries(DELIVERY_MODELS))('%s is registered as %s', (modelName, tableName) => {
    const model = sequelize.models[modelName];
    expect(model).toBeDefined();
    expect(model.tableName).toBe(tableName);
  });
});

describe('DDL and models agree', () => {
  it.each(Object.entries(DELIVERY_MODELS))(
    '%s declares every column the DDL creates for %s',
    (modelName, tableName) => {
      const ddlColumns = ddlColumnsFor(tableName);
      // Guards against a silently-empty parse making this test vacuously pass.
      expect(ddlColumns.length).toBeGreaterThan(3);

      const attributes = Object.values(sequelize.models[modelName].getAttributes()).map(
        (a) => a.field ?? '',
      );
      ddlColumns.forEach((col) => expect(attributes).toContain(col));
    },
  );
});

describe('tenancy by parent, at the model layer', () => {
  it('delivery_engagements and delivery_projects require a tenant_id', () => {
    for (const modelName of ['DeliveryEngagement', 'DeliveryProject']) {
      const attr = sequelize.models[modelName].getAttributes().tenant_id;
      expect(attr).toBeDefined();
      expect(attr.allowNull).toBe(false);
    }
  });

  it('the strict children declare no tenant_id at all — they scope by join', () => {
    for (const modelName of [
      'DeliveryProjectSourceLink',
      'DeliveryProjectMember',
      'DeliveryContract',
      'DeliveryDecision',
    ]) {
      expect(sequelize.models[modelName].getAttributes().tenant_id).toBeUndefined();
    }
  });
});

describe('append-only tables are not editable', () => {
  it('DeliveryEvent has no updated_at — an event is never edited', () => {
    expect(sequelize.models.DeliveryEvent.getAttributes().updated_at).toBeUndefined();
  });

  it('DeliveryProjectSourceLink has no updated_at — a link is created or removed, not edited', () => {
    expect(sequelize.models.DeliveryProjectSourceLink.getAttributes().updated_at).toBeUndefined();
  });
});

describe('ESC-1: Organization can represent a client company', () => {
  /**
   * The whole point of ESC-1. Sequelize enforces allowNull in application code, so a
   * model left at `allowNull: false` would reject a client organization before the
   * relaxed database column was ever reached — the DDL change alone is not enough.
   */
  it('owner_enrollment_id is nullable on the model, not only in the database', () => {
    expect(sequelize.models.Organization.getAttributes().owner_enrollment_id.allowNull).toBe(true);
  });

  it('a client organization with no owner passes model validation', async () => {
    const org = sequelize.models.Organization.build({
      name: 'Acme Corp',
      owner_enrollment_id: null,
      organization_type: 'client_company',
    } as any);

    // validate() resolves with the instance and rejects on failure.
    await expect(org.validate()).resolves.toBeTruthy();
  });

  /**
   * The negative control. Without this, the two tests above could pass simply because
   * `validate()` never rejects anything on this model, and they would prove nothing
   * about owner_enrollment_id having actually been relaxed.
   */
  it('validation is real: a still-required field is still enforced', async () => {
    const org = sequelize.models.Organization.build({
      name: null,
      owner_enrollment_id: null,
    } as any);

    await expect(org.validate()).rejects.toThrow();
  });

  /**
   * The correction to Gate 0's C-02. PostgreSQL treats NULLs as distinct in a unique
   * index, so keeping this constraint never blocked null-owner client organizations —
   * and it is what makes `registerManager()`'s findOrCreate race-safe. Losing it would
   * let two simultaneous registrations for one manager each create an organization.
   */
  it('keeps the unique constraint that makes registerManager race-safe', () => {
    expect(sequelize.models.Organization.getAttributes().owner_enrollment_id.unique).toBeTruthy();
  });

  it('a management account still declares its owner', async () => {
    const org = sequelize.models.Organization.build({
      name: "A Manager's Account",
      owner_enrollment_id: '00000000-0000-4000-8000-000000000001',
      organization_type: 'management_account',
    } as any);

    await expect(org.validate()).resolves.toBeTruthy();
  });
});

describe('the student Project bridge does not touch Project', () => {
  it('Project gains no delivery column', () => {
    const attributes = Object.keys(sequelize.models.Project.getAttributes());
    expect(attributes.filter((a) => /delivery/i.test(a))).toEqual([]);
  });

  it('Project still requires enrollment_id and program_id — unchanged by this gate', () => {
    const attrs = sequelize.models.Project.getAttributes();
    expect(attrs.enrollment_id.allowNull).toBe(false);
    expect(attrs.program_id.allowNull).toBe(false);
  });

  it('the link lives on its own table and points at both sides', () => {
    const attrs = sequelize.models.DeliveryProjectSourceLink.getAttributes();
    expect(attrs.delivery_project_id.allowNull).toBe(false);
    expect(attrs.student_project_id.allowNull).toBe(false);
  });
});

describe('contract defaults fail safe', () => {
  it('data_sensitivity defaults to internal, never public', () => {
    // A contract nobody has classified must not become publishable by omission.
    expect(sequelize.models.DeliveryContract.getAttributes().data_sensitivity.defaultValue).toBe(
      'internal',
    );
  });

  it('a new delivery project starts in discovery, not building', () => {
    expect(sequelize.models.DeliveryProject.getAttributes().status.defaultValue).toBe('discovery');
  });

  it('a new project defaults to the lowest-consequence class', () => {
    expect(sequelize.models.DeliveryProject.getAttributes().project_class.defaultValue).toBe(
      'sandbox',
    );
  });
});
