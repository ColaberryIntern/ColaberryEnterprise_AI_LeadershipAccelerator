/**
 * Frontend Route Mapper
 *
 * Uses LLM (temperature=0) to map business processes to frontend routes.
 * Run once during setup, results stored in Capability.frontend_route.
 * User can override via UI dropdown.
 */
import OpenAI from 'openai';
import Capability from '../models/Capability';

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return _openai;
}

export interface RouteMapping {
  capabilityId: string;
  capabilityName: string;
  route: string | null;
  confidence: string;
}

/**
 * Auto-map business processes to frontend routes using LLM.
 * Temperature=0 for deterministic results.
 */
export async function autoMapRoutes(options: {
  projectId: string;
  availableRoutes: string[];
  dryRun?: boolean;
}): Promise<{ mappings: RouteMapping[]; applied: number }> {
  const { projectId, availableRoutes, dryRun = false } = options;

  const caps = await Capability.findAll({
    where: { project_id: projectId },
    attributes: ['id', 'name', 'description', 'frontend_route'],
    order: [['sort_order', 'ASC']],
  });

  if (caps.length === 0 || availableRoutes.length === 0) {
    return { mappings: [], applied: 0 };
  }

  const bpList = caps.map(c => `${c.id.substring(0, 8)}: ${c.name}`).join('\n');
  const routeList = availableRoutes.join('\n');

  const response = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 2000,
    response_format: { type: 'json_object' },
    messages: [{
      role: 'system',
      content: 'You map business processes to frontend page routes. Each business process should map to the MOST RELEVANT frontend page. Respond with valid JSON only. Be precise — only map when there is a clear relationship.',
    }, {
      role: 'user',
      content: `Map each business process to its most relevant frontend page route.

BUSINESS PROCESSES:
${bpList}

AVAILABLE ROUTES:
${routeList}

Rules:
1. Each BP maps to AT MOST one route (or null if no clear match)
2. A route can be used by multiple BPs if relevant
3. Only map when the route clearly serves that business process
4. For admin processes, prefer /admin/* routes
5. For user-facing processes, prefer /portal/* or public routes

Respond:
{"mappings": [{"id": "abc12345", "route": "/admin/campaigns", "confidence": "high|medium|low"}, ...]}`,
    }],
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
  const llmMappings = (parsed.mappings || []) as Array<{ id: string; route: string | null; confidence: string }>;

  const mappings: RouteMapping[] = [];
  let applied = 0;

  for (const cap of caps) {
    const llmMap = llmMappings.find(m => cap.id.startsWith(m.id));
    const route = llmMap?.route || null;
    const confidence = llmMap?.confidence || 'none';

    mappings.push({
      capabilityId: cap.id,
      capabilityName: cap.name,
      route,
      confidence,
    });

    if (!dryRun && route) {
      (cap as any).frontend_route = route;
      await cap.save();
      applied++;
    }
  }

  console.log(`[RouteMapper] Mapped ${applied}/${caps.length} BPs to routes (dryRun=${dryRun})`);
  return { mappings, applied };
}

/**
 * Manually set a frontend route for a specific BP.
 */
export async function setFrontendRoute(capabilityId: string, route: string | null): Promise<void> {
  await Capability.update(
    { frontend_route: route } as any,
    { where: { id: capabilityId } },
  );
}
