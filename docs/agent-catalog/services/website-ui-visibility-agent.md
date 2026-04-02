# Website UI Visibility Agent

## Purpose
Scans all public pages for UI accessibility and visibility issues including images missing alt text, ensuring compliance with accessibility standards.

## Department
Services | Website

## Status
Live | Trigger: cron

## Input
- All public website pages via websiteScanner

## Output
- WebsiteIssue records for images missing alt text (medium severity)
- Issue details with image source and CSS classes

## How It Works
1. Scans all public pages via the website scanner
2. Checks each image for the presence of alt text
3. Creates medium-severity issues for images without alt text
4. Includes the image source and element selector for remediation

## Use Cases
- **Accessibility**: Ensure screen reader compatibility
- **Compliance**: Meet WCAG accessibility standards
- **Quality**: Comprehensive alt text coverage across all pages

## Integration Points
- websiteScanner (page scanning)
- WebsiteIssue model (issue creation)
