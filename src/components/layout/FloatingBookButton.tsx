'use client';

import Link from 'next/link';
import { CalendarCheck } from 'lucide-react';
import { motion } from 'framer-motion';

export function FloatingBookButton() {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="lg:hidden fixed bottom-6 right-6 z-30"
    >
      <Link
        href="/book"
        className="flex items-center gap-2.5 px-5 py-3.5 rounded-full bg-green-600 text-white font-bold text-sm shadow-xl shadow-green-600/30 hover:bg-green-700 active:scale-95 transition-all"
      >
        <CalendarCheck className="w-5 h-5" />
        <span>Book Court</span>
      </Link>
    </motion.div>
  );
}
