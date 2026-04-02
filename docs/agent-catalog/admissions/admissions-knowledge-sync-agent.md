# Admissions Knowledge Sync Agent

## Purpose
Reads frontend page source files, extracts factual content via AI, and auto-updates Maya's knowledge base so it stays in sync with the website. Detects new, changed, and stale knowledge entries.

## Department
Admissions | Knowledge

## Status
Live | Trigger: cron (daily at 3 AM CT)

## Input
- Frontend page source files (TSX) from 10 mapped routes
- Existing AdmissionsKnowledgeEntry records

## Output
- New knowledge entries created from page content
- Updated entries where content has changed
- Stale entries flagged when no longer found on any page

## How It Works
1. Reads TSX source files for all mapped pages (HomePage, ProgramPage, PricingPage, etc.)
2. Extracts visible text content by stripping JSX/HTML tags
3. Sends extracted text to GPT for structured knowledge extraction (title, content, keywords, category, priority)
4. Deduplicates extracted entries by title
5. Compares against existing knowledge entries using exact and fuzzy title matching
6. Creates new entries, updates changed entries, and flags stale entries not found on any page

## Use Cases
- **Admissions**: Maya's knowledge base automatically stays current with website changes
- **Content Management**: Detect when page updates create knowledge inconsistencies
- **Quality**: Identify stale knowledge entries that may confuse visitors

## Integration Points
- Frontend page source files (content extraction)
- OpenAI GPT (AI-powered knowledge extraction)
- AdmissionsKnowledgeEntry model (knowledge store)
