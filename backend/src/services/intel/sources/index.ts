/**
 * Source-adapter barrel. Importing this module registers all intelligence-pipeline
 * source adapters (each self-registers via registerIntelSource at module load).
 * Import once at boot (server.ts) so listIntelSources() is populated for the
 * scheduler cron and the boot catch-up. Idempotent (registry is last-write-wins).
 */
import './ai_research_digest';
import './ai_architecture_breakdown';
import './build_breakdown';
import './ai_tool_of_the_day';
import './ai_quote_of_the_day';
import './claude_code_technique';
import './mcp_server_spotlight';
import './aiVideoStreamSource';
import './marketIntelligenceSource';
