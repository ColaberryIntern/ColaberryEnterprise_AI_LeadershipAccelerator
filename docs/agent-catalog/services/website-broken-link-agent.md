# Website Broken Link Agent

## Purpose
Scans all public pages for broken links and pages that fail to load. Verifies both internal link validity and page render status.

## Department
Services | Website

## Status
Live | Trigger: cron

## Input
- All public website pages via websiteScanner

## Output
- WebsiteIssue records for broken pages (critical severity)
- WebsiteIssue records for broken internal links (high severity)

## How It Works
1. Scans all public pages via the website scanner
2. Detects pages that fail to load and creates critical-severity issues
3. Validates all internal links against known internal paths
4. Creates issues for links pointing to non-existent pages

## Use Cases
- **Quality**: Continuous broken link monitoring
- **SEO**: Prevent broken links from harming search rankings
- **UX**: Ensure all navigation paths work correctly

## Integration Points
- websiteScanner (page scanning)
- WebsiteIssue model (issue creation)
