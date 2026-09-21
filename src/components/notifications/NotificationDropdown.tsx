'use client';

import { useRef, useEffect, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  CreditCard,
  Gift,
  Info,
  Trash2,
  CheckCheck,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { NotificationType } from '@/types';

const MOBILE_BP = '(max-width: 767px)';
const DROPDOWN_W = 380;
const VIEWPORT_MARGIN = 16;

interface Props {
  onClose: () => void;
  triggerRef: RefObject<HTMLElement | null>;
}

const TYPE_CONFIG: Record<
  NotificationType,
  { icon: React.ElementType; color: string; bg: string }
> = {
  booking_confirmed: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  booking_cancelled: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  booking_reminder: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
  booking_time_changed: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
  payment_successful: { icon: CreditCard, color: 'text-green-600', bg: 'bg-green-50' },
  payment_refunded: { icon: RotateCcw, color: 'text-blue-600', bg: 'bg-blue-50' },
  subscription_expiring: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  promo_offer: { icon: Gift, color: 'text-purple-500', bg: 'bg-purple-50' },
  court_full: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  checkout_stuck: { icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-50' },
  new_subscription: { icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-50' },
  new_booking: { icon: CheckCircle2, color: 'text-blue-500', bg: 'bg-blue-50' },
  info: { icon: Info, color: 'text-gray-500', bg: 'bg-gray-50' },
  booking_expired: { icon: Clock, color: 'text-red-400', bg: 'bg-red-50' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function NotificationDropdown({ onClose, triggerRef }: Props) {
  const user = useAuthStore((s) => s.user);
  const getNotificationsForUser = useNotificationStore((s) => s.getNotificationsForUser);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const deleteNotification = useNotificationStore((s) => s.deleteNotification);
  const unreadCount = useNotificationStore((s) =>
    user ? s.unreadCount(user.id) : 0
  );

  const isMobile = useMediaQuery(MOBILE_BP);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!isMobile) {
      setPos(null);
      return;
    }

    function calc() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const vw = window.innerWidth;

      const ddWidth = Math.min(DROPDOWN_W, vw - 2 * VIEWPORT_MARGIN);

      let x = r.left;
      if (x + ddWidth > vw - VIEWPORT_MARGIN) {
        x = vw - VIEWPORT_MARGIN - ddWidth;
      }
      if (x < VIEWPORT_MARGIN) x = VIEWPORT_MARGIN;

      setPos({ x, y: r.bottom + 8 });
    }

    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('scroll', calc, true);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('scroll', calc, true);
    };
  }, [isMobile, triggerRef]);

  useEffect(() => {
    if (!isMobile) return;
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(t) &&
        triggerRef.current &&
        !triggerRef.current.contains(t)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobile, onClose, triggerRef]);

  useEffect(() => {
    if (!isMobile) return;
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isMobile, onClose]);

  if (!user) return null;

  const userNotifications = getNotificationsForUser(user.id);
  const recent = userNotifications.slice(0, 8);

  const vw = typeof window !== 'undefined' ? window.innerWidth : 430;
  const ddWidth = isMobile ? Math.min(DROPDOWN_W, vw - 2 * VIEWPORT_MARGIN) : DROPDOWN_W;

  const positionedStyle = isMobile && pos
    ? { position: 'fixed' as const, left: pos.x, top: pos.y, width: ddWidth }
    : {};

  const containerClass = isMobile
    ? 'max-h-[520px] bg-white rounded-[var(--radius-xl)] border border-gray-200 shadow-2xl z-50 flex flex-col overflow-hidden'
    : 'absolute right-0 top-full mt-2 w-[380px] max-h-[520px] bg-white rounded-[var(--radius-xl)] border border-gray-200 shadow-2xl z-50 flex flex-col overflow-hidden';

  const dropdownContent = (
    <div ref={dropdownRef} className={containerClass} style={positionedStyle}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="font-extrabold text-sm text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <p className="text-[11px] text-gray-400 font-medium mt-0.5">
              {unreadCount} unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllAsRead(user.id)}
            className="flex items-center gap-1 text-[11px] font-semibold text-[#16A34A] hover:text-[#15803D] transition-colors cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {recent.length === 0 ? (
          <div className="py-12 text-center">
            <Info className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400 font-medium">No notifications yet</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recent.map((n) => {
              const config = TYPE_CONFIG[n.type] || TYPE_CONFIG.info;
              const Icon = config.icon;

              return (
                <div
                  key={n.id}
                  className={`px-5 py-3.5 flex items-start gap-3 hover:bg-gray-50/60 transition-colors ${
                    !n.isRead ? 'bg-green-50/30' : ''
                  }`}
                >
                  {/* Icon */}
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${config.bg}`}
                  >
                    <Icon className={`w-4 h-4 ${config.color}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className={`text-[13px] leading-snug ${
                          !n.isRead
                            ? 'font-bold text-gray-900'
                            : 'font-semibold text-gray-700'
                        }`}
                      >
                        {n.title}
                      </p>
                      <span className="text-[10px] text-gray-400 whitespace-nowrap mt-0.5">
                        {timeAgo(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-[12px] text-gray-500 leading-relaxed mt-0.5 line-clamp-2">
                      {n.message}
                    </p>

                    {/* Actions */}
                    <div className="flex items-center gap-3 mt-1.5">
                      {!n.isRead && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(n.id);
                          }}
                          className="text-[10px] font-semibold text-[#16A34A] hover:text-[#15803D] cursor-pointer"
                        >
                          Mark read
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(n.id);
                        }}
                        className="text-[10px] font-semibold text-gray-400 hover:text-red-500 cursor-pointer flex items-center gap-0.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Unread dot */}
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full bg-[#16A34A] shrink-0 mt-1.5" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer — View All link */}
      {userNotifications.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-3">
          <Link
            href="/notifications"
            onClick={onClose}
            className="flex items-center justify-center gap-1.5 text-[12px] font-bold text-[#16A34A] hover:text-[#15803D] transition-colors"
          >
            View all notifications
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );

  if (isMobile && typeof document !== 'undefined') {
    return createPortal(dropdownContent, document.body);
  }

  return dropdownContent;
}
