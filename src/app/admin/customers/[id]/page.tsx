'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import {
  getAdminCustomerDetailAction,
  getAdminCustomerBookingsPageAction,
  updateCustomerStatusAction,
} from '@/app/actions/customer.actions';
import { Booking, CustomerDetails } from '@/types';
import { toast } from 'sonner';
import { ChevronLeft } from 'lucide-react';

const HISTORY_PAGE_SIZE_FALLBACK = 25;
const STATUS_OPTIONS = ['Active', 'Inactive', 'Suspended'] as const;

function statusPillClass(status: CustomerDetails['status']) {
  if (status === 'Active') return 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-[#4ADE80]';
  if (status === 'Suspended') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400';
  return 'bg-gray-100 text-gray-500 dark:bg-[#171F1A] dark:text-[#8A9A8E]';
}

function formatJoined(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const customerId = resolvedParams.id;
  const { user, isRedirecting, isAdmin } = useAdminGuard();

  // Customer data
  const [customer, setCustomer] = useState<CustomerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Sensitive fields reveal
  const [showSensitive, setShowSensitive] = useState(false);

  // Status management
  const [selectedStatus, setSelectedStatus] = useState<CustomerDetails['status'] | ''>('');
  const [statusBusy, setStatusBusy] = useState(false);

  // Booking history
  const [history, setHistory] = useState<Booking[] | null>(null);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPageSize, setHistoryPageSize] = useState(HISTORY_PAGE_SIZE_FALLBACK);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // Bumped by Retry so the effect refetches even when already on page 1
  // (setHistoryPage(1) alone is a no-op when the page state is unchanged).
  const [historyReloadKey, setHistoryReloadKey] = useState(0);

  // Customer fetch
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadCustomer() {
      try {
        const result = await getAdminCustomerDetailAction(customerId);
        if (cancelled) return;
        if (result.success && result.customer) {
          setCustomer(result.customer);
          setSelectedStatus(result.customer.status);
          setError(null);
        } else {
          setError(result.error || 'Failed to load customer details.');
        }
      } catch {
        if (!cancelled) setError('An unexpected error occurred.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCustomer();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, customerId, reloadKey]);

  // Booking history fetch (read-only, paginated)
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadHistory() {
      setHistoryLoading(true);
      try {
        const result = await getAdminCustomerBookingsPageAction(customerId, { page: historyPage });
        if (cancelled) return;
        if (result.success && result.bookings) {
          // Clamp: history can shrink below the current page.
          if (
            result.bookings.length === 0 &&
            historyPage > 1 &&
            (result.total ?? 0) > 0
          ) {
            setHistoryPage(
              Math.max(1, Math.ceil((result.total ?? 0) / (result.pageSize ?? HISTORY_PAGE_SIZE_FALLBACK)))
            );
            return;
          }
          setHistory(result.bookings);
          setHistoryTotal(result.total ?? 0);
          setHistoryPageSize(result.pageSize ?? HISTORY_PAGE_SIZE_FALLBACK);
          setHistoryError(null);
        } else {
          setHistoryError(result.error || 'Failed to load customer bookings.');
        }
      } catch {
        if (!cancelled) setHistoryError('An unexpected error occurred.');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, customerId, historyPage, historyReloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    refresh();
  };

  const handleHistoryRetry = () => {
    setHistoryError(null);
    setHistoryPage(1);
    setHistoryReloadKey((key) => key + 1);
  };

  const handleStatusSave = async () => {
    if (!customer || customer.role === 'Admin') return;
    if (!selectedStatus || selectedStatus === customer.status) return;

    setStatusBusy(true);
    try {
      const result = await updateCustomerStatusAction(customer.id, selectedStatus);
      if (result.success && result.customer) {
        setCustomer(result.customer);
        setSelectedStatus(result.customer.status);
        toast.success(`Status updated to ${result.customer.status}.`);
      } else {
        toast.error(result.error || 'Failed to update customer status.');
      }
    } catch {
      toast.error('An unexpected error occurred.');
    } finally {
      setStatusBusy(false);
    }
  };

  // ── Guard gates (parity with /admin bookings) ──
  if (isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  if (loading && customer === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading customer...</p>
      </div>
    );
  }

  if (error && customer === null && !loading) {
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

  if (!customer) return null;

  const historyRows = history ?? [];
  const historyStartIdx = (historyPage - 1) * historyPageSize;
  const historyRangeStart = historyTotal > 0 ? historyStartIdx + 1 : 0;
  const historyRangeEnd = historyStartIdx + historyRows.length;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / historyPageSize));
  const isAdminTarget = customer.role === 'Admin';
  const statusDirty = selectedStatus !== '' && selectedStatus !== customer.status;

  return (
    <div className="min-h-[80vh] px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Back nav */}
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-600 dark:text-[#A1ADA4] hover:text-[var(--primary-hover)] transition-colors"
        >
          <ChevronLeft className="w-[16px] h-[16px]" aria-hidden="true" />
          <span>Back to Customers</span>
        </Link>

        {/* Header card */}
        <div className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h1 className="text-lg font-bold text-gray-900 dark:text-[#F5F7F5]">{customer.fullName}</h1>
              <p className="text-sm text-gray-600 dark:text-[#A1ADA4]">{customer.email}</p>
              <p className="text-xs text-gray-400 dark:text-[#8A9A8E]">
                Joined {formatJoined(customer.createdAt)}
                {customer.updatedAt !== customer.createdAt &&
                  ` · Updated ${formatJoined(customer.updatedAt)}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${statusPillClass(customer.status)}`}
              >
                {customer.status}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700 dark:bg-[#26332A] dark:text-[#A1ADA4]">
                {customer.role}
              </span>
            </div>
          </div>

          {/* Status management */}
          <div className="border-t border-gray-100 dark:border-[#344239] pt-4 space-y-2">
            <h2 className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] uppercase">Status</h2>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="customer-status" className="sr-only">
                Customer status
              </label>
              <select
                id="customer-status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as typeof selectedStatus)}
                disabled={isAdminTarget}
                className="rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleStatusSave}
                disabled={isAdminTarget || !statusDirty || statusBusy}
                className="rounded-[var(--radius-md)] px-4 py-2 text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {statusBusy ? 'Saving...' : 'Save'}
              </button>
            </div>
            {isAdminTarget && (
              <p className="text-xs text-gray-400 dark:text-[#8A9A8E]">
                Admin accounts cannot be modified from here.
              </p>
            )}
          </div>
        </div>

        {/* Details card */}
        <div className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] uppercase">Details</h2>
            <button
              type="button"
              onClick={() => setShowSensitive((visible) => !visible)}
              aria-pressed={showSensitive}
              className="text-xs font-bold text-[var(--primary-hover)] hover:underline"
            >
              {showSensitive ? 'Hide Details' : 'Show Details'}
            </button>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <dt className="text-xs text-gray-400 dark:text-[#8A9A8E]">Phone</dt>
              <dd className="text-sm text-gray-800 dark:text-[#F5F7F5]">
                {customer.phoneNumber || <span className="text-gray-400 dark:text-[#8A9A8E]">—</span>}
              </dd>
            </div>
            {showSensitive ? (
              <>
                <div>
                  <dt className="text-xs text-gray-400 dark:text-[#8A9A8E]">Date of Birth</dt>
                  <dd className="text-sm text-gray-800 dark:text-[#F5F7F5]">{formatDate(customer.dateOfBirth)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 dark:text-[#8A9A8E]">Gender</dt>
                  <dd className="text-sm text-gray-800 dark:text-[#F5F7F5]">
                    {customer.gender || <span className="text-gray-400 dark:text-[#8A9A8E]">—</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 dark:text-[#8A9A8E]">Address</dt>
                  <dd className="text-sm text-gray-800 dark:text-[#F5F7F5]">
                    {customer.address || <span className="text-gray-400 dark:text-[#8A9A8E]">—</span>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-400 dark:text-[#8A9A8E]">Emergency Contact</dt>
                  <dd className="text-sm text-gray-800 dark:text-[#F5F7F5]">
                    {customer.emergencyContact || <span className="text-gray-400 dark:text-[#8A9A8E]">—</span>}
                  </dd>
                </div>
              </>
            ) : (
              <p className="text-xs text-gray-400 dark:text-[#8A9A8E] sm:col-span-2">
                Sensitive profile details are hidden. Use Show Details to reveal them.
              </p>
            )}
          </dl>
        </div>

        {/* Booking history card */}
        <div
          className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden"
          aria-busy={historyLoading}
        >
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-[#344239] flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">Booking History</h2>
            {history !== null && historyRows.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-[#8A9A8E]">
                Showing {historyRangeStart}–{historyRangeEnd} of {historyTotal} bookings
              </span>
            )}
          </div>

          {historyError && history !== null && (
            <div
              className="mx-4 sm:mx-6 mt-3 rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
              role="alert"
            >
              <p className="text-sm text-red-600 dark:text-red-400">{historyError}</p>
              <button
                type="button"
                onClick={handleHistoryRetry}
                className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {historyError && history === null && !historyLoading ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm text-red-500 dark:text-red-400" role="alert">
                {historyError}
              </p>
              <button
                type="button"
                onClick={handleHistoryRetry}
                className="rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
              >
                Retry
              </button>
            </div>
          ) : history !== null && historyRows.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm text-gray-500 dark:text-[#8A9A8E]">No bookings for this customer.</p>
              <p className="text-xs text-gray-400 dark:text-[#8A9A8E]">
                Only bookings made with this customer&apos;s account are shown.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] uppercase border-b border-gray-100 dark:border-[#344239]">
                    <th className="px-4 sm:px-6 py-3 text-left">Booking #</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Court</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Date</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Time</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Amount</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#344239]">
                  {historyRows.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-[#171F1A] transition-colors">
                      <td className="px-4 sm:px-6 py-3 font-mono text-xs text-gray-700 dark:text-[#A1ADA4]">
                        {b.bookingNumber}
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
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700 dark:bg-[#171F1A] dark:text-[#A1ADA4]">
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {historyRows.length > 0 && (
            <div className="px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-[#344239] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                disabled={historyPage <= 1 || historyLoading}
                className="rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold text-[var(--text-muted)] border border-[var(--border)] hover:bg-[var(--background)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500 dark:text-[#8A9A8E]">
                Page {historyPage} of {historyTotalPages}
              </span>
              <button
                type="button"
                onClick={() => setHistoryPage((p) => p + 1)}
                disabled={historyPage >= historyTotalPages || historyLoading}
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
