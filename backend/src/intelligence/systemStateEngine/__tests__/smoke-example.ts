/**
 * Smoke example — produces a real engine output that the validation
 * report can paste verbatim. Not a test; a runnable script.
 *
 * Run: npx ts-node backend/src/intelligence/systemStateEngine/__tests__/smoke-example.ts
 */
import { buildAuthoritativeStateFromInputs } from '../systemStateEngine';

const result = buildAuthoritativeStateFromInputs({
  project: {
    id: 'sample-proj',
    target_mode: 'production',
    setup_status: { activated: true, brownfield: true },
    capabilities: [],
    repo_file_tree: ['package.json', 'Dockerfile', 'src/index.ts', 'src/services/leadService.ts', 'src/routes/leadRoutes.ts', 'src/models/Lead.ts', 'src/pages/LeadsPage.tsx'],
    latest_commit_sha: 'abc1234',
  },
  capabilities: [
    {
      id: 'cap-lead', project_id: 'sample-proj', name: 'Lead Pipeline',
      description: 'Captures, scores, routes leads.',
      source: 'brownfield_discovered',
      user_status: 'in_progress', applicability_status: 'active',
      frontend_route: '/leads', is_page_bp: false, mode_override: null,
      last_execution: { status: 'foundation_built', evidence_completion_pct: 75, progress_md_mentions: 12 },
      linked_backend_services: ['src/services/leadService.ts', 'src/routes/leadRoutes.ts', 'src/models/Lead.ts'],
      linked_frontend_components: ['src/pages/LeadsPage.tsx'],
      linked_agents: [],
      ui_element_map: null,
      total_requirements: 0, matched_requirements: 0, verified_requirements: 0,
    },
    {
      id: 'cap-orphan', project_id: 'sample-proj', name: 'Mystery BP',
      description: '',
      source: 'parsed',
      user_status: 'in_progress', applicability_status: 'active',
      frontend_route: null, is_page_bp: false, mode_override: null,
      last_execution: null,
      linked_backend_services: [], linked_frontend_components: [], linked_agents: [],
      ui_element_map: null,
      total_requirements: 0, matched_requirements: 0, verified_requirements: 0,
    },
  ],
  lastSyncAt: new Date(),
  latestCommitSha: 'abc1234',
});

console.log(JSON.stringify({
  scores: result.scores,
  contradiction_count: result.contradictions.length,
  contradictions: result.contradictions.slice(0, 5),
  queue_length: result.queue.length,
  queue_top_3: result.queue.slice(0, 3).map(t => ({
    id: t.id, title: t.title, type: t.type, state: t.state,
    rank: t.calculated_rank, reasoning: t.reasoning,
  })),
  next_task_id: result.next_task?.id,
  sync_health: result.sync_health,
  graph_summary: {
    node_count: result.graph.nodes.length,
    edge_count: result.graph.edges.length,
    node_types: [...new Set(result.graph.nodes.map(n => n.type))],
  },
}, null, 2));
