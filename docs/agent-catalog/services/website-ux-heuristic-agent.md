# Website UX Heuristic Agent

## Purpose
Applies UX heuristic rules to all public pages including form field count limits, CTA presence checks, and content length validation. Creates issues when pages violate UX best practices.

## Department
Services | Website

## Status
Live | Trigger: cron

## Input
- All public website pages via websiteScanner
- Heuristic thresholds: max 8 form fields, 1 to 5 CTAs, 100 to 3000 words

## Output
- WebsiteIssue records for forms with too many fields
- WebsiteIssue records for pages with too few or too many CTAs
- WebsiteIssue records for pages with too little or too much content

## How It Works
1. Scans all public pages via the website scanner
2. Checks form field counts against the maximum (8 fields)
3. Validates CTA count per page (1 to 5 range)
4. Checks content word count against limits (100 to 3000 words)
5. Creates issues for each violation with severity and suggested fix

## Use Cases
- **UX**: Automated enforcement of UX best practices
- **Conversion**: Reduce form friction and optimize CTA density
- **Quality**: Consistent content length standards across pages

## Integration Points
- websiteScanner (page scanning)
- WebsiteIssue model (issue creation)
