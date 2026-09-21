'use client';

import Link from 'next/link';
import {
  Bell,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  CreditCard,
  Gift,
  Info,
  Trash2,
  CheckCheck,
  Inbox,
  RotateCcw,
} from 'lucide-react';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { useAuthGuard } from '@/hooks/useAuthGuard';
import { NotificationType } from '@/types';

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  booking_confirmed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Booking' },
  booking_cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Booking' },
  booking_reminder: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Reminder' },
  booking_time_changed: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Update' },
  payment_successful: { icon: CreditCard, color: 'text-green-600', bg: 'bg-green-50', label: 'Payment' },
  payment_refunded: { icon: RotateCcw, color: 'text-blue-600', bg: 'bg-blue-50', label: 'Refund' },
  subscription_expiring: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Subscription' },
  promo_offer: { icon: Gift, color: 'text-purple-500', bg: 'bg-purple-50', label: 'Promo' },
  court_full: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Court' },
  checkout_stuck: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50', label: 'Checkout' },
  new_subscription: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50', label: 'Subscription' },
  new_booking: { icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Booking' },
  info: { icon: Info, color: 'text-gray-500', bg: 'bg-gray-50', label: 'Info' },
  booking_expired: { icon: Clock, color: 'text-red-400', bg: 'bg-red-50', label: 'Expired' },
};

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function NotificationsPage() {
  const { user, hydrated } = useAuthGuard();
  const getNotificationsForUser = useNotificationStore((s) => s.getNotificationsForUser);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const deleteNotification = useNotificationStore((s) => s.deleteNotification);
  const clearNotifications = useNotificationStore((s) => s.clearNotifications);
  const unreadCount = useNotificationStore((s) =>
    user ? s.unreadCount(user.id) : 0
  );

  if (!hydrated || !user) return null;

  const notifications = getNotificationsForUser(user.id);

  return (
    <div className="space-y-6 sm:space-y-10">
      {/* Header */}
      <section className="bg-white border-b border-gray-200/80 py-6 sm:py-10">
        <SiteContainer>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
            <div className="section-head mb-0">
              <Badge icon={<Bell className="icon-inline text-green-600" />} size="sm">
                Notifications
              </Badge>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">
                Notifications
              </h1>
              <p className="text-sm sm:text-base text-muted leading-relaxed max-w-2xl">
                Stay updated on your bookings, payments, and exclusive offers.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {unreadCount > 0 && (
                <Button
                  onClick={() => markAllAsRead(user.id)}
                  variant="outline"
                  size="sm"
                  className="h-10 px-4 rounded-[var(--radius-md)] font-bold text-xs flex items-center gap-1.5"
                >
                  <CheckCheck className="icon-inline" />
                  <span>Mark all read</span>
                </Button>
              )}
              {notifications.length > 0 && (
                <Button
                  onClick={() => clearNotifications()}
                  variant="destructive"
                  size="sm"
                  className="h-10 px-4 rounded-[var(--radius-md)] font-bold text-xs flex items-center gap-1.5"
                >
                  <Trash2 className="icon-inline" />
                  <span>Clear all</span>
                </Button>
              )}
            </div>
          </div>
        </SiteContainer>
      </section>

      {/* Notification List */}
      <SiteContainer as="section" className="pb-12">
        {notifications.length > 0 ? (
          <div className="space-y-3">
            {notifications.map((n) => {
              const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
              const Icon = config.icon;

              return (
                <div
                  key={n.id}
                  className={`bg-white rounded-[var(--radius-xl)] p-5 border shadow-sm hover:shadow-md transition-all flex items-start gap-4 ${
                    !n.isRead
                      ? 'border-green-200/80 bg-green-50/20'
                      : 'border-gray-200/80'
                  }`}
                >
                  {/* Icon */}
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${config.bg}`}
                  >
                    <Icon className={`w-5 h-5 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[11px] font-bold uppercase tracking-wider ${config.color}`}
                      >
                        {config.label}
                      </span>
                      {!n.isRead && (
                        <span className="w-2 h-2 rounded-full bg-[#16A34A]" />
                      )}
                    </div>
                    <h3
                      className={`text-[15px] mt-1 ${
                        !n.isRead ? 'font-extrabold text-gray-900' : 'font-bold text-gray-700'
                      }`}
                    >
                      {n.title}
                    </h3>
                    <p className="text-[13px] text-gray-500 leading-relaxed mt-1">
                      {n.message}
                    </p>
                    <p className="text-[11px] text-gray-400 font-medium mt-2">
                      {formatDateTime(n.createdAt)}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    {!n.isRead && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center hover:bg-green-100 transition-colors cursor-pointer"
                        title="Mark as read"
                      >
                        <CheckCheck className="w-4 h-4 text-[#16A34A]" />
                      </button>
                    )}
                    <button
                      onClick={() => deleteNotification(n.id)}
                      className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-[var(--radius-xl)] p-6 sm:p-12 text-center border border-gray-200 max-w-md mx-auto my-8 sm:my-12">
            <Inbox className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="font-extrabold text-gray-900 text-lg">All Caught Up!</h3>
            <p className="text-xs text-muted mt-1">
              No notifications to show. We&apos;ll let you know when something happens.
            </p>
            <Button
              render={<Link href="/book" />}
              nativeButton={false}
              variant="primary"
              size="pill"
              className="mt-6"
            >
              <span>Book a Court</span>
            </Button>
          </div>
        )}
      </SiteContainer>
    </div>
  );
}
