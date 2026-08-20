import { NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/booking/availability';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');
  const date = searchParams.get('date');

  if (!doctorId || !date) {
    return NextResponse.json({ error: 'doctorId and date (YYYY-MM-DD) query parameters are required' }, { status: 400 });
  }

  try {
    const data = await getAvailableSlots(doctorId, date);
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch available slots' }, { status: 500 });
  }
}
