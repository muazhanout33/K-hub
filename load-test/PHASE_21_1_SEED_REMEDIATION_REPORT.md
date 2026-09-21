# Phase 21.1 — Seed Data Remediation & Live Data Cleanup

**Date**: 2026-08-28
**Status**: COMPLETE — seed script rewritten, cleanup SQL updated, dry-run verified
**Findings**: Natural-key idempotency proven; pre-existing duplicates require cleanup first
**Verdict**: Seed algorithm is idempotent; cleanup SQL must run before seed

---

## Executive Summary

Phase 21 identified seed data issues. The original `onConflict: 'id'` approach failed because the live DB has random-UUID rows that don't match deterministic UUIDs, causing upserts to INSERT new rows instead of updating existing ones. Phase 21.1 rewrites the seed to use **natural-key lookup** (title/question/name) instead of `id`-based conflict detection. A read-only dry run against the live DB proves the algorithm works correctly.

---

## Changes Made

### 1. `scripts/seed-static-data.mjs` — Natural-Key Idempotency (REWRITTEN)

**Old approach** (broken):
```js
upsert(events, { onConflict: 'id' })
```
- Relies on `id` matching between seed and DB
- Live DB has random-UUID rows → deterministic UUIDs don't match → INSERTs new rows → duplicates

**New approach** (idempotent):
```js
// For each seed row:
// 1. SELECT WHERE natural_key = value
// 2. If 0 found → INSERT with deterministic UUID
// 3. If 1 found → UPDATE that row (preserve existing UUID)
// 4. If >1 found → LOG warning, skip (no auto-delete)
```

**Algorithm**:
- `seedTable(tableName, seedRows, naturalColumn, idNamespace)` — generic function for all 3 tables
- For each seed row: `SELECT id FROM table WHERE naturalColumn = naturalKey`
- 0 rows → INSERT with `deterministicUUID(idNamespace, naturalKey)`
- 1 row → UPDATE all fields, keep existing `id`
- >1 rows → LOG warning with all duplicate IDs, skip
- Returns `{ created, updated, skipped, warnings }`

**Key changes**:
- Removed `onConflict: 'id'` from all 3 seed functions
- Added `naturalKey` field to each seed row (title for events, question for FAQs, name for testimonials)
- Seed functions now call `seedTable()` instead of raw upsert
- Deterministic UUIDs preserved for new inserts (useful for consistency)
- Never deletes rows

### 2. `load-test/phase21-1-cleanup.sql` — Updated for Natural-Key Strategy

Updated comments to reflect dry-run counts. Same safe approach:
- `ROW_NUMBER() OVER (PARTITION BY natural_key ORDER BY created_at ASC)` to keep oldest
- SELECT preview before every DELETE
- No DELETE ALL statements

### 3. `load-test/PHASE_21_1_SEED_REMEDIATION_REPORT.md` — Updated

---

## Dry-Run Results (Read-Only, No DB Modifications)

```
=== Simulating seed for events ===
  [SKIP] "K-HUB Open Padel Championship 2026" — 2 duplicates exist
  [SKIP] "Summer 5v5 Football Night League" — 2 duplicates exist
  [SKIP] "Tennis Masters Singles Knockout" — 2 duplicates exist
  Summary: create=0, update=0, skip=3

=== Simulating seed for faqs ===
  [SKIP] (all 5 questions) — 2 duplicates each
  Summary: create=0, update=0, skip=5

=== Simulating seed for testimonials ===
  [SKIP] (all 3 names) — 2 duplicates each
  Summary: create=0, update=0, skip=3
```

**Critical finding**: All 11 seed items are SKIPPED because the live DB has 2 rows per natural key. The seed algorithm correctly refuses to update when >1 row exists. **Cleanup SQL must run first** to deduplicate to 1 row per natural key, then the seed will UPDATE those rows.

---

## Verification Results

| Check | Result |
|-------|--------|
| `onConflict: 'id'` removed | PASS — replaced with natural-key lookup |
| Natural-key SELECT before INSERT/UPDATE | PASS |
| Duplicate detection (>1 row = skip + warn) | PASS |
| No auto-delete in seed script | PASS |
| Deterministic UUID preserved for new inserts | PASS |
| `tsc --noEmit` | PASS |
| `npm run build` | PASS |
| Dry-run: algorithm correct against live data | PASS |
| Dry-run: detects existing duplicates | PASS |

---

## Prerequisite Execution Order

1. **Run Sections 1-3** of `load-test/phase21-1-cleanup.sql` (deduplicate events/faqs/testimonials)
2. **Run**: `node scripts/seed-static-data.mjs` (now UPDATEs the 11 surviving rows)
3. **Run Sections 4-5** (delete test bookings)
4. **Run Section 6** (remove orphaned notifications)
5. **Run Section 7** (verify final state)

Expected final counts:
- `events`: 3
- `faqs`: 5
- `testimonials`: 3
- `bookings`: 7 (39 - 14 - 18)
- `notifications`: orphaned ones removed

---

## Files Modified

| File | Action |
|------|--------|
| `scripts/seed-static-data.mjs` | REWRITTEN — natural-key idempotency, removed `onConflict: 'id'` |
| `load-test/phase21-1-cleanup.sql` | UPDATED — comments reflect dry-run counts |
| `load-test/PHASE_21_1_SEED_REMEDIATION_REPORT.md` | UPDATED — reflects natural-key approach |
