# Knowledge Graph Builder Agent

## Purpose
Builds the Cory knowledge graph from system entities and relationships. Creates nodes and edges representing agents, departments, campaigns, and their interconnections.

## Department
Reporting | Knowledge

## Status
Live | Trigger: cron

## Input
- System entities (agents, departments, campaigns, etc.)

## Output
- Knowledge graph with nodes and relationships

## How It Works
1. Calls buildGraph() to traverse system entities
2. Creates nodes for each entity type
3. Establishes relationship edges between connected entities
4. Returns the graph structure with node and edge counts

## Use Cases
- **Analytics**: Visual system topology for understanding agent relationships
- **Debugging**: Trace dependencies between system components
- **Onboarding**: New team members can explore system architecture

## Integration Points
- coryKnowledgeGraphService (graph construction)
