# FOMS database consolidation status

## Current connection

Both `ApplicationDbContext` and `FomsDbContext` currently connect to `FOMS_DB`.
This was confirmed by running the API and querying its database health endpoint.
The connection is working; the models are not aligned. The application model
expects the modern schema while the legacy model expects integer-key tables and
columns that are absent or incompatible in `FOMS_DB`.

## Crosswalk artifact

[`database-consolidation-crosswalk.csv`](./database-consolidation-crosswalk.csv)
contains all 279 modeled fields across the 29 `FomsDbContext` entities. The
field list was compared with live SQL metadata in both `FOMS_Official` and
`FOMS_DB`. It records source/destination types, key flags, likely relationship
targets, candidate mappings, and unresolved decisions.

This is a complete **inventory and proposed crosswalk**, not an approved final
mapping. Current classifications:

| Classification | Fields | Meaning |
|---|---:|---|
| Key crosswalk required | 29 | Source integer identifiers cannot be reused as modern string keys. |
| Foreign-key crosswalk required | 48 | Parent identities or relationships must be resolved first. |
| Direct candidate - validate semantics | 72 | SQL types are compatible, but business meaning and uniqueness still need review. |
| Transform/review required | 10 | The representations differ or destination strings are narrower and need explicit conversion rules. |
| No destination column | 120 | Additive schema, another destination, or explicit exclusion decision is required. |

The legacy database has only a small number of enforced foreign keys; several
relationships exist by naming/model convention and must be checked for orphaned
or invalid references before backfill.

## Read-only dry-run results

Run the repeatable read-only checks with:

```powershell
sqlcmd -S "localhost\SQLEXPRESS" -E -C -d master -i "database\mssql\database-consolidation-dry-run.sql"
```

The script performs no writes and does not output credentials or personal
record values. Latest measured counts:

| Area | FOMS_Official | FOMS_DB |
|---|---:|---:|
| Legacy `Clients` | 1 | 7 |
| Legacy `Users` / modern `Employees` | 4 | 5 |
| Legacy `Roles` / modern `Roles` | 4 | 0 |
| Legacy `Invoices` | 0 | 8 |
| Legacy `Payments` | 0 | 2 |
| Legacy `AuditLogs` | 3 | 41 |
| Modern `AppAuditLogs` | Not in legacy model | 9 |
| Legacy `Liquidations` | 4 | No destination table |
| Legacy `Settlements` | 4 | No destination table |
| Legacy `Waybills` | 1 | No destination table |
| Legacy `ClientFinanceSettings` | 1 | No destination table |

Of the 29 legacy table names, 8 also exist in the destination `dbo` schema and
21 do not. Shared names are not necessarily compatible schemas. For example,
the modern `Clients`, `Invoices`, and `Payments` use string identifiers and
different field layouts from the legacy integer-key versions.

Identity checks found:

- All 4 legacy usernames have a modern `Employees` username match.
- The password hashes differ for all 4 matched accounts. **Do not migrate or
  overwrite credentials** as part of this data consolidation.
- One matched employee has a different role label; resolve this through an
  explicit role mapping, not a numeric role ID assumption.
- The single legacy client has no match by DMS ID, client code, or normalized
  business name. Per the user's direction, keep it staged for manual review;
  do not create a new modern client automatically.
- The one legacy waybill references a client ID that is absent from the legacy
  `Clients` table. This orphan must be resolved before that shipment can be
  backfilled.

## Migration approach recommended for review

Do not point the legacy context at the modern tables as-is and do not merge
same-named tables. The least disruptive additive bridge is a dedicated
`legacy` schema in `FOMS_DB` containing the legacy table shapes, with
`FomsDbContext` moved to that schema only after the schema migration and a
verified backfill are ready. This avoids collisions such as `legacy.Clients`
versus `dbo.Clients` and preserves old IDs while the page consumers are
migrated workflow by workflow.

That bridge is a staging/compatibility phase, not the final unified data model.
The modern `dbo` records still require approved mappings and reconciliation
before the application can treat them as one logical set. Missing modern
workflows such as settlements, liquidations, waybills, proof of delivery,
cash advances, and client-specific rate settings need their own reviewed
destination design. The `AIReviewHistory` table also has overlapping fields
with narrower modern string lengths and four source fields that do not exist
in its destination.

No migration has been generated or applied, and no source or destination data
has been modified. A destination migration/backfill must wait until the
crosswalk's identity rules, status translations, audit-event mapping, and the
`legacy` compatibility-schema approach are approved. After that, use a
transactional, idempotent importer with a dry-run report, source/destination
checkpoints, preserved source IDs, and explicit reconciliation gates before
switching any page consumer.

## Work completed in this step

- Exported and compared live source and destination column metadata.
- Produced the complete 279-field inventory and proposed relationship
  crosswalk.
- Added and ran a repeatable read-only SQL dry-run script.
- Confirmed that no migration or data backfill is safe to apply yet because
  the crosswalk contains unresolved key/relationship mappings and 125 fields
  without a current destination column.
