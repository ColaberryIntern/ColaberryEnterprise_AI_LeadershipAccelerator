import { linkStudentProject } from '../projectSourceLink';

/**
 * Scenario E's writer, which did not exist.
 *
 * The assertions that matter are the ones proving the student `Project` row is not
 * touched. Master plan §24 lists *"student Project behavior regresses"* as a stop
 * condition, and a link service that quietly stamped a column on the student row would
 * satisfy every other requirement of the feature while breaking that one.
 */

const DELIVERY = 'delivery-project-1';
const STUDENT = 'student-project-1';

function makeModels(opts: { delivery?: any; student?: any; existingLink?: any } = {}) {
  const created: any[] = [];
  // Any write to the student project is a test failure, so the fixture makes one throw
  // rather than trusting a later reader to notice it did not happen.
  const forbidden = (name: string) => () => {
    throw new Error(`projectSourceLink must never call Project.${name}`);
  };
  const studentRow = {
    id: STUDENT,
    update: forbidden('update'),
    save: forbidden('save'),
    destroy: forbidden('destroy'),
    ...(opts.student ?? {}),
  };
  return {
    created,
    studentRow,
    DeliveryProject: {
      findOne: async () => (opts.delivery === undefined ? { id: DELIVERY } : opts.delivery),
    },
    Project: {
      findOne: async () => (opts.student === null ? null : studentRow),
      update: forbidden('update'),
      destroy: forbidden('destroy'),
    },
    DeliveryProjectSourceLink: {
      findOne: async () => opts.existingLink ?? null,
      create: async (row: any) => {
        created.push(row);
        return { id: 'link-1', ...row };
      },
    },
  };
}

describe('linkStudentProject', () => {
  it('writes a link and NOTHING to the student project', async () => {
    // The property scenario E exists to prove. The fixture throws on any write, so this
    // fails loudly rather than silently passing if the service grows one later.
    const models = makeModels();
    const out = await linkStudentProject({
      deliveryProjectId: DELIVERY,
      studentProjectId: STUDENT,
      reason: 'Capstone became the basis for the client pilot.',
      models,
    });
    expect(out.ok).toBe(true);
    expect(models.created).toHaveLength(1);
    expect(models.created[0].student_project_id).toBe(STUDENT);
  });

  it('REFUSES a link with no reason', async () => {
    // "Why is a student's coursework inside a client engagement" has real consequences,
    // and the moment of linking is the only time anybody knows the answer.
    const models = makeModels();
    const out = await linkStudentProject({
      deliveryProjectId: DELIVERY, studentProjectId: STUDENT, reason: '  ', models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('reason_required');
    expect(models.created).toHaveLength(0);
  });

  it('REFUSES a dangling student project rather than writing the link', async () => {
    // A link to something that does not exist only surfaces later, inside whatever tries
    // to follow it.
    const models = makeModels({ student: null });
    const out = await linkStudentProject({
      deliveryProjectId: DELIVERY, studentProjectId: STUDENT, reason: 'x', models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_such_student_project');
    expect(models.created).toHaveLength(0);
  });

  it('REFUSES a missing delivery project', async () => {
    const models = makeModels({ delivery: null });
    const out = await linkStudentProject({
      deliveryProjectId: DELIVERY, studentProjectId: STUDENT, reason: 'x', models,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('no_such_delivery_project');
    expect(models.created).toHaveLength(0);
  });

  it('is idempotent — linking the same pair twice creates one row', async () => {
    // An operator clicking twice is the normal case. Two links would make "where did this
    // project come from" ambiguous.
    const models = makeModels({ existingLink: { id: 'link-existing' } });
    const out = await linkStudentProject({
      deliveryProjectId: DELIVERY, studentProjectId: STUDENT, reason: 'x', models,
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.created).toBe(false);
      expect(out.linkId).toBe('link-existing');
    }
    expect(models.created).toHaveLength(0);
  });

  it('reads the student project with a narrow attribute list', async () => {
    // Loading the whole row invites somebody to use it. The service only needs to know
    // that it exists.
    const models = makeModels();
    let seen: any = null;
    models.Project.findOne = async (q: any) => {
      seen = q;
      return models.studentRow;
    };
    await linkStudentProject({
      deliveryProjectId: DELIVERY, studentProjectId: STUDENT, reason: 'x', models,
    });
    expect(seen.attributes).toEqual(['id']);
  });
});
