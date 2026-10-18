'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { getAdminCourtsAction } from '@/app/actions/court.actions';
import { Court } from '@/types';
import { CourtEditDrawer } from './CourtEditDrawer';

function statusPillClass(status: Court['status']) {
  if (status === 'Available') return 'bg-green-100 text-green-700';
  if (status === 'Starts Soon') return 'bg-yellow-100 text-yellow-700';
  if (status === 'Booked') return 'bg-red-100 text-red-700';
  return 'bg-gray-100 text-gray-600'; // Maintenance
}

export default function AdminCourtsPage() {
  const { user, isRedirecting, isAdmin } = useAdminGuard();

  const [courts, setCourts] = useState<Court[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumping this key re-runs the fetch effect — used by Retry and post-edit refresh.
  const [reloadKey, setReloadKey] = useState(0);
  // Court being edited (null = drawer closed).
  const [selected, setSelected] = useState<Court | null>(null);

  const refresh = () => setReloadKey((key) => key + 1);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadCourts() {
      try {
        const result = await getAdminCourtsAction();
        if (cancelled) return;
        if (result.success && result.courts) {
          setCourts(result.courts);
          setError(null);
        } else {
          setError(result.error || 'Failed to load courts.');
        }
      } catch {
        if (!cancelled) setError('An unexpected error occurred.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCourts();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadKey]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  // ── Guard gates (parity with /admin/bookings) ──
  if (isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  const firstLoad = loading && courts === null;
  if (firstLoad) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading courts...</p>
      </div>
    );
  }

  if (error && courts === null && !loading) {
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

  const rows = courts ?? [];

  return (
    <div className="min-h-[80vh] px-4 sm:px-6 py-6 sm:py-8">
      <div className="max-w-6xl mx-auto space-y-5">
        {/* Inline error banner (data already on screen) */}
        {error && courts !== null && (
          <div
            className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 flex flex-wrap items-center justify-between gap-2"
            role="alert"
          >
            <p className="text-sm text-red-600">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="text-xs font-bold text-red-600 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div
          className="bg-white rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden"
          aria-busy={loading}
        >
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xs sm:text-sm font-bold text-gray-700 uppercase">All Courts</h1>
            {rows.length > 0 && (
              <span className="text-xs text-gray-500">
                Showing {rows.length} court{rows.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="px-6 py-12 text-center space-y-3">
              <p className="text-sm text-gray-500">No courts found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-gray-500 uppercase border-b border-gray-100">
                    <th className="px-4 sm:px-6 py-3 text-left">Court</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Sport / Surface</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Status</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Price</th>
                    <th className="px-4 sm:px-6 py-3 text-left">Working Hours</th>
                    <th className="px-4 sm:px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((court) => (
                    <tr key={court.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 sm:px-6 py-3 font-bold text-gray-900">{court.name}</td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700">
                        {court.sportType} / {court.surface}
                      </td>
                      <td className="px-4 sm:px-6 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${statusPillClass(court.status)}`}
                        >
                          {court.status}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-3 font-bold text-gray-900">
                        {court.pricePerHour} EGP/hr
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-gray-700">
                        {court.workingHours.open}–{court.workingHours.close}
                      </td>
                      <td className="px-4 sm:px-6 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelected(court)}
                          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-xs font-bold text-[var(--primary)] border border-[var(--border)] hover:bg-[var(--background)] transition-colors"
                          aria-label={`Edit ${court.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                          Edit
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

      {/* key: remount per court so form state (incl. the explicit status choice)
          never leaks from one court's drawer session into another's (fix #1). */}
      <CourtEditDrawer
        key={selected?.id ?? 'none'}
        court={selected}
        onClose={() => setSelected(null)}
        onSaved={refresh}
      />
    </div>
  );
}
