import { NextResponse } from 'next/server';
import { getCourtsFromSupabase } from '@/services/court.service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get('sport');

  let results = await getCourtsFromSupabase(sport && sport !== 'All' ? sport : undefined);

  return NextResponse.json({
    success: true,
    data: results,
    count: results.length,
  });
}
