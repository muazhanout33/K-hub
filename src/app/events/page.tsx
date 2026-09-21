'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { getEvents } from '@/services/event.service';
import { EventItem } from '@/types';

import { SiteContainer } from '@/components/layout/SiteContainer';
import { Badge } from '@/components/ui/Badge';
import { PartyPopper, Users, Calendar, MapPin, Trophy } from 'lucide-react';
import { toast } from 'sonner';

export default function EventsPage() {
  const [events, setEvents] = useState<EventItem[]>([]);

  useEffect(() => {
    getEvents().then(setEvents);
  }, []);

  const handleRegister = (title: string) => {
    toast.success(`Registered for ${title}! Check your email for tournament details.`);
  };

  return (
    <div className="pb-12">
      <section className="bg-white border-b border-gray-200/80 py-8 sm:py-14 text-center">
        <SiteContainer>
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex justify-center">
              <Badge icon={<PartyPopper className="w-4 h-4 text-green-600" />} size="sm">
                Club Tournaments & Events
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-gray-900 tracking-tight leading-[1.05]">Compete & Showcase Your Skill</h1>
            <p className="text-sm text-gray-600 max-w-xl mx-auto leading-relaxed">
              From Friday 5v5 leagues to open Padel championships — join official K-HUB tournaments and win cash prizes.
            </p>
          </div>
        </SiteContainer>
      </section>

      <SiteContainer as="section" className="py-10 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-stretch">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white rounded-3xl overflow-hidden border border-gray-200/80 shadow-md hover:shadow-xl transition-all flex flex-col justify-between"
            >
              <div>
                <div className="relative aspect-[3/2] w-full bg-gray-100">
                  <Image src={event.image} alt={event.title} fill sizes="(max-width: 640px) 100vw, 400px" className="object-cover" />
                  <span className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-xs font-extrabold">
                    {event.sportType}
                  </span>
                </div>

                <div className="p-4 sm:p-6 space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-green-600">
                    <Calendar className="w-[16px] h-[16px]" />
                    <span>{event.date} · {event.time}</span>
                  </div>
                  <h3 className="font-extrabold text-xl text-gray-900">{event.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{event.description}</p>

                  <div className="pt-3 border-t border-gray-100 space-y-1.5 text-xs text-gray-600 font-medium">
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
                <div className="flex items-center justify-between text-xs font-bold text-gray-900 bg-gray-50 p-3.5 rounded-xl border border-gray-100">
                  <span className="flex items-center gap-1.5 text-gray-700">
                    <Users className="w-[16px] h-[16px] text-green-600" />
                    {event.currentParticipants} / {event.maxParticipants} Players
                  </span>
                  <span className="text-sm font-extrabold text-green-700">EGP {event.entryFee} Entry</span>
                </div>

                <button
                  onClick={() => handleRegister(event.title)}
                  className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-extrabold text-xs shadow-md transition-colors"
                >
                  Register Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </SiteContainer>
    </div>
  );
}
