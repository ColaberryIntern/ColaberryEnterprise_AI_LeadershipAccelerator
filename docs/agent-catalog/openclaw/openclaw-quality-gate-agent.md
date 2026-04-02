# OpenClaw Quality Gate Agent

## Purpose
AI-powered review agent that evaluates draft responses for quality using deterministic rules. Approves high-quality responses for browser posting and rejects low-quality responses for regeneration. Replaces manual human review while maintaining quality standards.

## Department
OpenClaw | Quality

## Status
Live | Trigger: on-demand (called by Content Response Agent)

## Input
- Response content string
- Platform name

## Output
- Quality result with approved/rejected status, score (0 to 100), and rejection reasons

## How It Works
1. Checks content length against minimum (120 chars) and maximum (2000 chars) limits
2. Scans for prohibited promotional language (buy now, limited time, act fast, etc.)
3. Verifies content provides genuine value (not just a plug)
4. Counts links and enforces maximum link count (2)
5. Checks for em dash usage (prohibited)
6. Validates against platform-specific strategy rules
7. Returns a composite score with detailed reasons for any rejections

## Use Cases
- **Quality Control**: Deterministic quality baseline for all generated content
- **Compliance**: Prevent promotional or spammy content from being posted
- **Automation**: Replace manual review for platforms with API posting

## Integration Points
- Content Response Agent (inline quality evaluation)
- Platform strategy layer (strategy validation)
