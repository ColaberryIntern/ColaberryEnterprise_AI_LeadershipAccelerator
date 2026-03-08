/**
 * Variable Service Tests
 * Tests resolveTemplate, version incrementing logic, and variable retrieval.
 * Uses mocked VariableStore model — no database dependency.
 */

jest.mock('../../models', () => {
  const mockVariables: any[] = [];

  return {
    VariableStore: {
      findOrCreate: jest.fn(async ({ where, defaults }: any) => {
        const existing = mockVariables.find(v =>
          v.enrollment_id === where.enrollment_id &&
          v.variable_key === where.variable_key &&
          v.scope === where.scope
        );
        if (existing) return [existing, false];
        const newVar = {
          ...defaults,
          id: `var-${Date.now()}-${Math.random()}`,
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
          save: jest.fn(async function(this: any) { return this; }),
        };
        mockVariables.push(newVar);
        return [newVar, true];
      }),
      findOne: jest.fn(async ({ where }: any) => {
        return mockVariables.find(v =>
          v.enrollment_id === where.enrollment_id &&
          v.variable_key === where.variable_key
        ) || null;
      }),
      findAll: jest.fn(async ({ where }: any) => {
        return mockVariables.filter(v =>
          v.enrollment_id === where.enrollment_id &&
          (where.variable_key ? v.variable_key === where.variable_key : true) &&
          (where.scope ? v.scope === where.scope : true)
        );
      }),
      destroy: jest.fn(async ({ where }: any) => {
        const idx = mockVariables.findIndex(v =>
          v.enrollment_id === where.enrollment_id &&
          v.variable_key === where.variable_key
        );
        if (idx >= 0) { mockVariables.splice(idx, 1); return 1; }
        return 0;
      }),
      _reset: () => { mockVariables.length = 0; },
      _getAll: () => mockVariables,
    },
    Enrollment: {},
  };
});

import {
  setVariable,
  getVariable,
  getAllVariables,
  resolveTemplate,
  deleteVariable,
  getVariableDependencyGraph,
  getVariableHistory,
} from '../../services/variableService';
import { VariableStore } from '../../models';

describe('variableService', () => {
  beforeEach(() => {
    (VariableStore as any)._reset();
    jest.clearAllMocks();
  });

  describe('setVariable', () => {
    test('should create a new variable', async () => {
      const result = await setVariable('enr-1', 'company_name', 'Acme Corp');
      expect(result.variable_key).toBe('company_name');
      expect(result.variable_value).toBe('Acme Corp');
      expect(result.version).toBe(1);
    });

    test('should increment version on update', async () => {
      await setVariable('enr-1', 'company_name', 'Acme Corp');
      const updated = await setVariable('enr-1', 'company_name', 'New Acme Corp');
      expect(updated.version).toBe(2);
      expect(updated.variable_value).toBe('New Acme Corp');
    });

    test('should not increment version when value unchanged', async () => {
      const original = await setVariable('enr-1', 'company_name', 'Acme Corp');
      const same = await setVariable('enr-1', 'company_name', 'Acme Corp');
      expect(same.version).toBe(1);
      expect(same.save).not.toHaveBeenCalled();
    });

    test('should support different scopes', async () => {
      await setVariable('enr-1', 'key1', 'val1', 'section', { sectionId: 'sec-1' });
      await setVariable('enr-1', 'key2', 'val2', 'session', { sessionId: 'sess-1' });
      await setVariable('enr-1', 'key3', 'val3', 'artifact', { artifactId: 'art-1' });
      const all = (VariableStore as any)._getAll();
      expect(all.length).toBe(3);
    });
  });

  describe('getVariable', () => {
    test('should return variable value', async () => {
      await setVariable('enr-1', 'industry', 'Tech');
      const val = await getVariable('enr-1', 'industry');
      expect(val).toBe('Tech');
    });

    test('should return null for non-existent variable', async () => {
      const val = await getVariable('enr-1', 'nonexistent');
      expect(val).toBeNull();
    });
  });

  describe('getAllVariables', () => {
    test('should return all variables as key-value map', async () => {
      await setVariable('enr-1', 'company_name', 'Acme');
      await setVariable('enr-1', 'industry', 'Tech');
      await setVariable('enr-1', 'role', 'CTO');
      const all = await getAllVariables('enr-1');
      expect(all).toEqual({
        company_name: 'Acme',
        industry: 'Tech',
        role: 'CTO',
      });
    });

    test('should return empty map for no variables', async () => {
      const all = await getAllVariables('enr-nonexistent');
      expect(all).toEqual({});
    });
  });

  describe('resolveTemplate', () => {
    test('should replace placeholders with variable values', async () => {
      await setVariable('enr-1', 'company_name', 'Acme');
      await setVariable('enr-1', 'industry', 'Technology');
      const result = await resolveTemplate(
        'enr-1',
        'Welcome to {{company_name}} in the {{industry}} sector.'
      );
      expect(result).toBe('Welcome to Acme in the Technology sector.');
    });

    test('should leave unreferenced placeholders intact', async () => {
      await setVariable('enr-1', 'company_name', 'Acme');
      const result = await resolveTemplate(
        'enr-1',
        '{{company_name}} has goal {{goal}}'
      );
      expect(result).toBe('Acme has goal {{goal}}');
    });

    test('should handle template with no placeholders', async () => {
      const result = await resolveTemplate('enr-1', 'No variables here.');
      expect(result).toBe('No variables here.');
    });

    test('should handle multiple occurrences of same placeholder', async () => {
      await setVariable('enr-1', 'name', 'Bob');
      const result = await resolveTemplate('enr-1', '{{name}} says hi. Hi {{name}}!');
      expect(result).toBe('Bob says hi. Hi Bob!');
    });
  });

  describe('deleteVariable', () => {
    test('should delete existing variable', async () => {
      await setVariable('enr-1', 'temp', 'value');
      const count = await deleteVariable('enr-1', 'temp');
      expect(count).toBe(1);
    });

    test('should return 0 for non-existent variable', async () => {
      const count = await deleteVariable('enr-1', 'nonexistent');
      expect(count).toBe(0);
    });
  });

  describe('getVariableDependencyGraph', () => {
    test('should return graph with metadata', async () => {
      await setVariable('enr-1', 'company_name', 'Acme');
      await setVariable('enr-1', 'industry', 'Tech');
      const graph = await getVariableDependencyGraph('enr-1');
      expect(graph.length).toBe(2);
      expect(graph[0]).toHaveProperty('key');
      expect(graph[0]).toHaveProperty('value');
      expect(graph[0]).toHaveProperty('scope');
      expect(graph[0]).toHaveProperty('version');
    });
  });

  describe('getVariableHistory', () => {
    test('should return history entries', async () => {
      await setVariable('enr-1', 'company_name', 'Acme');
      const history = await getVariableHistory('enr-1', 'company_name');
      expect(history.length).toBeGreaterThan(0);
      expect(history[0]).toHaveProperty('value');
      expect(history[0]).toHaveProperty('version');
    });
  });
});
