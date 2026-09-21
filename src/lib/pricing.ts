/**
 * Shared price calculation utility.
 * Canonical source — used by server actions, API routes, and client components.
 *
 * All monetary values are in EGP piastres (integer) to avoid floating-point errors.
 * pricePerHour is converted to piastres, then multiplied and divided by 60,
 * with final rounding to nearest piastre.
 *
 * @param pricePerHour - Price in EGP (e.g. 400, 299.99, 95)
 * @param durationMinutes - Duration in minutes (30, 45, 60, 90, etc.)
 * @returns Price in EGP as a number, rounded to nearest piastre (2 decimal places)
 */
export function calculateBookingPrice(
  pricePerHour: number,
  durationMinutes: number
): number {
  // Convert to integer piastres (1 EGP = 100 piastres)
  const piastresPerHour = Math.round(pricePerHour * 100);
  // Calculate total piastres, then convert back to EGP
  const totalPiastres = Math.round((piastresPerHour * durationMinutes) / 60);
  return totalPiastres / 100;
}

/**
 * Format a price value for display with consistent 2 decimal places.
 * @param price - Price in EGP
 * @returns Formatted string like "350.00" or "47.50"
 */
export function formatPrice(price: number): string {
  return price.toFixed(2);
}
