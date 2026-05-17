/**
 * Integration test for the public enrollment routes.
 *
 * REQ-027 verification: `GET /api/courses` returns active program blueprints
 * with their curriculum modules. This is the first test file in the backend
 * codebase — it establishes the convention for future route tests: mock the
 * models module (which the route lazy-imports), mount the router on a fresh
 * Express app via supertest, assert the response contract.
 */
import express from 'express';
import request from 'supertest';

// Mock the models module BEFORE the router is imported. Because the route
// handler uses dynamic `await import('../../models')` rather than a
// top-level import, the mock has to be in place before any request runs,
// not before module load — but jest.mock is hoisted, so this still works.
jest.mock('../../models', () => {
  const fixturePrograms = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Enterprise AI Leadership Accelerator',
      description: 'Test program description',
      goals: ['Test goal'],
      target_persona: 'Test persona',
      learning_philosophy: 'Test philosophy',
      core_competency_domains: ['ai', 'leadership'],
      modules: [
        {
          id: 'm1', module_number: 1, title: 'Module One',
          description: 'First module', skill_area: 'fundamentals', total_lessons: 4,
        },
        {
          id: 'm2', module_number: 2, title: 'Module Two',
          description: 'Second module', skill_area: 'application', total_lessons: 5,
        },
      ],
    },
  ];
  return {
    ProgramBlueprint: {
      findAll: jest.fn().mockResolvedValue(fixturePrograms),
    },
    CurriculumModule: {},
    ContentFeedback: {
      create: jest.fn(),
    },
  };
});

describe('GET /api/courses (REQ-027)', () => {
  const buildApp = async () => {
    const app = express();
    app.use(express.json());
    const routerModule = await import('../enrollmentRoutes');
    app.use(routerModule.default);
    return app;
  };

  test('returns 200 and an array of programs', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/courses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  test('each program carries the documented top-level fields', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/courses');
    const program = res.body[0];
    expect(program).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
    });
    // Optional editorial fields surface when present.
    expect(program).toHaveProperty('goals');
    expect(program).toHaveProperty('target_persona');
    expect(program).toHaveProperty('learning_philosophy');
    expect(program).toHaveProperty('core_competency_domains');
  });

  test('each program embeds its modules with the documented attributes', async () => {
    const app = await buildApp();
    const res = await request(app).get('/api/courses');
    const program = res.body[0];
    expect(Array.isArray(program.modules)).toBe(true);
    expect(program.modules.length).toBeGreaterThan(0);
    const mod = program.modules[0];
    expect(mod).toMatchObject({
      id: expect.any(String),
      module_number: expect.any(Number),
      title: expect.any(String),
      skill_area: expect.any(String),
      total_lessons: expect.any(Number),
    });
  });

  test('only active programs are queried (is_active filter applied)', async () => {
    // Re-import models inside the test so we can assert how the mocked
    // findAll was called.
    const models = await import('../../models');
    const findAllMock = (models.ProgramBlueprint as any).findAll;
    findAllMock.mockClear();
    const app = await buildApp();
    await request(app).get('/api/courses');
    expect(findAllMock).toHaveBeenCalledTimes(1);
    const callArg = findAllMock.mock.calls[0][0];
    expect(callArg.where).toEqual({ is_active: true });
    // Confirms modules are eagerly loaded with the documented attribute list.
    expect(callArg.include[0].as).toBe('modules');
    expect(callArg.include[0].attributes).toEqual(
      expect.arrayContaining(['id', 'module_number', 'title', 'description', 'skill_area', 'total_lessons']),
    );
  });
});
