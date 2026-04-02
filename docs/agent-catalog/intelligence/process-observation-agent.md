# Process Observation Agent

## Purpose
Provides observability infrastructure for the intelligence layer by wrapping async operations with timing, status tracking, and system process logging. Includes Express middleware for API request observation and a fire-and-forget system event logger.

## Department
Operations | Observability

## Status
Live | Trigger: event (wraps other operations; middleware triggers on every intelligence API request)

## Input
- Any async function to observe (via `observeProcess` wrapper)
- Intelligence API HTTP requests (via Express middleware)
- System event metadata (via `logSystemEvent`)

## Output
- `SystemProcess` records containing:
  - Process name and source module
  - Event type
  - Execution time in milliseconds
  - Status (completed or failed)
  - Error message (if applicable)
  - Metadata object

## How It Works
1. **observeProcess**: Wraps any async function, measures execution time, records success or failure, and writes a `SystemProcess` record. The wrapped function's return value passes through transparently.
2. **intelligenceMiddleware**: Express middleware that intercepts intelligence API routes, measures request duration, and logs a system process record with the HTTP method, path, and status code.
3. **logSystemEvent**: Fire-and-forget utility that creates a system process record for ad-hoc system events without blocking the caller.

## Use Cases
- **Operations**: Tracks execution time and failure rates for all intelligence operations in a queryable system process table
- **API Monitoring**: Provides per-request performance data for intelligence API endpoints without modifying route handlers
- **Debugging**: Creates a timeline of system events that can be correlated with agent activity logs for root cause analysis

## Integration Points
- Writes to the **SystemProcess** database model
- Used by **Dataset Registration Agent** and other intelligence components as a wrapper
- Middleware integrates with the **Express** application server
- Process records are queryable by **Strategic Intelligence Agent** and **Audit Agent**
