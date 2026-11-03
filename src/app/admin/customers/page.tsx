'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { getAdminCustomersPageAction } from '@/app/actions/customer.actions';
import { Customer } from '@/types';
import { FilterChips } from '@/components/ui/FilterChips';

const PAGE_SIZE_FALLBACK = 25;
const STATUS_FILTERS = ['All', 'Active', 'Inactive', 'Suspended'];
const ROLE_OPTIONS = ['', 'Guest', 'User', 'Admin'];

function statusPillClass(status: Customer['status']) {
  if (status === 'Active') return 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-[#4ADE80]';
  if (status === 'Suspended') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400';
  return 'bg-gray-100 text-gray-500 dark:bg-[#171F1A] dark:text-[#8A9A8E]';
}

function formatJoined(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminCustomersPage() {
  const { user, isRedirecting, isAdmin } = useAdminGuard();

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);

  // Data
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumping this key re-runs the fetch effect — used by Retry.
  const [reloadKey, setReloadKey] = useState(0);

  // Customers fetch
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadCustomers() {
      try {
        const result = await getAdminCustomersPageAction({
          search: appliedSearch || undefined,
          status: status ?? undefined,
          role: role || undefined,
          page,
        });
        if (cancelled) return;
        if (result.success && result.customers) {
          // Clamp: filters can leave us beyond the last page.
          if (
            result.customers.length === 0 &&
            page > 1 &&
            (result.total ?? 0) > 0
          ) {
            setPage(
              Math.max(1, Math.ceil((result.total ?? 0) / (result.pageSize ?? PAGE_SIZE_FALLBACK)))
            );
            return;
          }
          setCustomers(result.customers);
          setTotal(result.total ?? 0);
          setPageSize(result.pageSize ?? PAGE_SIZE_FALLBACK);
          setError(null);
        } else {
          setError(result.error || 'Failed to load customers.');
        }
      } catch {
        if (!cancelled) setError('An unexpected error occurred.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCustomers();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, appliedSearch, status, role, page, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    refresh();
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedSearch(searchInput.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setSearchInput('');
    setAppliedSearch('');
    setStatus(null);
    setRole('');
    setPage(1);
  };

  const hasFilters = appliedSearch !== '' || status !== null || role !== '';

  // ── Guard gates (parity with /admin bookings) ──
  if (isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  const firstLoad = loading && customers === null;
  if (firstLoad) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading customers...</p>
      </div>
    );
  }

  if (error && customers === null && !loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          className="rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const rows = customers ?? [];
  const startIdx = (page - 1) * pageSize;
  const rangeStart = total > 0 ? startIdx + 1 : 0;
  const rangeEnd = startIdx + rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="min-h-[80vh] px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Toolbar */}
        <div className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] p-4 space-y-3">
          <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-2">
            <label htmlFor="customer-search" className="sr-only">
              Search customers
            </label>
            <input
              id="customer-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search name, email or phone"
              className="flex-1 min-w-[220px] rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-sm text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A] placeholder:text-gray-400 dark:placeholder:text-[#8A9A8E] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
            <button
              type="submit"
              className="rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="role-filter" className="sr-only">
              Filter by role
            </label>
            <select
              id="role-filter"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option || 'all'} value={option}>
                  {option || 'All roles'}
                </option>
              ))}
            </select>

            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs font-bold text-[var(--primary-hover)] hover:underline ml-auto"
              >
                Clear filters
              </button>
            )}
          </div>

          <FilterChips
            options={STATUS_FILTERS}
            value={status ?? 'All'}
            onChange={(value) => {
              setStatus(value === 'All' ? null : value);
              setPage(1);
            }}
          />
        </div>

        {/* Inline error banner (data already on screen) */}
        {error && customers !== null && (
          <div
            className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
            role="alert"
          >
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div
          className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden"
          aria-busy={loading}
        >
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-[#344239] flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">All Customers</h1>
            {rows.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-[#8A9A8E]">
                Showing {rangeStart}–{rangeEnd} of {total} customers
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm text-gray-500 dark:text-[#8A9A8E]">
                {hasFilters ? 'No customers match your filters.' : 'No customers yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] uppercase border-b border-gray-100 dark:border-[#344239]">
                    <th className="px-4 sm:px-6 py-3 text-left">Name</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Email</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Phone</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Role</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Status</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Joined</th>
                    <th className="px-4 sm:px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#344239]">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-[#171F1A] transition-colors">
                      <td className="px-4 sm:px-6 py-3 font-medium text-gray-900 dark:text-[#F5F7F5]">{c.fullName}</td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">{c.email}</td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">
                        {c.phoneNumber || <span className="text-gray-400 dark:text-[#8A9A8E]">—</span>}
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <span
                          className={`text-xs font-bold ${
                            c.role === 'Admin' ? 'text-purple-600 dark:text-purple-400' : 'text-gray-700 dark:text-[#A1ADA4]'
                          }`}
                        >
                          {c.role}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${statusPillClass(c.status)}`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">{formatJoined(c.createdAt)}</td>
                      <td className="px-4 sm:px-6 py-3 text-right">
                        <Link
                          href={`/admin/customers/${c.id}`}
                          className="text-xs font-bold text-[var(--primary-hover)] hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {rows.length > 0 && (
            <div className="px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-[#344239] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--background)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 dark:text-[#8A9A8E]">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages || loading}
                className="rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--background)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
