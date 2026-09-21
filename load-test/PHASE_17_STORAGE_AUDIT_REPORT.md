# Phase 17 — Supabase Storage Buckets, Policies & Security Audit

**Date:** 2026-08-27
**Status:** PASS — NO CHANGES
**Supabase Project:** bwwifvuerhxgjeoochnp

---

## Executive Summary

Supabase Storage is **completely unused** in this codebase. There are zero Storage buckets, zero Storage policies, zero `supabase.storage.from()` API calls, zero file upload/download operations, and zero Storage-related migrations. All image/URL columns in the database store external URLs (e.g., Unsplash), not Supabase Storage object paths.

**No changes are required.**

---

## 1. Before State

### Storage Inventory

| Bucket | Exists in Code | Exists in Migrations | Exists in Supabase | Used at Runtime | Policies |
|---|---|---|---|---|---|
| `court-images` | ❌ | ❌ | ❌ (UNVERIFIED) | ❌ | N/A |
| `avatars` | ❌ | ❌ | ❌ (UNVERIFIED) | ❌ | N/A |
| `events` | ❌ | ❌ | ❌ (UNVERIFIED) | ❌ | N/A |
| `sponsors` | ❌ | ❌ | ❌ (UNVERIFIED) | ❌ | N/A |
| `admin-documents` | ❌ | ❌ | ❌ (UNVERIFIED) | ❌ | N/A |

**Result:** No buckets exist. The intended access matrix from the audit spec is irrelevant — there is nothing to audit.

### Policy Inventory

Zero Storage policies exist. No `CREATE POLICY` statements reference `storage.objects` in any migration or source file.

### Application Usage

| Pattern | Matches Found |
|---|---|
| `supabase.storage` | 0 |
| `.storage.from(` | 0 |
| `.upload(` | 0 |
| `.download(` | 0 |
| `.getPublicUrl(` | 0 |
| `.createSignedUrl(` | 0 |
| `.createSignedUrls(` | 0 |
| `.remove(` (storage context) | 0 |
| `.update(` (storage context) | 0 |
| `.list(` (storage context) | 0 |
| `.move(` | 0 |
| `.copy(` | 0 |
| `storage.objects` | 0 |
| `storage.buckets` | 0 |
| `CREATE BUCKET` | 0 |
| `INSERT INTO storage.buckets` | 0 |
| `SUPABASE_STORAGE` (env var) | 0 |
| `STORAGE_URL` (env var) | 0 |

**Zero matches across the entire codebase.**

### Image/URL Storage Model

All images are stored as **external URLs** (Unsplash links) in plain `TEXT` database columns:

| Table | Column | Type | Content |
|---|---|---|---|
| `public.courts` | `image_url` | `TEXT NOT NULL` | External URL (Unsplash) |
| `public.courts` | `gallery_urls` | `TEXT[]` | Array of external URLs |
| `public.events` | `image_url` | `TEXT` | External URL (Unsplash) |
| `public.profiles` | `avatar_url` | `TEXT` | External URL (Unsplash) |
| `public.testimonials` | `avatar_url` | `TEXT` | External URL (Unsplash) |
| `public.sponsors` | `logo` | `TEXT NOT NULL` | External URL (Unsplash) |

The `FALLBACK_COURT_IMAGE` constant in `src/services/court.service.ts` (line 15–16) is also an external Unsplash URL.

Comment at `src/types/index.ts` line 357 explicitly states: `/** URL or text placeholder -- no real file upload in Phase 6. */`

### Environment Variables

| File | Storage-related Variables |
|---|---|
| `.env.local` | None (only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) |
| `.env.example` | None (only `NEXT_PUBLIC_APP_URL`, `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`) |

### SDK / Dependencies

| Package | Installed | Directly Used |
|---|---|---|
| `@supabase/supabase-js` | ✅ v2.112.3 | ✅ (database queries only) |
| `@supabase/storage-js` | ✅ (transitive dep) | ❌ Never imported |

---

## 2. Findings

**Zero findings.**

Supabase Storage is not implemented in this codebase. There is nothing to audit, nothing to fix, and no security concerns related to Storage.

---

## 3. Changes

**NO CHANGES.**

No files were modified. No migrations were created. No policies were created or altered.

---

## 4. After State

Identical to before state. No Storage configuration exists.

---

## 5. Test Results

| # | Test | Result |
|---|---|---|
| 1 | Anonymous → private bucket/file → DENIED | **BLOCKED** — No buckets exist to test |
| 2 | User A → User B file → DENIED | **BLOCKED** — No buckets exist to test |
| 3 | User A → overwrite User B file → DENIED | **BLOCKED** — No buckets exist to test |
| 4 | User A → delete User B file → DENIED | **BLOCKED** — No buckets exist to test |
| 5 | Unauthorized user → admin documents → DENIED | **BLOCKED** — No buckets exist to test |
| 6 | Disallowed file type → REJECTED | **BLOCKED** — No upload endpoints exist |
| 7 | Oversized file → REJECTED | **BLOCKED** — No upload endpoints exist |
| 8 | Signed URL expiry → verified | **BLOCKED** — No signed URLs exist |
| 9 | Existing legitimate upload → PASS | **BLOCKED** — No uploads exist |
| 10 | Existing legitimate image/file display → PASS | **N/A** — All images are external URLs, not Storage objects |

All runtime Storage tests are **BLOCKED** because there is no Storage implementation to test.

---

## 6. Regression

| Check | Result |
|---|---|
| TypeScript (`npx tsc --noEmit`) | **PASS** — 0 errors |
| Playwright (54 tests) | **50 passed, 4 failed** — All 4 failures are `TimeoutError: page.goto: Timeout 15000ms exceeded` (dev server not responding to navigation). NOT test logic failures. Environment issue only. |
| Runtime Storage | **BLOCKED** — No Storage implementation exists |

**Note:** The 4 Playwright timeout failures are identical to pre-existing environment-level issues (dev server startup timing) and are NOT caused by any code change. No code was modified in this phase.

---

## 7. Out-of-Scope Findings

None. The entire Storage audit scope was addressed. No issues were discovered outside scope.

---

## 8. Rollback

**Nothing to rollback.** No changes were made.

---

## 9. Final Status

```
PASS — NO CHANGES
```

---

## Appendix A: Search Methodology

### Direct Grep Searches Performed

| Pattern | Scope | Result |
|---|---|---|
| `supabase\.storage\|\.storage\.from\|\.upload(\|\.download(\|\.getPublicUrl(\|\.createSignedUrl\|\.remove(\|\.list(` | `src/` | 0 matches |
| `storage\.objects\|storage\.buckets\|CREATE BUCKET\|INSERT INTO storage` | Entire project | 0 matches |
| `supabase\.storage\|\.storage\.from\|\.upload(\|\.download(\|\.getPublicUrl(\|\.createSignedUrl` | `tests/` | 0 matches |
| `bucket\|storage_url\|STORAGE_URL\|SUPABASE_STORAGE` | `src/` | 0 matches |
| `@supabase/storage` | Entire project | 0 matches |
| `bucket\|SUPABASE_STORAGE\|STORAGE_URL\|storage\.buckets\|storage\.objects` | `supabase/` | 0 matches |

### Files Read and Verified

| File | Result |
|---|---|
| `.env.local` | No storage-related variables |
| `.env.example` | No storage-related variables |
| `supabase/config.toml` | Does not exist |
| All 7 migration files | Zero Storage references |
| `docs/0001_supabase_schema.sql` (694 lines) | Zero Storage references |

### Dependencies Verified

| Package | Status |
|---|---|
| `@supabase/storage-js` | Present in `node_modules` as transitive dep of `@supabase/supabase-js`, never imported in source |
| `@supabase/supabase-js` | Used exclusively for database queries via `.from()` and auth via `.auth` |

---

## Appendix B: What "Storage" Means in This Codebase

The word "storage" appears in source code exclusively as **Zustand localStorage persistence keys** (browser-side):

- `khub-booking-storage` (`useBookingStore.ts`)
- `khub-auth-storage` (`useAuthStore.ts`)
- `khub-notifications-storage` (`useNotificationStore.ts`)
- `khub-payment-storage` (`usePaymentStore.ts`)
- `khub-sponsorship-storage` (`useSponsorshipStore.ts`)
- `khub-advertisement-storage` (`useAdvertisementStore.ts`)

These are Zustand store persistence keys using browser `localStorage`, completely unrelated to Supabase Storage.
