# Code Security Audit Agent

## Purpose
Scans TypeScript source files for common vulnerability patterns including SQL injection, XSS, command injection, code injection (eval), and path traversal risks.

## Department
Security | Code Review

## Status
Live | Trigger: cron

## Input
- TypeScript source files across backend and frontend

## Output
- Vulnerability findings with file, line number, category, and severity
- Tickets for critical and high-severity vulnerabilities

## How It Works
1. Walks all TypeScript files excluding node_modules, dist, and build directories
2. Scans each file against vulnerability patterns: SQL string interpolation, innerHTML assignment, exec() calls, eval() usage, path traversal risks, and more
3. Classifies findings by category and severity
4. Creates tickets for findings requiring remediation

## Use Cases
- **Security**: Automated static analysis for common vulnerability classes
- **Development**: Catch security issues before code review
- **Compliance**: Regular security scanning for audit requirements

## Integration Points
- File system (source code scanning)
- Ticket service (vulnerability reporting)
- Department events (security scan results)
