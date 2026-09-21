import { User } from '@/types';

/**
 * Mock user with password hash for auth simulation.
 * In production, Supabase Auth handles this — passwords never stored in app code.
 *
 * Test credentials:
 *   User:  alex.johnson@example.com / password123
 *   Admin: admin@khubsports.com / admin456
 */

export interface MockUser extends User {
  /** Simple hash for mock auth — replaced by Supabase Auth in production */
  passwordHash: string;
}

/** Simple deterministic hash for mock passwords (NOT cryptographically secure). */
export function mockHash(password: string): string {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `mock_${Math.abs(hash).toString(36)}`;
}

export function verifyMockPassword(password: string, hash: string): boolean {
  return mockHash(password) === hash;
}

export const MOCK_USERS: MockUser[] = [
  {
    id: 'user-1',
    name: 'Alex Johnson',
    email: 'alex.johnson@example.com',
    phone: '+1 (555) 234-5678',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    role: 'User',
    createdAt: '2025-01-15T10:00:00.000Z',
    passwordHash: mockHash('password123'),
  },
  {
    id: 'user-admin-1',
    name: 'Admin User',
    email: 'admin@khubsports.com',
    phone: '+1 (555) 999-0000',
    role: 'Admin',
    createdAt: '2025-01-01T00:00:00.000Z',
    passwordHash: mockHash('admin456'),
  },
];
