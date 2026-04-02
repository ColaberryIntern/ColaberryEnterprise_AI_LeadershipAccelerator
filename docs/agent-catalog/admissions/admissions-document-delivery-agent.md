# Admissions Document Delivery Agent

## Purpose
Sends documents (executive briefings, program overviews, enterprise guides, pricing guides) to visitors while enforcing workflow stage rules. Validates delivery eligibility, resolves recipient email from lead data, and logs all deliveries.

## Department
Admissions | Communications

## Status
Live | Trigger: on-demand

## Input
- visitor_id - the target visitor
- document_type - one of: executive_briefing, program_overview, enterprise_guide, pricing_guide
- delivery_method - defaults to email

## Output
- Document delivery record in DocumentDeliveryLog
- AdmissionsActionLog entry for audit
- Denial action if workflow rules prevent delivery

## How It Works
1. Validates document_type against the supported list
2. Checks workflow rules via canDeliverDocument() to verify the visitor is eligible
3. Resolves the recipient email from AdmissionsMemory and the linked Lead record
4. Creates a DocumentDeliveryLog entry with status sent
5. Logs the action to AdmissionsActionLog

## Use Cases
- **Admissions**: Visitor requests program materials during chat
- **Sales**: Send targeted documents to qualified prospects
- **Marketing**: Automated document delivery as part of nurture workflows

## Integration Points
- admissionsWorkflowService.canDeliverDocument() (eligibility check)
- AdmissionsMemory and Lead model (recipient resolution)
- DocumentDeliveryLog (delivery tracking)
- AdmissionsActionLog (audit trail)
