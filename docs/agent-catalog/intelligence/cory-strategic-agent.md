# Cory Strategic Agent

## Purpose
On-demand strategic agent invoked by the CoryEngine (the platform's AI COO) to translate natural language commands into structured, actionable tickets. Handles curriculum planning, bug fixing, strategic plan creation, and general task decomposition with automatic sub-task generation.

## Department
Strategy | AI-Assisted Planning

## Status
Live | Trigger: on-demand (invoked by CoryEngine when a strategic command is issued)

## Input
- Natural language command string from the user or CoryEngine
- Intent classification (`CoryIntent`): plan_curriculum, fix_platform, create_strategic_plan, or general
- Optional context object with entity references and metadata

## Output
- `StrategicAgentResult` containing:
  - List of created tickets (id, ticket number, title)
  - Plan summary (1 to 2 sentences)
  - List of downstream agents to dispatch
  - Confidence score (0 to 100)

## How It Works
1. Receives a command, intent, and optional context from CoryEngine
2. Constructs a prompt with the intent, command, and context
3. Sends the prompt to the LLM (via `chatCompletion`) with a detailed system prompt defining ticket structure rules for each intent type
4. Parses the JSON response containing planned tickets, summary, agent dispatch list, and confidence
5. Falls back to a single default ticket if the LLM call fails
6. Creates each planned ticket in the database via `ticketService`
7. Creates sub-tasks for tickets that have decomposed work items (e.g., curriculum modules, QA checks)
8. Returns the full result with ticket IDs and dispatch recommendations

## Use Cases
- **Education**: "Create a 4-week data analytics curriculum" decomposes into module design, lesson creation, artifact generation, and QA sub-tasks
- **Engineering**: "Fix the broken enrollment form" creates a prioritized bug ticket with reproduction steps
- **Leadership**: "Build a Q3 growth strategy" generates a phased strategic plan with dependent sub-tasks

## Integration Points
- Invoked by **CoryEngine** (strategy layer)
- Creates tickets via **ticketService**
- Can dispatch downstream agents: CurriculumArchitectAgent, ArtifactGenerationAgent, CurriculumQAAgent, PlatformFixAgent, CurriculumOptimizerAgent
- Uses **OpenAI** via `chatCompletion` for command decomposition
