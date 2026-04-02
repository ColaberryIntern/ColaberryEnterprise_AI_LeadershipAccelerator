# Secret Detection Agent

## Purpose
Scans source files for accidentally committed secrets including AWS keys, private keys, connection strings, JWT tokens, API keys, OpenAI keys, and Supabase keys.

## Department
Security | Secrets

## Status
Live | Trigger: cron

## Input
- Source files (.ts, .tsx, .js, .jsx, .json, .env files) across the codebase

## Output
- Secret findings with file path, pattern name, and severity
- Tickets for critical and high-severity secret detections

## How It Works
1. Walks the source tree scanning files with relevant extensions
2. Excludes node_modules, dist, build, test files, and package-lock.json
3. Matches content against secret patterns: AWS keys, private keys, connection strings, JWT tokens, generic API keys, OpenAI keys, Supabase keys
4. Creates tickets for findings with severity and file details

## Use Cases
- **Security**: Prevent secret leakage in source code
- **Compliance**: Continuous secret scanning for audit requirements
- **Development**: Catch accidentally committed credentials before push

## Integration Points
- File system (source scanning)
- Ticket service (incident creation)
- Department events (security alerts)
