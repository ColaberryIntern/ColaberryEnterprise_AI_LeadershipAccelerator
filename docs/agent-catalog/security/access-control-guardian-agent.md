# Access Control Guardian Agent

## Purpose
Scans route files across the codebase to detect API endpoints missing authentication or authorization middleware. Identifies routes that should require admin access but lack guards.

## Department
Security | Access Control

## Status
Live | Trigger: cron

## Input
- TypeScript route files across the codebase

## Output
- Route findings with severity levels (critical, high, medium)
- Tickets created for detected access control issues

## How It Works
1. Walks all TypeScript files in the route directories
2. Matches Express router patterns (get, post, put, patch, delete)
3. Checks each route for authentication guards (requireAuth, requireAdmin, etc.)
4. Flags routes missing appropriate access control
5. Creates tickets for findings requiring remediation

## Use Cases
- **Security**: Prevent unauthorized API access
- **Compliance**: Ensure all sensitive endpoints have proper authentication
- **Development**: Catch missing auth middleware before deployment

## Integration Points
- File system (route file scanning)
- Ticket service (issue creation)
- Department events (security alerts)
