'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Booking } from '@/types';

interface BookingDetailsDrawerProps {
  booking: Booking | null;
  onClose: () => void;
  onConfirm: (booking: Booking) => void;
  onCancel: (booking: Booking) => void;
  /** true while a confirm/cancel action is in flight */
  busy: boolean;
}

function statusPillClass(status: Booking['status']) {
  if (status === 'Confirmed') return 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-[#4ADE80]';
  if (status === 'Cancelled') return 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400';
  if (status === 'Expired') return 'bg-gray-100 text-gray-500 dark:bg-[#171F1A] dark:text-[#8A9A8E]';
  return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950/60 dark:text-yellow-400';
}

function formatCreatedAt(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Slide-over details panel for a single booking (hand-rolled overlay —
 * no dialog component exists in the design system). Mirrors the Navbar
 * drawer a11y pattern: Escape closes, Tab is trapped, focus moves into
 * the panel on open and is restored on close.
 */
export function BookingDetailsDrawer({
  booking,
  onClose,
  onConfirm,
  onCancel,
  busy,
}: BookingDetailsDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!booking) return;

    const panel = panelRef.current;
    if (!panel) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () =>
      Array.from(panel.querySelectorAll<HTMLElement>(focusableSelector));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const firstFocusable = getFocusable()[0];
    if (firstFocusable) firstFocusable.focus();
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocused.current?.focus();
    };
  }, [booking, onClose]);

  if (!booking) return null;

  const canConfirm = booking.status === 'Reserved';
  const canCancel = booking.status === 'Reserved' || booking.status === 'Confirmed';
  const isWalkIn = booking.userId == null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        className="absolute inset-0 bg-slate-900/40 dark:bg-black/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Booking details ${booking.bookingNumber}`}
        className="absolute inset-y-0 right-0 w-full sm:w-[420px] max-w-full bg-white dark:bg-[#1D2821] border-l border-[var(--border)] shadow-[var(--shadow-floating)] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 h-[64px] border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <h2 className="text-sm font-bold text-[var(--text-main)] truncate">
              {booking.bookingNumber}
            </h2>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold shrink-0 ${statusPillClass(booking.status)}`}
            >
              {booking.status}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close booking details"
            className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] hover:bg-[var(--background)] shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          <section aria-label="Schedule" className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">
              Schedule
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Court</dt>
                <dd className="font-semibold text-[var(--text-main)] text-right">{booking.courtName}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Date</dt>
                <dd className="font-semibold text-[var(--text-main)]">{booking.date}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Time</dt>
                <dd className="font-semibold text-[var(--text-main)]">
                  {booking.startTime}–{booking.endTime}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Duration</dt>
                <dd className="font-semibold text-[var(--text-main)]">{booking.durationMinutes} min</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Amount</dt>
                <dd className="font-bold text-[var(--text-main)]">{booking.totalPrice} EGP</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Source</dt>
                <dd className="font-semibold text-[var(--text-main)]">
                  {isWalkIn
                    ? 'Walk-in'
                    : booking.bookingSource === 'ONLINE'
                      ? 'Online'
                      : booking.bookingSource}
                </dd>
              </div>
            </dl>
          </section>

          <section aria-label="Customer" className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">
              Customer
            </h3>
            {isWalkIn ? (
              <p className="text-sm text-[var(--text-muted)]">
                Walk-in customer — no account attached.
              </p>
            ) : (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Name</dt>
                  <dd className="font-semibold text-[var(--text-main)]">{booking.userName || '—'}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Email</dt>
                  <dd className="font-semibold text-[var(--text-main)] break-all text-right">
                    {booking.userEmail || '—'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-[var(--text-muted)]">Phone</dt>
                  <dd className="font-semibold text-[var(--text-main)]">{booking.userPhone || '—'}</dd>
                </div>
              </dl>
            )}
          </section>

          <section aria-label="Record" className="space-y-3">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">
              Record
            </h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Created</dt>
                <dd className="font-semibold text-[var(--text-main)]">{formatCreatedAt(booking.createdAt)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--text-muted)]">Last updated</dt>
                <dd className="font-semibold text-[var(--text-main)]">{formatCreatedAt(booking.updatedAt)}</dd>
              </div>
            </dl>
          </section>
        </div>

        {/* Footer actions — reuse existing Server Actions, business rules unchanged */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold text-[var(--text-muted)] hover:bg-[var(--background)] transition-colors"
          >
            Close
          </button>
          {canCancel && (
            <button
              type="button"
              onClick={() => onCancel(booking)}
              disabled={busy}
              className="rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel booking
            </button>
          )}
          {canConfirm && (
            <button
              type="button"
              onClick={() => onConfirm(booking)}
              disabled={busy}
              className="rounded-[var(--radius-md)] px-3 py-2 text-xs font-bold bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy ? 'Working...' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
