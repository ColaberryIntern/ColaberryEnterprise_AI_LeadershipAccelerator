# Dependency Security Agent

## Purpose
Runs npm audit on all package.json directories to detect known vulnerabilities in project dependencies. Reports findings by severity and creates tickets for critical and high-severity issues.

## Department
Security | Dependencies

## Status
Live | Trigger: cron

## Input
- package.json files in backend and frontend directories

## Output
- Audit results with vulnerability counts by severity (critical, high, moderate, low)
- Advisory details with module names and URLs
- Tickets for critical and high-severity vulnerabilities

## How It Works
1. Locates directories containing package.json files
2. Runs npm audit --json in each directory
3. Parses results to extract vulnerability counts and advisory details
4. Creates tickets for critical and high-severity findings

## Use Cases
- **Security**: Continuous dependency vulnerability monitoring
- **DevOps**: Automated security scanning in the CI pipeline
- **Compliance**: Dependency security audit trail

## Integration Points
- npm audit (vulnerability detection)
- Ticket service (issue creation)
- Department events (scan results)
