# Detroit Voter Education

Personalized voter information platform for Detroit residents. R0 Walking Skeleton.

**Stack:** React + Vite · Node.js / Express · WebSocket (`ws`) · PostgreSQL (AES-256-GCM encrypted preferences)

## What this does

A resident enters their Detroit ZIP code and selects civic issues (Healthcare, Education, etc.). Preferences are saved to PostgreSQL with field-level encryption and broadcast back via WebSocket. Every save is written to an audit log.

**Fulfills:** REQ-001 · REQ-002 · REQ-003  
**BC project:** https://app.basecamp.com/3945211/buckets/47346103

## Quick start

See [SETUP.md](./SETUP.md).
