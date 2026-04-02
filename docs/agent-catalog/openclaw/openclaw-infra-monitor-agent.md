# OpenClaw Infrastructure Monitor Agent

## Purpose
Monitors browser session health across all platforms, detects problems (captcha blocks, rate limits, crashes), and performs self-healing by restarting crashed sessions and closing unhealthy ones.

## Department
OpenClaw | Infrastructure

## Status
Live | Trigger: cron

## Input
- OpenclawSession records with health scores and error logs

## Output
- Captcha-blocked sessions with paused tasks
- Rate-limited session alerts
- Auto-restarted crashed sessions
- Closed unhealthy sessions (health below threshold)
- Infrastructure health summary

## How It Works
1. Scans all browser sessions for status and health
2. For captcha-blocked sessions: pauses all associated tasks
3. For rate-limited sessions: flags for monitoring
4. For crashed sessions: auto-restarts with reduced health score
5. For low-health sessions (below threshold): closes and marks for recreation
6. Marks stale active sessions (no activity in 2 hours) as idle
7. Produces infrastructure health summary

## Use Cases
- **Operations**: Automated browser session health management
- **Reliability**: Self-healing prevents extended outages
- **Monitoring**: Real-time infrastructure health dashboard

## Integration Points
- OpenclawSession (session management)
- OpenclawTask (task pausing)
