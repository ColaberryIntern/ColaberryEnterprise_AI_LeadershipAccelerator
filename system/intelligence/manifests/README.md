# /system/intelligence/manifests/

This directory holds the **machine-readable** build manifest contract:

- [`build_manifest.schema.json`](./build_manifest.schema.json) — JSON Schema (the formal contract)

The **TypeScript runtime schema** (Zod) lives inside the backend so it can be
imported by ingestion code without escaping `tsconfig.rootDir`:

- [`backend/src/intelligence/systemStateEngine/telemetry/buildManifestSchema.ts`](../../../backend/src/intelligence/systemStateEngine/telemetry/buildManifestSchema.ts)

The two MUST stay in sync. JSON Schema is the source of truth for external
consumers (Claude Code, CI, third parties); the Zod schema is the source of
truth for runtime validation in-process.
