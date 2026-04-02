# Website Conversion Flow Agent

## Purpose
Validates that expected conversion flows exist on key pages. Checks that CTAs (calls to action) link to the correct destinations in the enrollment funnel.

## Department
Services | Website

## Status
Live | Trigger: cron

## Input
- Public pages with expected CTA flows (homepage to program/pricing/enroll, program to enroll, etc.)

## Output
- WebsiteIssue records for missing CTA destinations in conversion flows

## How It Works
1. Scans all public pages via the website scanner
2. Extracts CTA destinations from each page (buttons, action-word links)
3. Compares against expected conversion flows for each page
4. Creates issues when expected CTA destinations are missing

## Use Cases
- **Marketing**: Ensure conversion funnels are intact
- **Sales**: Verify enrollment paths work from all entry points
- **Quality**: Catch broken conversion flows before they impact revenue

## Integration Points
- websiteScanner (page scanning)
- WebsiteIssue model (issue creation)
