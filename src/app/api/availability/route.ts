import { NextRequest, NextResponse } from 'next/server';
import { getPublicCourtAvailabilityAction } from '@/app/actions/booking.actions';

/**
 * GET /api/availability?date=YYYY-MM-DD&courtId=UUID
 *
 * Public availability endpoint:
 * Returns sanitized court slots and active bookings with ZERO PII.
 * Open to all users (authenticated, unauthenticated, guests).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');
    const courtId = searchParams.get('courtId') || undefined;

    if (!date) {
      return NextResponse.json(
        { success: false, error: 'Query parameter "date" is required.' },
        { status: 400 }
      );
    }

    const result = await getPublicCourtAvailabilityAction({ date, courtId });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to retrieve availability.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.bookings,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
