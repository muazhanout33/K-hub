'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { getAdminBookingsAction } from '@/app/actions/booking.actions';
import { BlockedPeriodsManager } from '@/features/booking/BlockedPeriodsManager';
import { Button } from '@/components/ui/button';
import { Shield, CalendarCheck, Users, Banknote, CalendarOff, Globe, UserRound } from 'lucide-react';
import { Booking } from '@/types';

export default function AdminPage() {
  const { user, isRedirecting, isAdmin } = useAdminGuard();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Bumping this key re-runs the fetch effect — used by the Retry button.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    async function fetchAdminBookings() {
      try {
        const result = await getAdminBookingsAction();
        if (cancelled) return;
        if (result.success && result.bookings) {
          setBookings(result.bookings);
          setError(null);
        } else {
          setError(result.error || 'Failed to load bookings.');
        }
      } catch {
        if (cancelled) return;
        setError('An unexpected error occurred.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchAdminBookings();
    return () => { cancelled = true; };
  }, [isAdmin, reloadKey]);

  const handleRetry = () => {
    setError(null);
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  if (isRedirecting) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Checking access...</p>
      </div>
    );
  }

  if (!user || !isAdmin) return null;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading admin data...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-4">
        <p className="text-sm text-red-500" role="alert">{error}</p>
        <Button type="button" variant="secondary" size="sm" onClick={handleRetry}>
          Retry
        </Button>
      </div>
    );
  }

  // Aggregate stats from all bookings (definitions unchanged)
  const totalBookings = bookings.length;
  const confirmedBookings = bookings.filter((b) => b.status === 'Confirmed').length;
  const cancelledBookings = bookings.filter((b) => b.status === 'Cancelled').length;
  const totalRevenue = bookings
    .filter((b) => b.status === 'Confirmed')
    .reduce((sum, b) => sum + b.totalPrice, 0);

  const stats = [
    {
      label: 'Total Bookings',
      value: totalBookings,
      icon: CalendarCheck,
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-950/40',
      helper: 'All time',
    },
    {
      label: 'Confirmed',
      value: confirmedBookings,
      icon: Shield,
      color: 'text-green-600 dark:text-[#4ADE80]',
      bg: 'bg-green-50 dark:bg-green-950/40',
      helper: 'Active reservations',
    },
    {
      label: 'Cancelled',
      value: cancelledBookings,
      icon: Users,
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-950/40',
      helper: 'Refunded / voided',
    },
    {
      label: 'Revenue',
      value: `EGP ${totalRevenue.toLocaleString()}`,
      icon: Banknote,
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-950/40',
      helper: 'Confirmed bookings',
    },
  ];

  // Single bookings surface: five most recent by default, full list on toggle.
  // getAdminBookingsAction already returns created_at DESC.
  const visibleBookings = showAll ? bookings : bookings.slice(0, 5);

  const quickLinkClass =
    'inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold bg-white dark:bg-[#1D2821] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--primary-hover)] hover:border-[var(--primary)] transition-colors';

  return (
    <div className="min-h-[80vh] px-4 sm:px-6 py-6 sm:py-12">
      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-[var(--primary)]" />
          <h1 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-[#F5F7F5]">Admin Dashboard</h1>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="surface-card p-4 sm:p-5 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">{stat.label}</span>
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </div>
              <div>
                <p className="text-xl sm:text-2xl font-black text-gray-900 dark:text-[#F5F7F5] tracking-tight">{stat.value}</p>
                <p className="text-[11px] text-muted mt-1">{stat.helper}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick links — implemented destinations only */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3" aria-label="Quick links">
          <Link href="/admin/bookings" className={quickLinkClass}>
            <CalendarCheck className="w-4 h-4" aria-hidden="true" />
            Bookings
          </Link>
          <a href="#blocked-periods" className={quickLinkClass}>
            <CalendarOff className="w-4 h-4" aria-hidden="true" />
            Blocked periods
          </a>
          <Link href="/" className={quickLinkClass}>
            <Globe className="w-4 h-4" aria-hidden="true" />
            Public website
          </Link>
          <Link href="/profile" className={quickLinkClass}>
            <UserRound className="w-4 h-4" aria-hidden="true" />
            My profile
          </Link>
        </div>

        {/* Bookings — recent by default, full list on toggle */}
        <div className="bg-white dark:bg-[#1D2821] rounded-2xl border border-[var(--border)] shadow-[var(--shadow-card)] overflow-hidden">
          <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100 dark:border-[#344239] flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs sm:text-sm font-bold text-gray-700 dark:text-[#F5F7F5] uppercase">All Bookings</h2>
            {bookings.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  Showing {visibleBookings.length} of {bookings.length} bookings
                </span>
                {bookings.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setShowAll((value) => !value)}
                    className="text-xs font-bold text-[var(--primary-hover)] hover:underline"
                  >
                    {showAll ? 'Show recent only' : 'Show all bookings'}
                  </button>
                )}
              </div>
            )}
          </div>

          {bookings.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No bookings yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs font-bold text-gray-500 dark:text-[#8A9A8E] uppercase border-b border-gray-100 dark:border-[#344239]">
                    <th className="px-6 py-3 text-left">Booking #</th>
                    <th className="px-6 py-3 text-left">User</th>
                    <th className="px-6 py-3 text-left">Court</th>
                    <th className="px-6 py-3 text-left">Date</th>
                    <th className="px-6 py-3 text-left">Time</th>
                    <th className="px-6 py-3 text-left">Amount</th>
                    <th className="px-6 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-[#344239]">
                  {visibleBookings.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-[#171F1A] transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-gray-700 dark:text-[#F5F7F5]">{b.bookingNumber}</td>
                      <td className="px-6 py-3 text-gray-700 dark:text-[#F5F7F5]">{b.userName || 'Guest'}</td>
                      <td className="px-6 py-3 text-gray-700 dark:text-[#F5F7F5]">{b.courtName}</td>
                      <td className="px-6 py-3 text-gray-700 dark:text-[#F5F7F5]">{b.date}</td>
                      <td className="px-6 py-3 text-gray-700 dark:text-[#F5F7F5]">{b.startTime}–{b.endTime}</td>
                      <td className="px-6 py-3 font-bold text-gray-900 dark:text-[#F5F7F5]">{b.totalPrice} EGP</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          b.status === 'Confirmed'
                            ? 'bg-green-100 text-green-700'
                            : b.status === 'Cancelled'
                            ? 'bg-red-100 text-red-700'
                            : b.status === 'Expired'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Blocked Periods Manager */}
        <div id="blocked-periods">
          <BlockedPeriodsManager />
        </div>
      </div>
    </div>
  );
}
