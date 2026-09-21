import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSponsorshipStore } from './useSponsorshipStore';
import { syncSponsorshipRequests } from '@/services/sponsorship.service';

// Mock Supabase client for Court validation
vi.mock('@/lib/supabase/client', () => {
  let queriedId: string | null = null;
  return {
    createClient: vi.fn(() => ({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, id: string) => {
            queriedId = id;
            return {
              is: vi.fn(() => ({
                maybeSingle: vi.fn(() => ({
                  data: queriedId === 'nonexistent-court' ? null : { id: queriedId },
                })),
              })),
            };
          }),
        })),
      })),
    })),
  };
});

// Mock sponsorship.service — uses real service logic (pure in-memory)
vi.mock('@/services/sponsorship.service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/sponsorship.service')>();
  return {
    ...actual,
    syncSponsorshipRequests: actual.syncSponsorshipRequests,
    createSponsorshipRequest: actual.createSponsorshipRequest,
  };
});

beforeEach(() => {
  syncSponsorshipRequests([]);
  useSponsorshipStore.setState({ requests: [] });
});

describe('useSponsorshipStore', () => {
  it('has empty requests initially', () => {
    const { result } = renderHook(() => useSponsorshipStore());
    expect(result.current.requests).toEqual([]);
  });

  describe('createRequest', () => {
    it('creates a valid sponsorship request', async () => {
      const { result } = renderHook(() => useSponsorshipStore());

      let res: any;
      await act(async () => {
        res = await result.current.createRequest({
          companyName: 'Acme Corp',
          contactName: 'John Doe',
          email: 'john@acme.com',
          phone: '+201234567890',
          targetType: 'Court',
          targetId: 'a1b2c3d4-0001-4000-8000-000000000001',
          proposedAmount: 10000,
          pricingType: 'PerMonth',
          requestedBenefits: ['Logo on website'],
          requestedPlacement: ['Website'],
        });
      });

      expect(res.success).toBe(true);
      expect(res.request).toBeDefined();
      expect(res.request.companyName).toBe('Acme Corp');
      expect(res.request.status).toBe('Pending');
      expect(result.current.requests).toHaveLength(1);
    });

    it('rejects missing company name', async () => {
      const { result } = renderHook(() => useSponsorshipStore());

      let res: any;
      await act(async () => {
        res = await result.current.createRequest({
          companyName: '',
          contactName: 'John',
          email: 'j@x.com',
          phone: '123',
          targetType: 'Club',
          targetId: 'khub-club',
          proposedAmount: 1000,
          pricingType: 'OneTime',
          requestedBenefits: [],
          requestedPlacement: [],
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('Company name');
    });

    it('rejects invalid email', async () => {
      const { result } = renderHook(() => useSponsorshipStore());

      let res: any;
      await act(async () => {
        res = await result.current.createRequest({
          companyName: 'Acme',
          contactName: 'John',
          email: 'not-an-email',
          phone: '123',
          targetType: 'Club',
          targetId: 'khub-club',
          proposedAmount: 1000,
          pricingType: 'OneTime',
          requestedBenefits: [],
          requestedPlacement: [],
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('email');
    });

    it('rejects invalid court target', async () => {
      const { result } = renderHook(() => useSponsorshipStore());

      let res: any;
      await act(async () => {
        res = await result.current.createRequest({
          companyName: 'Acme',
          contactName: 'John',
          email: 'j@x.com',
          phone: '123',
          targetType: 'Court',
          targetId: 'nonexistent-court',
          proposedAmount: 1000,
          pricingType: 'OneTime',
          requestedBenefits: [],
          requestedPlacement: [],
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('does not exist');
    });

    it('accepts valid Club target', async () => {
      const { result } = renderHook(() => useSponsorshipStore());

      let res: any;
      await act(async () => {
        res = await result.current.createRequest({
          companyName: 'Acme',
          contactName: 'John',
          email: 'j@x.com',
          phone: '123',
          targetType: 'Club',
          targetId: 'khub-club',
          proposedAmount: 1000,
          pricingType: 'OneTime',
          requestedBenefits: [],
          requestedPlacement: [],
        });
      });

      expect(res.success).toBe(true);
    });

    it('accepts valid FacilityArea target', async () => {
      const { result } = renderHook(() => useSponsorshipStore());

      let res: any;
      await act(async () => {
        res = await result.current.createRequest({
          companyName: 'Acme',
          contactName: 'John',
          email: 'j@x.com',
          phone: '123',
          targetType: 'FacilityArea',
          targetId: 'Reception',
          proposedAmount: 5000,
          pricingType: 'PerSeason',
          requestedBenefits: [],
          requestedPlacement: [],
        });
      });

      expect(res.success).toBe(true);
    });

    it('rejects invalid FacilityArea target', async () => {
      const { result } = renderHook(() => useSponsorshipStore());

      let res: any;
      await act(async () => {
        res = await result.current.createRequest({
          companyName: 'Acme',
          contactName: 'John',
          email: 'j@x.com',
          phone: '123',
          targetType: 'FacilityArea',
          targetId: 'Nonexistent Area',
          proposedAmount: 5000,
          pricingType: 'PerSeason',
          requestedBenefits: [],
          requestedPlacement: [],
        });
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('not available');
    });
  });

  describe('getPublicSponsors', () => {
    it('returns only Approved + isActive requests', () => {
      const { result } = renderHook(() => useSponsorshipStore());

      act(() => {
        useSponsorshipStore.setState({
          requests: [
            {
              id: 'r1', companyName: 'A', contactName: '', email: '', phone: '',
              targetType: 'Club', targetId: 'khub-club', proposedAmount: 100,
              currency: 'EGP', pricingType: 'OneTime', requestedBenefits: [],
              requestedPlacement: [], approvedBenefits: [], status: 'Approved',
              isActive: true, createdAt: '', updatedAt: '',
            },
            {
              id: 'r2', companyName: 'B', contactName: '', email: '', phone: '',
              targetType: 'Club', targetId: 'khub-club', proposedAmount: 100,
              currency: 'EGP', pricingType: 'OneTime', requestedBenefits: [],
              requestedPlacement: [], approvedBenefits: [], status: 'Pending',
              isActive: false, createdAt: '', updatedAt: '',
            },
          ],
        });
      });

      expect(result.current.getPublicSponsors()).toHaveLength(1);
      expect(result.current.getPublicSponsors()[0].id).toBe('r1');
    });

    it('returns empty when no approved requests', () => {
      const { result } = renderHook(() => useSponsorshipStore());
      expect(result.current.getPublicSponsors()).toEqual([]);
    });
  });
});
