'use client';

import { useState, useRef, memo } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotificationStore } from '@/features/notifications/useNotificationStore';
import { useAuthStore } from '@/features/auth/useAuthStore';
import { NotificationDropdown } from './NotificationDropdown';

export const NotificationBell = memo(function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const user = useAuthStore((s) => s.user);
  const unreadCount = useNotificationStore((s) =>
    user ? s.unreadCount(user.id) : 0
  );

  // Don't render for unauthenticated users
  if (!user) return null;

  return (
    <div className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon"
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        className="relative text-gray-500 hover:text-gray-900 h-11 w-11 rounded-xl"
      >
        <Bell className="w-[18px] h-[18px] strokeWidth-[2]" />
        {unreadCount > 0 && (
          <span className="absolute top-[6px] right-[6px] min-w-[18px] h-[18px] bg-[#16A34A] text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 border-[1.5px] border-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <NotificationDropdown
          onClose={() => setIsOpen(false)}
          triggerRef={triggerRef}
        />
      )}
    </div>
  );
});
