# Decisions Log

This file records design decisions made when the SRS was ambiguous or silent on a topic.

## Phase 0

| # | Decision | Rationale |
|---|----------|-----------|
| D-001 | SRS sections 5–10 were not provided in the uploaded document. Implementation follows the task description's specifications for API contracts, state machine guards, test cases, and calculation rules. | The task description provides sufficient detail for all referenced sections. |
| D-002 | `dotenv` is loaded from `server/.env` by default; the `.env.example` documents all required variables. | Simplest setup for a monorepo-style layout. |
| D-003 | Prisma migration is run first, then `001_constraints.sql` is applied via `prisma.$executeRawUnsafe` in a post-migration script. | Prisma doesn't natively support raw SQL in migrations; running it as a separate step is the simplest approach. |
| D-004 | Subscription number format: `SUB-{year}-{seq:06d}`, Invoice: `INV-{year}-{seq:06d}`. Year uses the current year in Asia/Kolkata. | Matches the examples in SRS 4.1. |
| D-005 | The `--load` seed flag creates ~10k subscriptions and ~1k due for billing. `--synthetic-history` creates ~2000 historical invoices/payments for ML training. Both can be combined. | Per task description Phase 0 requirements. |
| D-006 | `isSynthetic` flag on generated historical data allows all reports and billing queries to exclude synthetic records. | Per SRS 4.0: "every report, dashboard figure and billing query must exclude them". |
| D-007 | Password for seeded users is `Brightloop@123` (hashed). Admin email: `admin@brightloop.dev`. | Simplest dev default; documented in README. |

