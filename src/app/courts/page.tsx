'use client';

import { useState, useEffect, useCallback } from 'react';
import { getCourtsFromSupabase } from '@/services/court.service';
import { CourtCard } from '@/features/courts/CourtCard';
import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { FilterChips } from '@/components/ui/FilterChips';
import { Search, Filter, Trophy, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Court } from '@/types';

export default function CourtsPage() {
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>('All');
  const [indoorFilter, setIndoorFilter] = useState<'All' | 'Indoor' | 'Outdoor'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCourts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCourtsFromSupabase();
      setCourts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourts();
  }, [fetchCourts]);

  const filteredCourts = courts.filter((court) => {
    const matchesSport = selectedSport === 'All' || court.sportType === selectedSport;
    const matchesIndoor =
      indoorFilter === 'All' ||
      (indoorFilter === 'Indoor' && court.isIndoor) ||
      (indoorFilter === 'Outdoor' && !court.isIndoor);
    const matchesSearch =
      court.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      court.description.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSport && matchesIndoor && matchesSearch;
  });

  return (
    <div className="space-y-6 sm:space-y-10">
      {/* Page Hero — unified with .page-hero class */}
      <section className="bg-white border-b border-gray-200/80 py-6 sm:py-10">
        <SiteContainer>
          {/* Section head: badge + title + subtitle — unified left margin */}
          <div className="section-head">
            <Badge variant="brand" size="sm" icon={<Trophy className="icon-inline text-green-600" />}>
              K-HUB Sports Arenas
            </Badge>
            <h1 className="text-3xl lg:text-4xl font-black text-gray-900 tracking-tight">Browse All Courts</h1>
            <p className="text-sm sm:text-base text-muted max-w-2xl leading-relaxed">
              Select your preferred court, check live availability, and reserve time slots instantly with zero overlap.
            </p>
          </div>

          {/* Filter bar — below subtitle with consistent spacing */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4 bg-white p-4 lg:p-5 rounded-[var(--radius-xl)] border border-gray-200/80 shadow-sm">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" size={20} strokeWidth={2} />
              <input
                type="text"
                placeholder="Search court name, turf type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search courts"
                className="w-full h-12 sm:h-14 pl-12 sm:pl-16 pr-4 sm:pr-5 text-sm sm:text-base font-medium text-gray-900 bg-white border border-gray-200 rounded-2xl shadow-sm placeholder:text-gray-400 hover:border-gray-300 focus:outline-none focus:border-green-600 focus:shadow-[0_0_0_3px_rgba(22,163,74,0.1)] transition-all duration-200"
              />
            </div>

            {/* Standardized FilterChips components — replaces ad-hoc inline buttons */}
            <div className="flex flex-wrap items-center gap-3">
              <FilterChips
                options={['All', 'Padel', 'Football', 'Tennis']}
                value={selectedSport}
                onChange={setSelectedSport}
              />
              <FilterChips
                options={['All', 'Indoor', 'Outdoor']}
                value={indoorFilter}
                onChange={(v) => setIndoorFilter(v as 'All' | 'Indoor' | 'Outdoor')}
                darkActive
              />
            </div>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer as="section" className="pb-12">
        <div className="flex items-center justify-between mb-8">
          <p className="text-xs font-bold text-muted">
            Showing <span className="text-gray-900 font-extrabold">{loading ? '—' : filteredCourts.length}</span> courts
          </p>
        </div>

        {loading ? (
          <div className="bg-white rounded-[var(--radius-xl)] p-12 text-center border border-gray-200 max-w-md mx-auto my-12">
            <RefreshCw className="w-8 h-8 text-green-600 mx-auto mb-3 animate-spin" />
            <h3 className="font-extrabold text-gray-900 text-base">Loading courts...</h3>
            <p className="text-xs text-muted mt-1">Connecting to database</p>
          </div>
        ) : error ? (
          <div className="bg-white rounded-[var(--radius-xl)] p-12 text-center border border-red-200 max-w-md mx-auto my-12">
            <AlertTriangle className="w-10 h-10 text-red-500 mx-auto mb-3" />
            <h3 className="font-extrabold text-gray-900 text-base">Failed to load courts</h3>
            <p className="text-xs text-muted mt-1 mb-4">{error}</p>
            <Button onClick={fetchCourts} variant="primary" size="sm">
              <RefreshCw className="w-4 h-4" />
              <span>Retry</span>
            </Button>
          </div>
        ) : filteredCourts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8 items-stretch w-full">
            {filteredCourts.map((court) => (
              <CourtCard key={court.id} court={court} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-[var(--radius-xl)] p-12 text-center border border-gray-200 max-w-md mx-auto my-12">
            <Filter className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-extrabold text-gray-900 text-base">No courts match your search</h3>
            <p className="text-xs text-muted mt-1">Try resetting your sport or indoor/outdoor filters</p>
            <Button
              onClick={() => {
                setSelectedSport('All');
                setIndoorFilter('All');
                setSearchQuery('');
              }}
              variant="primary"
              size="sm"
              className="mt-4"
            >
              Reset Filters
            </Button>
          </div>
        )}
      </SiteContainer>
    </div>
  );
}
