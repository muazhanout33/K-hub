import { describe, it, expect } from 'vitest';
import {
  parseTstzrange,
  formatTstzrange,
  mapDbProfileToUser,
  mapUserToDbProfile,
  mapDbCourtToCourt,
  mapCourtToDbCourt,
  mapDbNotificationToNotification,
  mapNotificationToDbNotification,
} from '@/lib/mappers';

describe('parseTstzrange', () => {
  it('parses a normal tstzrange and preserves time values', () => {
    const range = '["2026-08-25 10:00:00+00","2026-08-25 11:00:00+00")';
    const result = parseTstzrange(range);
    expect(result.date).toBeDefined();
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.startTime).toMatch(/^\d{2}:\d{2}$/);
    expect(result.endTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it('parses a post-midnight tstzrange', () => {
    const range = '["2026-08-26 01:00:00+00","2026-08-26 02:00:00+00")';
    const result = parseTstzrange(range);
    expect(result.date).toBeDefined();
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.startTime).toMatch(/^\d{2}:\d{2}$/);
    expect(result.endTime).toMatch(/^\d{2}:\d{2}$/);
  });

  it('handles invalid range gracefully', () => {
    const result = parseTstzrange('invalid');
    expect(result.date).toBe('');
    expect(result.startTime).toBe('00:00');
    expect(result.endTime).toBe('00:00');
  });
});

describe('formatTstzrange', () => {
  it('formats a normal range', () => {
    const result = formatTstzrange('2026-08-25', '10:00', '11:00');
    expect(result).toBe('[2026-08-25 10:00:00+00, 2026-08-25 11:00:00+00)');
  });

  it('formats a post-midnight range', () => {
    const result = formatTstzrange('2026-08-25', '01:00', '02:00');
    expect(result).toBe('[2026-08-26 01:00:00+00, 2026-08-26 02:00:00+00)');
  });

  it('formats a midnight crossover range', () => {
    const result = formatTstzrange('2026-08-25', '23:00', '01:00');
    expect(result).toBe('[2026-08-25 23:00:00+00, 2026-08-26 01:00:00+00)');
  });
});

describe('mapDbProfileToUser', () => {
  it('maps a DB profile to user', () => {
    const dbProfile = {
      id: 'user-1',
      full_name: 'John Doe',
      email: 'john@example.com',
      phone_number: '+1234567890',
      avatar_url: 'https://example.com/avatar.jpg',
      role: 'User' as const,
      status: 'Active' as const,
      date_of_birth: null,
      gender: null,
      address: null,
      emergency_contact: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const user = mapDbProfileToUser(dbProfile);
    expect(user.id).toBe('user-1');
    expect(user.name).toBe('John Doe');
    expect(user.email).toBe('john@example.com');
    expect(user.phone).toBe('+1234567890');
    expect(user.avatar).toBe('https://example.com/avatar.jpg');
    expect(user.role).toBe('User');
  });

  it('handles null phone', () => {
    const dbProfile = {
      id: 'user-2',
      full_name: 'Jane Doe',
      email: 'jane@example.com',
      phone_number: null,
      avatar_url: null,
      role: 'Admin' as const,
      status: 'Active' as const,
      date_of_birth: null,
      gender: null,
      address: null,
      emergency_contact: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };

    const user = mapDbProfileToUser(dbProfile);
    expect(user.phone).toBe('');
    expect(user.avatar).toBeUndefined();
  });
});

describe('mapUserToDbProfile', () => {
  it('maps a user to DB profile', () => {
    const user = {
      id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      avatar: 'https://example.com/avatar.jpg',
      role: 'User' as const,
      createdAt: '2026-01-01T00:00:00Z',
    };

    const dbProfile = mapUserToDbProfile(user);
    expect(dbProfile.id).toBe('user-1');
    expect(dbProfile.full_name).toBe('John Doe');
    expect(dbProfile.email).toBe('john@example.com');
    expect(dbProfile.phone_number).toBe('+1234567890');
    expect(dbProfile.avatar_url).toBe('https://example.com/avatar.jpg');
    expect(dbProfile.role).toBe('User');
  });

  it('handles empty phone', () => {
    const user = {
      id: 'user-2',
      name: 'Jane Doe',
      email: 'jane@example.com',
      phone: '',
      avatar: undefined,
      role: 'Admin' as const,
      createdAt: '2026-01-01T00:00:00Z',
    };

    const dbProfile = mapUserToDbProfile(user);
    expect(dbProfile.phone_number).toBeNull();
    expect(dbProfile.avatar_url).toBeNull();
  });
});

describe('mapDbNotificationToNotification', () => {
  it('maps a DB notification to notification', () => {
    const dbNotification = {
      id: 'notif-1',
      user_id: 'user-1',
      type: 'new_booking',
      title: 'New Booking',
      message: 'You have a new booking',
      is_read: false,
      related_booking_id: 'booking-1',
      dedupe_key: null,
      created_at: '2026-08-25T10:00:00Z',
    };

    const notification = mapDbNotificationToNotification(dbNotification);
    expect(notification.id).toBe('notif-1');
    expect(notification.userId).toBe('user-1');
    expect(notification.type).toBe('new_booking');
    expect(notification.title).toBe('New Booking');
    expect(notification.message).toBe('You have a new booking');
    expect(notification.isRead).toBe(false);
    expect(notification.relatedBookingId).toBe('booking-1');
    expect(notification.createdAt).toBe('2026-08-25T10:00:00Z');
  });

  it('handles null related_booking_id', () => {
    const dbNotification = {
      id: 'notif-2',
      user_id: 'user-1',
      type: 'booking_confirmed',
      title: 'Booking Confirmed',
      message: 'Your booking is confirmed',
      is_read: true,
      related_booking_id: null,
      dedupe_key: null,
      created_at: '2026-08-25T10:00:00Z',
    };

    const notification = mapDbNotificationToNotification(dbNotification);
    expect(notification.relatedBookingId).toBeUndefined();
  });
});

describe('mapNotificationToDbNotification', () => {
  it('maps a notification to DB notification', () => {
    const notification = {
      id: 'notif-1',
      userId: 'user-1',
      type: 'new_booking' as const,
      title: 'New Booking',
      message: 'You have a new booking',
      isRead: false,
      relatedBookingId: 'booking-1',
      createdAt: '2026-08-25T10:00:00Z',
    };

    const dbNotification = mapNotificationToDbNotification(notification);
    expect(dbNotification.user_id).toBe('user-1');
    expect(dbNotification.type).toBe('new_booking');
    expect(dbNotification.title).toBe('New Booking');
    expect(dbNotification.message).toBe('You have a new booking');
    expect(dbNotification.is_read).toBe(false);
    expect(dbNotification.related_booking_id).toBe('booking-1');
    expect(dbNotification.dedupe_key).toBeNull();
  });

  it('handles undefined relatedBookingId', () => {
    const notification = {
      id: 'notif-2',
      userId: 'user-1',
      type: 'booking_confirmed' as const,
      title: 'Booking Confirmed',
      message: 'Your booking is confirmed',
      isRead: true,
      relatedBookingId: undefined,
      createdAt: '2026-08-25T10:00:00Z',
    };

    const dbNotification = mapNotificationToDbNotification(notification);
    expect(dbNotification.related_booking_id).toBeNull();
  });
});
