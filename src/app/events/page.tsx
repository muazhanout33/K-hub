'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getEvents } from '@/services/event.service';
import { EventItem } from '@/types';

import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/button';
import { PartyPopper, Users, Calendar, MapPin, Trophy } from 'lucide-react';
import { toast } from 'sonner';

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getEvents()
      .then(setEvents)
      .finally(() => setLoading(false));
  }, []);

  const handleRegister = (title: string) => {
    toast.success(`Registered for ${title}! Check your email for tournament details.`);
  };

  return (
    <div className="pb-12">
      <section className="bg-white dark:bg-[#171F1A] border-b border-gray-200/80 dark:border-[#344239] py-8 sm:py-14 text-center">
        <SiteContainer>
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-center">
              <Badge icon={<PartyPopper className="w-4 h-4 text-green-600" />} size="sm">
                Club Tournaments &amp; Events
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 dark:text-[#F5F7F5] tracking-tight leading-[1.05]">
              Compete &amp; Showcase Your Skill
            </h1>
            <p className="text-sm text-gray-600 dark:text-[#A1ADA4] max-w-xl mx-auto leading-relaxed">
              From Friday 5v5 leagues to open Padel championships — join official WEGO tournaments and compete for club honors.
            </p>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer as="section" className="py-10 sm:py-16">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted">
            Loading scheduled events...
          </div>
        ) : events.length === 0 ? (
          <div className="max-w-xl mx-auto surface-card p-8 sm:p-12 text-center rounded-[var(--radius-xl)]">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-50 dark:bg-green-950/40 text-green-600 dark:text-[#4ADE80] flex items-center justify-center mb-5 border border-green-200 dark:border-green-800/40">
              <Trophy className="w-7 h-7" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-gray-900 dark:text-[#F5F7F5] tracking-tight">
              No Tournaments Scheduled Currently
            </h2>
            <p className="text-sm text-muted mt-3 mb-6 leading-relaxed">
              We organize regular seasonal leagues, weekend cups, and corporate tournaments. Check back soon for the next tournament announcement, or reach out to host a private tournament.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                render={<Link href="/contact" />}
                nativeButton={false}
                variant="primary"
                size="md"
              >
                <span>Inquire About Hosting</span>
              </Button>
              <Button
                render={<Link href="/book" />}
                nativeButton={false}
                variant="secondary"
                size="md"
              >
                <span>Book a Court</span>
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
            {events.map((event) => (
              <div
                key={event.id}
                className="surface-card rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-[3/2] w-full bg-gray-100 dark:bg-[#171F1A]">
                    <Image
                      src={event.image}
                      alt={event.title}
                      fill
                      sizes="(max-width: 640px) 100vw, 400px"
                      className="object-cover"
                    />
                    <span className="absolute top-3 left-3 px-2.5 py-1 rounded-[var(--radius-pill)] bg-black/70 backdrop-blur-xs text-white text-[11px] font-extrabold border border-white/10 shadow-xs">
                      {event.sportType}
                    </span>
                  </div>

                  <div className="p-4 sm:p-6 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-green-600 dark:text-[#4ADE80]">
                      <Calendar className="w-[16px] h-[16px]" />
                      <span>{event.date} · {event.time}</span>
                    </div>
                    <h3 className="font-extrabold text-xl text-gray-900 dark:text-[#F5F7F5]">{event.title}</h3>
                    <p className="text-sm text-gray-600 dark:text-[#A1ADA4] leading-relaxed">{event.description}</p>

                    <div className="pt-3 border-t border-gray-100 dark:border-[#344239] space-y-1.5 text-xs text-gray-600 dark:text-[#A1ADA4] font-medium">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-[14px] h-[14px] text-gray-400" />
                        <span>{event.location}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Trophy className="w-[14px] h-[14px] text-gray-400" />
                        <span>Organized by {event.organizer}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 sm:p-6 pt-0 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-gray-900 dark:text-[#F5F7F5] bg-gray-50 dark:bg-[#171F1A] p-3.5 rounded-xl border border-gray-100 dark:border-[#344239]">
                    <span className="flex items-center gap-1.5 text-gray-700 dark:text-[#F5F7F5]">
                      <Users className="w-[16px] h-[16px] text-green-600 dark:text-[#4ADE80]" />
                      {event.currentParticipants} / {event.maxParticipants} Players
                    </span>
                    <span className="text-sm font-extrabold text-green-700 dark:text-[#4ADE80]">EGP {event.entryFee} Entry</span>
                  </div>

                  <Button
                    onClick={() => handleRegister(event.title)}
                    variant="primary"
                    size="sm"
                    className="w-full"
                  >
                    Register Now
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SiteContainer>
    </div>
  );
}
