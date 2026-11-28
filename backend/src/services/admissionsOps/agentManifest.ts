/**
 * The agent control surface's manifest, server side (AO2.2, kit AGENT_CONTROL_SURFACE.md sections 3 and 7).
 *
 * agentActions.json is a byte-for-byte copy of the frontend's screenActions.json (the backend image cannot read the
 * frontend tree); agentManifest.test.ts fails if they drift. From it this module serves the static list of all 16
 * screens and their declared actions (GET .../agent/manifest, so an agent can plan before a screen is open) and builds
 * a Zod schema per action from its declared params, which the intents endpoint (AO2.3) validates against.
 */
import { z } from 'zod';
import catalog from './agentActions.json';

export type ActionLevel = 1 | 2 | 3 | 4 | 5;
export type ActionKind = 'navigate' | 'view' | 'prepare' | 'execute';
export interface ParamSpec { name: string; type: 'string' | 'date'; required: boolean }
export interface ManifestAction { id: string; label: string; level: ActionLevel; kind: ActionKind; available: boolean; params: ParamSpec[] }

/** Each screen's route, mirroring frontend/src/pages/admin/admissionsOps/screens.ts (checked by a test). */
export const SCREEN_PATHS: Readonly<Record<string, string>> = {
  today: '', admissions: 'admissions', students: 'students', student360: 'students/:ref', academics: 'academics',
  payments: 'payments', tfcAudit: 'payments/tfc-audit', support: 'support', communications: 'communications',
  compliance: 'compliance', reports: 'reports', weeklyReport: 'reports/weekly-opportunity', agent: 'agent',
  approvals: 'approvals', knowledge: 'knowledge', setup: 'setup',
};
const BASE = '/admin/admissions-ops';

const ParamSpecSchema = z.object({ name: z.string().regex(/^[a-zA-Z][a-zA-Z0-9]*$/), type: z.enum(['string', 'date']), required: z.boolean() });
const ActionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9]+\.[a-zA-Z0-9]+$/),
  label: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  kind: z.enum(['navigate', 'view', 'prepare', 'execute']),
  available: z.boolean(),
  params: z.array(ParamSpecSchema),
});
const CatalogSchema = z.record(z.string(), z.object({
  description: z.string().min(1),
  actions: z.array(ActionSchema).min(1),
  suggestions: z.array(z.object({ label: z.string().min(1), action: z.string().min(1) })).length(3),
}));

/** Parsed once at load; a malformed catalog fails the process at boot, not at the first agent call. */
const CATALOG = CatalogSchema.parse(catalog);

export interface ScreenManifestDto { id: string; route: string; description: string; actions: ManifestAction[]; suggestions: Array<{ label: string; action: string }> }

export function buildManifest(): ScreenManifestDto[] {
  return Object.entries(SCREEN_PATHS).map(([id, path]) => {
    const entry = CATALOG[id];
    if (!entry) throw new Error(`ContractViolation: no catalog entry for screen ${id}`);
    return { id, route: path ? `${BASE}/${path}` : BASE, description: entry.description, actions: entry.actions as ManifestAction[], suggestions: entry.suggestions };
  });
}

/** Every declared action by id. */
export const ACTIONS: ReadonlyMap<string, ManifestAction> = new Map(
  Object.values(CATALOG).flatMap((e) => e.actions.map((a) => [a.id, a as ManifestAction] as const)),
);

const paramSchema = (p: ParamSpec) => (p.type === 'date' ? z.iso.date() : z.string().trim().min(1).max(500));

/** The Zod schema an action's params must satisfy. Strict: an undeclared param is a 400, never ignored. */
export function paramsSchemaFor(actionId: string): z.ZodType<Record<string, string>> | null {
  const action = ACTIONS.get(actionId);
  if (!action) return null;
  const shape: Record<string, z.ZodType> = {};
  for (const p of action.params) shape[p.name] = p.required ? paramSchema(p) : paramSchema(p).optional();
  return z.object(shape).strict() as unknown as z.ZodType<Record<string, string>>;
}

export const ManifestResponse = z.object({
  screens: z.array(z.object({
    id: z.string(), route: z.string().startsWith(BASE), description: z.string().min(1),
    actions: z.array(ActionSchema).min(1), suggestions: z.array(z.object({ label: z.string(), action: z.string() })),
  })).length(16),
});
