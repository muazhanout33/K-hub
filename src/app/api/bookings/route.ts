import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { formatTstzrange, mapDbBookingToBooking } from '@/lib/mappers';
import { DbBooking } from '@/types/database.types';
import { getCourtByIdFromSupabase, getCourtInfoMap } from '@/services/court.service';
import { calculateBookingPrice } from '@/lib/pricing';

// ── Simple in-memory rate limiter ──
// Limits: 10 POST requests per 5-minute window per IP.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

// Periodic cleanup to prevent memory leak (every 10 min)
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 10 * 60 * 1000);

/**
 * GET /api/bookings
 * Returns the authenticated user's bookings from Supabase.
 * RLS ensures users can only read their own bookings.
 *
 * Middleware attaches x-supabase-user-id when it calls getUser(),
 * so this handler skips a redundant createClient() + getUser() call.
 * Falls back to full auth when invoked outside middleware (e.g. server actions).
 */
export async function GET(request: NextRequest) {
  try {
    const middlewareUserId = request.headers.get('x-supabase-user-id');

    let userId: string;
    let supabase: Awaited<ReturnType<typeof createClient>>;

    if (middlewareUserId) {
      // Middleware already authenticated — reuse its result.
      // The request object carries refreshed cookies from middleware's
      // setAll callback, so this client has a valid session.
      supabase = await createClient();
      userId = middlewareUserId;
    } else {
      // No middleware auth (direct call, server action, etc.) — full auth.
      supabase = await createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        return NextResponse.json(
          { success: false, error: 'Authentication required.' },
          { status: 401 }
        );
      }
      userId = authData.user.id;
    }

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const courtIds = [...new Set((data as DbBooking[]).map(b => b.court_id))];
    const courtInfoMap = await getCourtInfoMap(courtIds);

    const bookings = (data as DbBooking[]).map(b =>
      mapDbBookingToBooking(b, courtInfoMap.get(b.court_id))
    );

    return NextResponse.json({ success: true, data: bookings });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch bookings' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/bookings
 * Creates a new booking in Supabase.
 * Respects RLS and PostgreSQL EXCLUDE USING gist (prevent_double_booking).
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 bookings per 5 min per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? request.headers.get('x-real-ip')
      ?? 'unknown';
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many booking requests. Please try again later.' },
        { status: 429 }
      );
    }

    const middlewareUserId = request.headers.get('x-supabase-user-id');
    const middlewareUserEmail = request.headers.get('x-supabase-user-email') ?? '';

    let userId: string;
    let userEmail: string;
    let supabase: Awaited<ReturnType<typeof createClient>>;

    if (middlewareUserId) {
      supabase = await createClient();
      userId = middlewareUserId;
      userEmail = middlewareUserEmail;
    } else {
      supabase = await createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) {
        return NextResponse.json(
          { success: false, error: 'Please sign in to book a court.' },
          { status: 401 }
        );
      }
      userId = authData.user.id;
      userEmail = authData.user.email ?? '';
    }

    const body = await request.json();

    if (!body.courtId || !body.date || !body.startTime) {
      return NextResponse.json(
        { success: false, error: 'Missing required booking fields (courtId, date, startTime)' },
        { status: 400 }
      );
    }

    // Fetch court from Supabase — no MOCK_COURTS
    const court = await getCourtByIdFromSupabase(body.courtId);
    if (!court) {
      return NextResponse.json(
        { success: false, error: 'Court not found.' },
        { status: 404 }
      );
    }

    const durationMinutes = body.durationMinutes || 60;

    // Calculate endTime if not provided
    let endTime = body.endTime;
    if (!endTime) {
      const [h, m] = body.startTime.split(':').map(Number);
      const totalMin = h * 60 + m + durationMinutes;
      const endH = Math.floor(totalMin / 60) % 24;
      const endM = totalMin % 60;
      endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    }

    const totalPrice = calculateBookingPrice(court.pricePerHour, durationMinutes);

    // Validate bookingSource
    const validSources = ['ONLINE', 'WALK_IN', 'ADMIN'] as const;
    const bookingSource = validSources.includes(body.bookingSource) ? body.bookingSource : 'ONLINE';

    const bookingNumber = `KH-${Math.floor(100000 + Math.random() * 900000)}`;
    const bookingRange = formatTstzrange(body.date, body.startTime, endTime);

    const { data, error } = await (supabase.from('bookings') as any)
      .insert({
        booking_number: bookingNumber,
        user_id: userId,
        court_id: body.courtId,
        booking_range: bookingRange,
        duration_minutes: durationMinutes,
        total_price: totalPrice,
        status: 'Reserved',
        booking_source: bookingSource,
        user_name: body.userName ?? userEmail ?? '',
        user_email: body.userEmail ?? userEmail ?? '',
        user_phone: body.userPhone ?? '',
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23P01' || error.message.includes('prevent_double_booking')) {
        return NextResponse.json(
          { success: false, error: 'This court slot has already been booked by another player.' },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const courtMap = await getCourtInfoMap([body.courtId]);
    const courtInfo = courtMap.get(body.courtId);
    const newBooking = mapDbBookingToBooking(data as DbBooking, courtInfo);

    return NextResponse.json({
      success: true,
      message: 'Booking created successfully',
      data: newBooking,
    }, { status: 201 });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Failed to process booking' },
      { status: 500 }
    );
  }
}
