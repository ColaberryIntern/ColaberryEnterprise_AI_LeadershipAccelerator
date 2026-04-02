# Website Auto-Repair Agent

## Purpose
Processes open website issues detected by scanning agents. Applies confidence-gated decisions: auto-executes high-confidence fixes (>= 0.95), requires COO approval for moderate confidence (0.80 to 0.94), and blocks low-confidence fixes for CEO review.

## Department
Services | Website

## Status
Live | Trigger: cron

## Input
- WebsiteIssue records with status = open

## Output
- IntelligenceDecision records with execution tier (auto_execute, require_approval, block)
- Resolved issues for high-confidence fixes
- Proposed fixes awaiting approval for moderate confidence

## How It Works
1. Finds open website issues ordered by severity and confidence
2. Applies confidence tiers: >= 0.95 auto-execute, 0.80 to 0.94 require approval, < 0.80 block
3. Creates IntelligenceDecision records with the appropriate tier
4. Auto-executed fixes are marked as resolved
5. Lower-confidence fixes are queued for human review

## Use Cases
- **Operations**: Automated website maintenance for high-confidence issues
- **Quality**: Confidence-gated decision-making prevents risky auto-fixes
- **Governance**: Full audit trail with decision reasoning

## Integration Points
- WebsiteIssue model (issue source)
- IntelligenceDecision model (decision recording)
