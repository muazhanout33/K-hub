import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 24h → 12h display. Locale-aware: Arabic renders ص/م.
 * Existing tests/callers keep the default English behavior.
 */
export function to12Hour(time24: string, locale: "en" | "ar" = "en"): string {
  const [h, m] = time24.split(":").map(Number);
  const period = locale === "ar" ? (h >= 12 ? "م" : "ص") : h >= 12 ? "PM" : "AM";
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}
