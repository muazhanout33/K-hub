'use client';

import { useEffect, useState } from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { getAdminCourtsAction } from '@/app/actions/court.actions';
import {
  createBlockedPeriodAction,
  deleteBlockedPeriodAction,
  getBlockedPeriodsAction,
} from '@/app/actions/blocked-period.actions';
import { BlockedPeriod, Court } from '@/types';
import { useBlockedPeriodStore } from '@/features/booking/useBlockedPeriodStore';

const GENERIC_BOOKING_CONFLICT_MESSAGE =
  'This time overlaps existing bookings. Please choose a different time.';

const MIRROR_WARNING =
  'Saved to the database, but the local device copy (used by the availability view in this browser) could not be updated. Press Re-sync below; if it keeps failing, reload this page and try again.';

interface MirrorFields {
  courtId: string;
  date: string;
  startTime: string;
  endTime: string;
}

type PendingMirrorAction =
  | { type: 'add'; period: MirrorFields & { reason: string } }
  | { type: 'remove'; keys: MirrorFields };

/**
 * Mirrors a successful server operation into the same admin-browser
 * localStorage store the legacy Overview manager writes — otherwise the two
 * admin surfaces drift apart and the public availability view on this
 * browser stops matching the database. Never throws.
 */
function addMirroredPeriod(period: MirrorFields & { reason: string }): boolean {
  try {
    const store = useBlockedPeriodStore.getState();
    const exists = store.blockedPeriods.some(
      (bp) =>
        bp.courtId === period.courtId &&
        bp.date === period.date &&
        bp.startTime === period.startTime
    );
    if (!exists) {
      store.addBlockedPeriod(period);
    }
    return true;
  } catch {
    return false;
  }
}

function removeMirroredPeriod(keys: MirrorFields): boolean {
  try {
    const store = useBlockedPeriodStore.getState();
    const matches = store.blockedPeriods.filter(
      (bp) =>
        bp.courtId === keys.courtId &&
        bp.date === keys.date &&
        bp.startTime === keys.startTime &&
        bp.endTime === keys.endTime
    );
    for (const bp of matches) {
      store.removeBlockedPeriod(bp.id);
    }
    return true;
  } catch {
    return false;
  }
}

export default function AdminBlockedPeriodsPage() {
  const { user, isRedirecting, isAdmin } = useAdminGuard();

  const [blockedPeriods, setBlockedPeriods] = useState<BlockedPeriod[] | null>(null);
  const [courts, setCourts] = useState<Court[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [courtsError, setCourtsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [courtId, setCourtId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('12:00');
  const [reason, setReason] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [mirrorWarning, setMirrorWarning] = useState<string | null>(null);
  const [pendingMirror, setPendingMirror] = useState<PendingMirrorAction | null>(null);

  const refresh = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function load() {
      try {
        const [periodsResult, courtsResult] = await Promise.all([
          getBlockedPeriodsAction(),
          getAdminCourtsAction(),
        ]);
        if (cancelled) return;

        if (periodsResult.success && periodsResult.blockedPeriods) {
          setBlockedPeriods(periodsResult.blockedPeriods);
          setListError(null);
        } else {
          setListError(periodsResult.error || 'Failed to load blocked periods.');
        }

        if (courtsResult.success && courtsResult.courts) {
          const loadedCourts = courtsResult.courts;
          setCourts(loadedCourts);
          setCourtsError(null);
          setCourtId((prev) => prev || loadedCourts[0]?.id || '');
        } else {
          setCourtsError(courtsResult.error || 'Failed to load courts.');
        }
      } catch {
        if (!cancelled) setListError('An unexpected error occurred.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadKey]);

  const handleRetry = () => {
    setListError(null);
    setCourtsError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  const handleResyncLocalCopy = () => {
    if (!pendingMirror) return;
    const ok =
      pendingMirror.type === 'add'
        ? addMirroredPeriod(pendingMirror.period)
        : removeMirroredPeriod(pendingMirror.keys);
    if (ok) {
      setPendingMirror(null);
      setMirrorWarning(null);
      toast.success('Local copy re-synced.');
    } else {
      toast.warning(MIRROR_WARNING);
    }
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    if (!date) {
      setCreateError('Date is required.');
      return;
    }
    if (!startTime || !endTime) {
      setCreateError('Start and end times are required.');
      return;
    }
    if (endTime <= startTime) {
      setCreateError('End time must be after start time.');
      return;
    }
    if (!reason.trim()) {
      setCreateError('Reason is required.');
      return;
    }
    if (!courtId) {
      setCreateError('Select a court.');
      return;
    }

    setSubmitting(true);
    setCreateError(null);

    try {
      const result = await createBlockedPeriodAction({
        courtId,
        date,
        startTime,
        endTime,
        reason,
      });

      if (result.success) {
        const mirrorOk = addMirroredPeriod({
          courtId,
          date,
          startTime,
          endTime,
          reason,
        });
        if (mirrorOk) {
          toast.success('Blocked period added.');
          setPendingMirror(null);
          setMirrorWarning(null);
        } else {
          setPendingMirror({ type: 'add', period: { courtId, date, startTime, endTime, reason } });
          setMirrorWarning(MIRROR_WARNING);
          toast.warning(MIRROR_WARNING);
        }
        setDate('');
        setStartTime('07:00');
        setEndTime('12:00');
        setReason('');
        refresh();
      } else {
        const hasBookingConflict = result.hasBookingConflict === true;
        const message = hasBookingConflict
          ? GENERIC_BOOKING_CONFLICT_MESSAGE
          : result.error || 'Could not save the blocked period. Please try again.';
        setCreateError(message);
        toast.error(message);
      }
    } catch {
      const message = 'Could not save the blocked period. Please try again.';
      setCreateError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;

    if (confirmingId !== id) {
      setConfirmingId(id);
      setDeleteError(null);
      return;
    }

    setDeletingId(id);
    setDeleteError(null);
    try {
      const result = await deleteBlockedPeriodAction(id);
      if (result.success) {
        const target = (blockedPeriods ?? []).find((bp) => bp.id === id);
        const mirrorKeys = target
          ? {
              courtId: target.courtId,
              date: target.date,
              startTime: target.startTime,
              endTime: target.endTime,
            }
          : null;
        const mirrorOk = mirrorKeys ? removeMirroredPeriod(mirrorKeys) : true;
        if (mirrorOk) {
          toast.success('Blocked period removed.');
          setPendingMirror(null);
          setMirrorWarning(null);
        } else {
          setPendingMirror({ type: 'remove', keys: mirrorKeys as MirrorFields });
          setMirrorWarning(MIRROR_WARNING);
          toast.warning(MIRROR_WARNING);
        }
        setConfirmingId(null);
        refresh();
      } else {
        const message = result.error || 'Failed to delete the blocked period. Please try again.';
        setDeleteError(message);
        toast.error(message);
      }
    } catch {
      const message = 'Failed to delete the blocked period. Please try again.';
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  if (isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  const firstLoad = loading && blockedPeriods === null;
  if (firstLoad) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading blocked periods...</p>
      </div>
    );
  }

  if (listError && blockedPeriods === null && !loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-red-500" role="alert">
          {listError}
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

  const rows = blockedPeriods ?? [];
  const courtsData = courts ?? [];
  const courtName = (id: string) =>
    courtsData.find((court) => court.id === id)?.name ?? 'Unknown court';
  const createDisabled = submitting || courtsData.length === 0 || courtsError !== null;

  return (
    <div className="min-h-[80vh] px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-6xl mx-auto space-y-5">
        {mirrorWarning && pendingMirror && (
          <div
            className="rounded-2xl border border-yellow-300 dark:border-yellow-900/50 bg-yellow-50 dark:bg-yellow-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
            role="status"
          >
            <p className="text-sm text-yellow-800 dark:text-yellow-300">{mirrorWarning}</p>
            <button
              type="button"
              onClick={handleResyncLocalCopy}
              className="text-xs font-bold text-yellow-900 dark:text-yellow-200 underline hover:no-underline"
            >
              Re-sync
            </button>
          </div>
        )}

        {courtsError && (
          <div
            className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
            role="alert"
          >
            <p className="text-sm text-red-600 dark:text-red-400">{courtsError}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs font-bold text-red-600 dark:text-red-400 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        <div className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-[#344239]">
            <h1 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">
              Block a time range
            </h1>
          </div>

          <form onSubmit={handleCreate} className="px-4 sm:px-6 py-4 bg-gray-50/50 dark:bg-[#171F1A]/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#8A9A8E]">
                Court
                <select
                  value={courtId}
                  onChange={(e) => setCourtId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A]"
                >
                  {courtsData.length === 0 && <option value="">No courts available</option>}
                  {courtsData.map((court) => (
                    <option key={court.id} value={court.id}>
                      {court.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#8A9A8E]">
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A]"
                />
              </label>

              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#8A9A8E]">
                Start time
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A]"
                />
              </label>

              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#8A9A8E]">
                End time
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A]"
                />
              </label>

              <div className="flex gap-2 items-end">
                <label className="block flex-1 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-[#8A9A8E]">
                  Reason
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason"
                    className="mt-1 w-full rounded-xl border border-gray-200 dark:border-[#344239] px-3 py-2 text-xs font-medium text-gray-700 dark:text-[#F5F7F5] bg-white dark:bg-[#171F1A]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={createDisabled}
                  className="px-4 py-2 rounded-xl bg-gray-900 dark:bg-[#26332A] text-white text-xs font-bold hover:bg-gray-800 dark:hover:bg-[#344239] transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-900"
                >
                  <Plus className="w-3 h-3" aria-hidden="true" /> Add
                </button>
              </div>
            </div>

            {createError && (
              <p className="text-xs text-red-600 dark:text-red-400" role="alert">
                {createError}
              </p>
            )}
          </form>
        </div>

        {deleteError && (
          <div
            className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3"
            role="alert"
          >
            <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>
          </div>
        )}

        <div
          className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden"
          aria-busy={loading}
        >
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-[#344239] flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">
              All Blocked Periods
            </h2>
            {rows.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-[#8A9A8E]">
                Showing {rows.length} blocked period{rows.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <CalendarOff className="w-6 h-6 text-gray-400 dark:text-[#8A9A8E] mx-auto" aria-hidden="true" />
              <p className="text-sm text-gray-500 dark:text-[#8A9A8E]">No blocked periods defined.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] uppercase border-b border-gray-100 dark:border-[#344239]">
                    <th className="px-4 sm:px-6 py-3 text-left">Court</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Date</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Time</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Reason</th>
                    <th className="px-4 sm:px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#344239]">
                  {rows.map((bp) => (
                    <tr key={bp.id} className="hover:bg-gray-50 dark:hover:bg-[#171F1A] transition-colors">
                      <td className="px-4 sm:px-6 py-3 font-bold text-gray-900 dark:text-[#F5F7F5]">
                        {courtName(bp.courtId)}
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">{bp.date}</td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">
                        {bp.startTime}–{bp.endTime}
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700 dark:text-[#A1ADA4]">{bp.reason || '—'}</td>
                      <td className="px-4 sm:px-6 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDelete(bp.id)}
                          disabled={deletingId === bp.id}
                          aria-label={
                            confirmingId === bp.id
                              ? `Confirm delete ${bp.date}`
                              : `Delete ${bp.date}`
                          }
                          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-bold text-red-600 dark:text-red-400 border border-[var(--border)] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          {confirmingId === bp.id ? 'Confirm' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
