# OpenClaw Supervisor Agent

## Purpose
Manages the OpenClaw task queue by assigning pending tasks, detecting and recovering stuck tasks, enforcing platform rate budgets, and canceling expired work.

## Department
OpenClaw | Operations

## Status
Live | Trigger: cron

## Input
- OpenclawTask records in various states (pending, running, assigned)
- OpenclawSession records for health status
- Circuit breaker and rate limiter state

## Output
- Stuck tasks retried or canceled
- Pending tasks assigned to available workers
- Rate-limited tasks deferred
- Task queue health summary

## How It Works
1. Detects stuck tasks (running longer than threshold, default 10 minutes)
2. Retries stuck tasks up to max retries; cancels those that exceed limits
3. Checks circuit breaker status per platform before assigning new tasks
4. Checks rate limits per platform before assigning posting tasks
5. Assigns pending tasks to available workers up to concurrency limit
6. Produces a task queue health summary

## Use Cases
- **Operations**: Automated task lifecycle management
- **Reliability**: Self-healing recovery from stuck or failed tasks
- **Compliance**: Platform rate limit enforcement prevents over-posting

## Integration Points
- OpenclawTask (task management)
- OpenclawSession (worker health)
- Circuit breaker service (platform health)
- Rate limiter service (posting frequency)
