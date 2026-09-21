import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdvertisementStore } from './useAdvertisementStore';
import { syncAdvertisementRequests } from '@/services/advertisement.service';

// Keep real service logic — it operates on module-level in-memory arrays
vi.mock('@/services/advertisement.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/advertisement.service')>();
  return {
    ...actual,
    syncAdvertisementRequests: actual.syncAdvertisementRequests,
    createAdvertisementRequest: actual.createAdvertisementRequest,
    getAvailableAdvertisingSpaces: actual.getAvailableAdvertisingSpaces,
  };
});

beforeEach(() => {
  syncAdvertisementRequests([]);
  useAdvertisementStore.setState({ requests: [] });
});

describe('useAdvertisementStore', () => {
  it('has empty requests initially', () => {
    const { result } = renderHook(() => useAdvertisementStore());
    expect(result.current.requests).toEqual([]);
  });

  describe('getAvailableSpaces', () => {
    it('returns spaces with isAvailable = true', () => {
      const { result } = renderHook(() => useAdvertisementStore());
      const spaces = result.current.getAvailableSpaces();
      expect(spaces.length).toBeGreaterThan(0);
      spaces.forEach((s) => expect(s.isAvailable).toBe(true));
    });

    it('does not include unavailable spaces', () => {
      const { result } = renderHook(() => useAdvertisementStore());
      const spaces = result.current.getAvailableSpaces();
      const ids = spaces.map((s) => s.id);
      expect(ids).not.toContain('adspace-008'); // VIP Lounge is unavailable
    });
  });

  describe('createRequest', () => {
    it('creates a valid advertisement request', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: 'Sponsor Inc',
          contactName: 'Jane',
          email: 'jane@sponsor.com',
          phone: '+201234567890',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          proposedBudget: 5000,
        });
      });

      expect(res.success).toBe(true);
      expect(res.request).toBeDefined();
      expect(res.request.companyName).toBe('Sponsor Inc');
      expect(res.request.status).toBe('Pending');
      expect(result.current.requests).toHaveLength(1);
    });

    it('rejects missing company name', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: '',
          contactName: 'Jane',
          email: 'j@x.com',
          phone: '123',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          proposedBudget: 5000,
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Company name');
    });

    it('rejects invalid email', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: 'Acme',
          contactName: 'Jane',
          email: 'not-email',
          phone: '123',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          proposedBudget: 5000,
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('email');
    });

    it('rejects unavailable space', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: 'Acme',
          contactName: 'Jane',
          email: 'j@x.com',
          phone: '123',
          advertisingSpaceId: 'adspace-008',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          proposedBudget: 5000,
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('not currently available');
    });

    it('rejects non-existent space', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: 'Acme',
          contactName: 'Jane',
          email: 'j@x.com',
          phone: '123',
          advertisingSpaceId: 'fake-space',
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          proposedBudget: 5000,
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('does not exist');
    });

    it('rejects end date before start date', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: 'Acme',
          contactName: 'Jane',
          email: 'j@x.com',
          phone: '123',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-31',
          endDate: '2026-10-01',
          proposedBudget: 5000,
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('End date must be after');
    });

    it('rejects end date equal to start date', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: 'Acme',
          contactName: 'Jane',
          email: 'j@x.com',
          phone: '123',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-01',
          endDate: '2026-10-01',
          proposedBudget: 5000,
        });
      });

      expect(res.success).toBe(false);
    });

    it('rejects overlapping date range for same space', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      act(() => {
        result.current.createRequest({
          companyName: 'A',
          contactName: 'B',
          email: 'a@b.com',
          phone: '123',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-01',
          endDate: '2026-10-15',
          proposedBudget: 5000,
        });
      });

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: 'C',
          contactName: 'D',
          email: 'c@d.com',
          phone: '456',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-10',
          endDate: '2026-10-20',
          proposedBudget: 3000,
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('overlapping');
    });

    it('allows non-overlapping requests for same space', () => {
      const { result } = renderHook(() => useAdvertisementStore());

      act(() => {
        result.current.createRequest({
          companyName: 'A',
          contactName: 'B',
          email: 'a@b.com',
          phone: '123',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-01',
          endDate: '2026-10-10',
          proposedBudget: 5000,
        });
      });

      let res: any;
      act(() => {
        res = result.current.createRequest({
          companyName: 'C',
          contactName: 'D',
          email: 'c@d.com',
          phone: '456',
          advertisingSpaceId: 'adspace-001',
          startDate: '2026-10-11',
          endDate: '2026-10-20',
          proposedBudget: 3000,
        });
      });

      expect(res.success).toBe(true);
    });
  });
});
