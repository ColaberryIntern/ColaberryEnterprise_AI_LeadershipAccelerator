# Admissions Knowledge Agent

## Purpose
Performs RAG (Retrieval-Augmented Generation) retrieval from the AdmissionsKnowledgeEntry store. Finds the most relevant knowledge entries for a given query and page context to provide Maya with accurate program information.

## Department
Admissions | Knowledge

## Status
Live | Trigger: on-demand (called during message processing)

## Input
- query - the visitor question or topic to search for
- page_category - the current page context for relevance boosting

## Output
- Up to 5 relevant knowledge entries with categories and titles

## How It Works
1. Receives a query string and optional page_category
2. Calls findRelevantKnowledge() to search AdmissionsKnowledgeEntry records
3. Returns matched entries with their categories and titles
4. Results are used by Maya to ground responses in verified program facts

## Use Cases
- **Admissions**: Maya answers visitor questions with accurate, up-to-date program facts
- **Quality**: Ensures consistent information delivery across all conversations
- **Content**: Knowledge gaps identified by low match rates inform content updates

## Integration Points
- admissionsKnowledgeService.findRelevantKnowledge() (search logic)
- AdmissionsKnowledgeEntry model (knowledge store)
- Maya chat system (knowledge consumer)
