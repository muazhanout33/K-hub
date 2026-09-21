import { NextResponse } from 'next/server';
import { getCourtByIdFromSupabase } from '@/services/court.service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const court = await getCourtByIdFromSupabase(id);

  if (!court) {
    return NextResponse.json(
      { success: false, error: 'Court not found' },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: court,
  });
}
