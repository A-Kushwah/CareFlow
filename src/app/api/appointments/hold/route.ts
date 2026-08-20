import { NextResponse } from 'next/server';
import { createSlotHold } from '@/lib/booking/concurrency';

export async function POST(req: Request) {
  try {
    const { doctorId, patientId, startTime, endTime } = await req.json();

    if (!doctorId || !patientId || !startTime || !endTime) {
      return NextResponse.json({ error: 'doctorId, patientId, startTime, and endTime are required' }, { status: 400 });
    }

    const hold = await createSlotHold(doctorId, patientId, startTime, endTime);
    return NextResponse.json({ message: 'Slot hold reserved for 5 minutes', hold }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to hold slot' }, { status: 409 });
  }
}
