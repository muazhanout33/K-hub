'use client';

import { useEffect, useState } from 'react';
import { Send, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import {
  getAdminNotificationsPageAction,
  deleteAdminNotificationAction,
  AdminNotificationRow,
} from '@/app/actions/admin-notification.actions';
import { FilterChips } from '@/components/ui/FilterChips';
import { NotificationComposeDrawer } from './NotificationComposeDrawer';

const PAGE_SIZE_FALLBACK = 25;

const TYPE_FILTERS = [
  'All',
  'Booking Confirmed',
  'Booking Cancelled',
  'Payment Successful',
  'Promo Offer',
  'Info',
] as const;

/** Display label → DB type value for the filter chips above. */
const TYPE_FILTER_VALUES: Record<(typeof TYPE_FILTERS)[number], string | null> = {
  All: null,
  'Booking Confirmed': 'booking_confirmed',
  'Booking Cancelled': 'booking_cancelled',
  'Payment Successful': 'payment_successful',
  'Promo Offer': 'promo_offer',
  Info: 'info',
};

const TYPE_PILL_CLASSES: Record<string, string> = {
  booking_confirmed: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-[#4ADE80]',
  booking_cancelled: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400',
  payment_successful: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-[#4ADE80]',
  promo_offer: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
  info: 'bg-gray-100 text-gray-600 dark:bg-[#171F1A] dark:text-[#8A9A8E]',
};

function formatSentAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminNotificationsPage() {
  const { user, isRedirecting, isAdmin } = useAdminGuard();

  // Filters
  const [typeLabel, setTypeLabel] = useState<string>('All');
  const [page, setPage] = useState(1);

  // Data
  const [notifications, setNotifications] = useState<AdminNotificationRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_FALLBACK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumping this key re-runs the fetch effect — used by Retry and post-send refresh.
  const [reloadKey, setReloadKey] = useState(0);

  // Compose drawer + two-step delete state.
  const [composeOpen, setComposeOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadNotifications() {
      try {
        const result = await getAdminNotificationsPageAction({
          type: TYPE_FILTER_VALUES[typeLabel as (typeof TYPE_FILTERS)[number]] ?? undefined,
          page,
        });
        if (cancelled) return;
        if (result.success && result.notifications) {
          // Clamp: filters can leave us beyond the last page.
          if (
            result.notifications.length === 0 &&
            page > 1 &&
            (result.total ?? 0) > 0
          ) {
            setPage(
              Math.max(1, Math.ceil((result.total ?? 0) / (result.pageSize ?? PAGE_SIZE_FALLBACK)))
            );
            return;
          }
          setNotifications(result.notifications);
          setTotal(result.total ?? 0);
          setPageSize(result.pageSize ?? PAGE_SIZE_FALLBACK);
          setError(null);
        } else {
          setError(result.error || 'Failed to load notifications.');
        }
      } catch {
        if (!cancelled) setError('An unexpected error occurred.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadNotifications();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, typeLabel, page, reloadKey]);

  const refresh = () => setReloadKey((key) => key + 1);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    refresh();
  };

  const handleDelete = async (notification: AdminNotificationRow) => {
    if (deletingId) return;

    // Two-step confirm (same pattern as the Courts archive action).
    if (deleteConfirmId !== notification.id) {
      setDeleteConfirmId(notification.id);
      setDeleteError(null);
      return;
    }

    setDeletingId(notification.id);
    setDeleteError(null);
    try {
      const result = await deleteAdminNotificationAction(notification.id);
      if (result.success) {
        toast.success('Notification deleted.');
        setDeleteConfirmId(null);
        refresh();
      } else {
        const message = result.error || 'Failed to delete the notification. Please try again.';
        setDeleteError(message);
        toast.error(message);
      }
    } catch {
      const message = 'Failed to delete the notification. Please try again.';
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
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

  const firstLoad = loading && notifications === null;
  if (firstLoad) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading notifications...</p>
      </div>
    );
  }

  if (error && notifications === null && !loading) {
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

  const rows = notifications ?? [];
  const startIdx = (page - 1) * pageSize;
  const rangeStart = total > 0 ? startIdx + 1 : 0;
  const rangeEnd = startIdx + rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasFilter = typeLabel !== 'All';

  return (
    <div className="min-h-[80vh] px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Toolbar */}
        <div className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FilterChips
              options={[...TYPE_FILTERS]}
              value={typeLabel}
              onChange={(value) => {
                setTypeLabel(value);
                setPage(1);
              }}
            />
            <button
              type="button"
              onClick={() => setComposeOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" /> Send notification
            </button>
          </div>
        </div>

        {/* Inline error banner (data already on screen) */}
        {error && notifications !== null && (
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

        {deleteError && (
          <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3" role="alert">
            <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
          </div>
        )}

        {/* Table */}
        <div
          className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden"
          aria-busy={loading}
        >
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-[#344239] flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">All Notifications</h1>
            {rows.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-[#8A9A8E]">
                Showing {rangeStart}–{rangeEnd} of {total} notifications
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm text-gray-500 dark:text-[#8A9A8E]">
                {hasFilter ? 'No notifications match this filter.' : 'No notifications yet.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] uppercase border-b border-gray-100 dark:border-[#344239]">
                    <th className="px-4 sm:px-6 py-3 text-left">Recipient</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Type</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Title</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Message</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Sent</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Read</th>
                    <th className="px-4 sm:px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#344239]">
                  {rows.map((n) => (
                    <tr key={n.id} className="hover:bg-gray-50 dark:hover:bg-[#171F1A] transition-colors">
                      <td className="px-4 sm:px-6 py-3">
                        <span className="block font-medium text-gray-900 dark:text-[#F5F7F5]">
                          {n.recipient?.fullName || <span className="text-gray-400 dark:text-[#8A9A8E]">—</span>}
                        </span>
                        <span className="block text-xs text-gray-500 dark:text-[#8A9A8E]">
                          {n.recipient?.email || ''}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                            TYPE_PILL_CLASSES[n.type] ?? 'bg-gray-100 text-gray-600 dark:bg-[#171F1A] dark:text-[#8A9A8E]'
                          }`}
                        >
                          {n.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 font-medium text-gray-900 dark:text-[#F5F7F5]">{n.title}</td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4] max-w-[280px]">
                        <span className="line-clamp-2">{n.message}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4] whitespace-nowrap">
                        {formatSentAt(n.createdAt)}
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                            n.isRead ? 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-[#4ADE80]' : 'bg-gray-100 text-gray-500 dark:bg-[#171F1A] dark:text-[#8A9A8E]'
                          }`}
                        >
                          {n.isRead ? 'Read' : 'Unread'}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => void handleDelete(n)}
                          disabled={deletingId === n.id}
                          aria-label={
                            deleteConfirmId === n.id
                              ? `Confirm delete notification ${n.title}`
                              : `Delete notification ${n.title}`
                          }
                          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-bold border border-[var(--border)] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {deleteConfirmId === n.id ? 'Confirm' : 'Delete'}
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

      {composeOpen && (
        <NotificationComposeDrawer
          onClose={() => setComposeOpen(false)}
          onSent={refresh}
        />
      )}
    </div>
  );
}
