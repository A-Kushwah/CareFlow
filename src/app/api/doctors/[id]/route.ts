import { NextResponse } from 'next/server';
import { getDoctorById } from '@/lib/doctors/service';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const doctor = await getDoctorById(params.id);
    if (!doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 });
    }
    return NextResponse.json({ doctor });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch doctor details' }, { status: 500 });
  }
}
