# Dataset Registration Agent

## Purpose
Runs the full database discovery pipeline to catalog all tables, relationships, and hub entities in the system. Automatically registers datasets, records discovery results as system processes, and includes a self-healing retry mechanism for transient failures.

## Department
Operations | Data Discovery

## Status
Live | Trigger: on-demand (invoked at startup or when no datasets are registered)

## Input
- Database schema metadata (discovered automatically via the `dictionaryBuilder`)
- Existing dataset registry state

## Output
- `DiscoveryResult` containing:
  - Number of tables discovered
  - Number of relationships found
  - Hub entity identification
  - Discovery duration in milliseconds
- System process record logged to the `SystemProcess` table

## How It Works
1. Checks if a discovery run is already in progress (prevents concurrent execution)
2. Invokes `runFullDiscovery()` from the dictionary builder to scan the database schema
3. Records the successful discovery as a system process with metadata (tables found, relationships, hub entity)
4. On failure, records the error as a failed system process
5. Automatically retries once after 30 seconds if the initial run fails (self-healing)
6. Provides a status check function to retrieve the most recent discovery result
7. Includes an `ensureDatasetsCovered()` utility that triggers discovery if no datasets exist in the registry

## Use Cases
- **Platform Setup**: Automatically discovers and catalogs all database entities when the platform initializes
- **Data Governance**: Maintains an up-to-date registry of all tables and their relationships for the intelligence layer
- **Self-Healing**: Recovers from transient database or network failures without manual intervention

## Integration Points
- Invokes the **Dictionary Builder** (`runFullDiscovery`) for schema analysis
- Writes results to the **DatasetRegistry** model
- Logs process status to **SystemProcess** table
- Discovered datasets are consumed by the **Intelligence Assistant** for query planning
