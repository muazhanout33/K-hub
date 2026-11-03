'use client';

import { useEffect, useState } from 'react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import {
  getAdminBookingsPageAction,
  confirmBookingStatusAction,
  cancelBookingAction,
} from '@/app/actions/booking.actions';
import { getCourtsFromSupabase } from '@/services/court.service';
import { Booking, Court } from '@/types';
import { toast } from 'sonner';
import { FilterChips } from '@/components/ui/FilterChips';
import { BookingDetailsDrawer } from './BookingDetailsDrawer';

const PAGE_SIZE_FALLBACK = 25;
const STATUS_FILTERS = ['All', 'Reserved', 'Confirmed', 'Cancelled', 'Expired'];

function statusPillClass(status: Booking['status']) {
  if (status === 'Confirmed') return 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-[#4ADE80]';
  if (status === 'Cancelled') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400';
  if (status === 'Expired') return 'bg-gray-100 text-gray-500 dark:bg-[#171F1A] dark:text-[#8A9A8E]';
  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-400';
}

export default function AdminBookingsPage() {
  const { user, isRedirecting, isAdmin } = useAdminGuard();

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [courtId, setCourtId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Data
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumping this key re-runs the fetch effect — used by Retry and after actions.
  const [reloadKey, setReloadKey] = useState(0);

  // Dropdown + drawer
  const [courts, setCourts] = useState<Court[]>([]);
  const [selected, setSelected] = useState<Booking | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);

  // Court dropdown data (admin context — RLS via service role session cookies)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    getCourtsFromSupabase()
      .then((data) => {
        if (!cancelled) setCourts(data);
      })
      .catch(() => {
        // Dropdown stays empty; the page still works without the court filter.
      });

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  // Bookings fetch
  useEffect(() => {
    if (!isAdmin) return;
    if (dateRangeInvalid) return; // wait until the range is valid
    let cancelled = false;

    async function loadBookings() {
      try {
        const result = await getAdminBookingsPageAction({
          search: appliedSearch || undefined,
          status,
          courtId: courtId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
        });
        if (cancelled) return;
        if (result.success && result.bookings) {
          // Clamp: filters can leave us beyond the last page.
          if (
            result.bookings.length === 0 &&
            page > 1 &&
            (result.total ?? 0) > 0
          ) {
            setPage(
              Math.max(1, Math.ceil((result.total ?? 0) / (result.pageSize ?? PAGE_SIZE_FALLBACK)))
            );
            return;
          }
          setBookings(result.bookings);
          setTotal(result.total ?? 0);
          setPageSize(result.pageSize ?? PAGE_SIZE_FALLBACK);
          setError(null);
        } else {
          setError(result.error || 'Failed to load bookings.');
        }
      } catch {
        if (!cancelled) setError('An unexpected error occurred.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadBookings();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, appliedSearch, status, courtId, dateFrom, dateTo, page, reloadKey, dateRangeInvalid]);

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
    setCourtId('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const hasFilters =
    appliedSearch !== '' || status !== null || courtId !== '' || dateFrom !== '' || dateTo !== '';

  const handleConfirm = async (booking: Booking) => {
    setActionBusy(true);
    try {
      const result = await confirmBookingStatusAction(booking.id);
      if (result.success) {
        toast.success(`Booking ${booking.bookingNumber} confirmed.`);
        setSelected(null);
        refresh();
      } else {
        toast.error(result.error || 'Failed to confirm booking.');
      }
    } catch {
      toast.error('An unexpected error occurred.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancel = async (booking: Booking) => {
    if (!window.confirm(`Are you sure you want to cancel booking ${booking.bookingNumber}?`)) {
      return;
    }
    setActionBusy(true);
    try {
      const result = await cancelBookingAction(booking.id);
      if (result.success) {
        toast.success(`Booking ${booking.bookingNumber} cancelled.`);
        setSelected(null);
        refresh();
      } else {
        toast.error(
          result.error === 'CANCELLATION_TOO_LATE'
            ? 'This booking is too close to its start time to cancel (2-hour window).'
            : result.error || 'Failed to cancel booking.'
        );
      }
    } catch {
      toast.error('An unexpected error occurred.');
    } finally {
      setActionBusy(false);
    }
  };

  // ── Guard gates (parity with /admin overview) ──
  if (isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  const firstLoad = loading && bookings === null;
  if (firstLoad) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading bookings...</p>
      </div>
    );
  }

  if (error && bookings === null && !loading) {
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

  const rows = bookings ?? [];
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
            <label htmlFor="booking-search" className="sr-only">
              Search bookings
            </label>
            <input
              id="booking-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search booking #, name, email or phone"
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
            <label htmlFor="court-filter" className="sr-only">
              Filter by court
            </label>
            <select
              id="court-filter"
              value={courtId}
              onChange={(e) => {
                setCourtId(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            >
              <option value="">All courts</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                </option>
              ))}
            </select>

            <label htmlFor="date-from" className="sr-only">
              From date
            </label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />
            <span className="text-xs text-gray-400 dark:text-[#8A9A8E]" aria-hidden="true">
              to
            </span>
            <label htmlFor="date-to" className="sr-only">
              To date
            </label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
              className="rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
            />

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

          {dateRangeInvalid && (
            <p className="text-xs text-red-500 dark:text-red-400" role="alert">
              Start date must be on or before end date.
            </p>
          )}
        </div>

        {/* Inline error banner (data already on screen) */}
        {error && bookings !== null && (
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
            <h1 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">All Bookings</h1>
            {rows.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-[#8A9A8E]">
                Showing {rangeStart}–{rangeEnd} of {total} bookings
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm text-gray-500 dark:text-[#8A9A8E]">
                {hasFilters ? 'No bookings match your filters.' : 'No bookings yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] uppercase border-b border-gray-100 dark:border-[#344239]">
                    <th className="px-4 sm:px-6 py-3 text-left">Booking #</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Customer</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Court</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Date</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Time</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Amount</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Status</th>
                    <th className="px-4 sm:px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#344239]">
                  {rows.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-[#171F1A] transition-colors">
                      <td className="px-4 sm:px-6 py-3 font-mono text-xs text-gray-700 dark:text-[#A1ADA4]">
                        {b.bookingNumber}
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">
                        {b.userId == null ? (
                          <span className="text-gray-500 dark:text-[#8A9A8E]">Walk-in</span>
                        ) : (
                          b.userName || 'Guest'
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">{b.courtName}</td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">{b.date}</td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">
                        {b.startTime}–{b.endTime}
                      </td>
                      <td className="px-4 sm:px-6 py-3 font-bold text-gray-900 dark:text-[#F5F7F5]">
                        {b.totalPrice} EGP
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${statusPillClass(b.status)}`}
                        >
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(b)}
                          className="text-xs font-bold text-[var(--primary-hover)] hover:underline"
                        >
                          View
                        </button>
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

      <BookingDetailsDrawer
        booking={selected}
        onClose={() => setSelected(null)}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        busy={actionBusy}
      />
    </div>
  );
}
