'use client';

import { useState, useEffect } from 'react';
import { useBlockedPeriodStore } from './useBlockedPeriodStore';
import { getCourtsFromSupabase } from '@/services/court.service';
import { createClient } from '@/lib/supabase/client';
import { formatTstzrange } from '@/lib/mappers';
import { ShieldOff, Plus, Trash2, CalendarOff } from 'lucide-react';
import { toast } from 'sonner';
import { Court } from '@/types';

export function BlockedPeriodsManager() {
  const blockedPeriods = useBlockedPeriodStore((s) => s.blockedPeriods);
  const addBlockedPeriod = useBlockedPeriodStore((s) => s.addBlockedPeriod);
  const removeBlockedPeriod = useBlockedPeriodStore((s) => s.removeBlockedPeriod);

  const [courts, setCourts] = useState<Court[]>([]);
  const [courtId, setCourtId] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('07:00');
  const [endTime, setEndTime] = useState('12:00');
  const [reason, setReason] = useState('');

  useEffect(() => {
    getCourtsFromSupabase().then((data) => {
      setCourts(data);
      if (data.length > 0 && !courtId) {
        setCourtId(data[0].id);
      }
    });

    // H3: Load blocked periods from Supabase on mount
    const loadFromSupabase = async () => {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        if (!authData.user) return;

        const { data } = await supabase
          .from('blocked_periods')
          .select('*')
          .order('created_at', { ascending: false });

        if (data && data.length > 0) {
          const store = useBlockedPeriodStore.getState();
          // Sync Supabase records into localStorage (dedup by court+date+time)
          for (const row of data) {
            const dbRow = row as {
              id: string;
              court_id: string;
              blocked_range: string;
              reason: string | null;
              created_at: string;
            };
            // Parse TSTZRANGE to extract date/startTime/endTime
            const cleaned = dbRow.blocked_range.replace(/[\[\)"']/g, '').replace(/\+00/g, '');
            const [startStr, endStr] = cleaned.split(',');
            const startDate = new Date(startStr.trim());
            const endDate = new Date(endStr.trim());
            const date = startDate.toLocaleDateString('en-CA');
            const startTime = `${String(startDate.getHours()).padStart(2, '0')}:${String(startDate.getMinutes()).padStart(2, '0')}`;
            const endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;

            // Check if already in localStorage
            const exists = store.blockedPeriods.some(
              (bp) => bp.courtId === dbRow.court_id && bp.date === date && bp.startTime === startTime
            );
            if (!exists) {
              store.addBlockedPeriod({
                courtId: dbRow.court_id,
                date,
                startTime,
                endTime,
                reason: dbRow.reason ?? '',
              });
            }
          }
        }
      } catch {
        // Keep existing localStorage state on error
      }
    };
    loadFromSupabase();
  }, []);

  const handleAdd = async () => {
    if (!date || !reason) {
      toast.error('Please fill in date and reason.');
      return;
    }
    if (startTime === endTime) {
      toast.error('Start and end times cannot be the same.');
      return;
    }

    // H3: Persist to Supabase
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        toast.error('Authentication required.');
        return;
      }

      const bookingRange = formatTstzrange(date, startTime, endTime);
      const { error } = await (supabase.from('blocked_periods') as any).insert({
        court_id: courtId,
        blocked_range: bookingRange,
        reason,
        created_by: authData.user.id,
      });

      if (error) {
        if (error.code === '23P01' || error.message?.includes('prevent_overlapping_blocks')) {
          toast.error('This time range overlaps with an existing blocked period.');
          return;
        }
        toast.error('Failed to save to database. Saved locally only.');
      }
    } catch {
      // Proceed with localStorage-only save
    }

    // Always save to localStorage as well
    addBlockedPeriod({ courtId, date, startTime, endTime, reason });
    toast.success('Blocked period added.');
    setDate('');
    setReason('');
  };

  const handleRemove = async (id: string) => {
    // H3: Delete from Supabase (find by matching court+date+time)
    try {
      const supabase = createClient();
      const bp = blockedPeriods.find((b) => b.id === id);
      if (bp) {
        const bookingRange = formatTstzrange(bp.date, bp.startTime, bp.endTime);
        await supabase
          .from('blocked_periods')
          .delete()
          .eq('court_id', bp.courtId)
          .eq('blocked_range', bookingRange);
      }
    } catch {
      // Proceed with localStorage removal
    }

    removeBlockedPeriod(id);
    toast.success('Blocked period removed.');
  };

  const sorted = [...blockedPeriods].sort((a, b) => {
    const da = a.date.localeCompare(b.date);
    return da !== 0 ? da : a.startTime.localeCompare(b.startTime);
  });

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <ShieldOff className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-bold text-gray-700 uppercase">Blocked Periods</h2>
      </div>

      {/* Add form */}
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            value={courtId}
            onChange={(e) => setCourtId(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700 bg-white"
          >
            {courts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700"
            placeholder="Date"
          />
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700"
          />
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-xs font-medium text-gray-700"
              placeholder="Reason"
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-800 transition-colors flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
        </div>
      </div>

      {/* List */}
      {sorted.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-gray-500 flex flex-col items-center gap-2">
          <CalendarOff className="w-6 h-6 text-gray-400" />
          <p>No blocked periods defined.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-bold text-gray-500 uppercase border-b border-gray-100">
                <th className="px-6 py-3 text-left">Court</th>
                <th className="px-6 py-3 text-left">Date</th>
                <th className="px-6 py-3 text-left">Time</th>
                <th className="px-6 py-3 text-left">Reason</th>
                <th className="px-6 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sorted.map((bp) => {
                const court = courts.find((c) => c.id === bp.courtId);
                return (
                  <tr key={bp.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-3 text-gray-700 font-medium">{court?.name || bp.courtId}</td>
                    <td className="px-6 py-3 text-gray-700">{bp.date}</td>
                    <td className="px-6 py-3 text-gray-700">{bp.startTime}–{bp.endTime}</td>
                    <td className="px-6 py-3 text-gray-700">{bp.reason}</td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => handleRemove(bp.id)}
                        className="text-red-500 hover:text-red-700 transition-colors"
                        title="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
