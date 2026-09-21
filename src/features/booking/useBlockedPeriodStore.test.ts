import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBlockedPeriodStore } from './useBlockedPeriodStore';

beforeEach(() => {
  useBlockedPeriodStore.setState({ blockedPeriods: [] });
});

describe('useBlockedPeriodStore', () => {
  it('has empty blockedPeriods initially', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());
    expect(result.current.blockedPeriods).toEqual([]);
  });

  it('addBlockedPeriod adds a period with generated id and createdAt', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    let period: any;
    act(() => {
      period = result.current.addBlockedPeriod({
        courtId: 'court-1',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'Maintenance',
      });
    });

    expect(period.id).toMatch(/^bp-/);
    expect(period.courtId).toBe('court-1');
    expect(period.date).toBe('2026-09-15');
    expect(period.startTime).toBe('10:00');
    expect(period.endTime).toBe('14:00');
    expect(period.reason).toBe('Maintenance');
    expect(period.createdAt).toBeTruthy();
    expect(result.current.blockedPeriods).toHaveLength(1);
  });

  it('addBlockedPeriod appends to existing periods', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    act(() => {
      result.current.addBlockedPeriod({
        courtId: 'court-1',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'Maintenance',
      });
    });

    act(() => {
      result.current.addBlockedPeriod({
        courtId: 'court-2',
        date: '2026-09-16',
        startTime: '08:00',
        endTime: '12:00',
        reason: 'Event',
      });
    });

    expect(result.current.blockedPeriods).toHaveLength(2);
  });

  it('removeBlockedPeriod removes by id and returns true', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    let addedId: string = '';
    act(() => {
      const p = result.current.addBlockedPeriod({
        courtId: 'court-1',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'Maintenance',
      });
      addedId = p.id;
    });

    let removed: boolean = false;
    act(() => {
      removed = result.current.removeBlockedPeriod(addedId);
    });

    expect(removed).toBe(true);
    expect(result.current.blockedPeriods).toHaveLength(0);
  });

  it('removeBlockedPeriod returns false for non-existent id', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    let removed: boolean = false;
    act(() => {
      removed = result.current.removeBlockedPeriod('non-existent');
    });

    expect(removed).toBe(false);
    expect(result.current.blockedPeriods).toHaveLength(0);
  });

  it('getBlockedPeriodsForCourt filters by courtId', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    act(() => {
      result.current.addBlockedPeriod({
        courtId: 'court-1',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'A',
      });
    });

    act(() => {
      result.current.addBlockedPeriod({
        courtId: 'court-2',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'B',
      });
    });

    const filtered = result.current.getBlockedPeriodsForCourt('court-1');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].courtId).toBe('court-1');
  });

  it('getBlockedPeriodsForCourtDate filters by both courtId and date', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    act(() => {
      result.current.addBlockedPeriod({
        courtId: 'court-1',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'A',
      });
    });

    act(() => {
      result.current.addBlockedPeriod({
        courtId: 'court-1',
        date: '2026-09-16',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'B',
      });
    });

    const filtered = result.current.getBlockedPeriodsForCourtDate('court-1', '2026-09-15');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].date).toBe('2026-09-15');
  });

  it('getBlockedPeriodsForCourtDate returns empty for unmatched date', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    act(() => {
      result.current.addBlockedPeriod({
        courtId: 'court-1',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'A',
      });
    });

    const filtered = result.current.getBlockedPeriodsForCourtDate('court-1', '2026-12-25');
    expect(filtered).toHaveLength(0);
  });

  it('getBlockedPeriodsForCourt returns empty for unknown court', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    act(() => {
      result.current.addBlockedPeriod({
        courtId: 'court-1',
        date: '2026-09-15',
        startTime: '10:00',
        endTime: '14:00',
        reason: 'A',
      });
    });

    expect(result.current.getBlockedPeriodsForCourt('unknown')).toHaveLength(0);
  });

  it('setState directly replaces blockedPeriods', () => {
    const { result } = renderHook(() => useBlockedPeriodStore());

    act(() => {
      useBlockedPeriodStore.setState({
        blockedPeriods: [
          {
            id: 'bp-custom',
            courtId: 'court-x',
            date: '2026-10-01',
            startTime: '09:00',
            endTime: '17:00',
            reason: 'Holiday',
            createdAt: '2026-09-01T00:00:00.000Z',
          },
        ],
      });
    });

    expect(result.current.blockedPeriods).toHaveLength(1);
    expect(result.current.blockedPeriods[0].id).toBe('bp-custom');
  });
});
