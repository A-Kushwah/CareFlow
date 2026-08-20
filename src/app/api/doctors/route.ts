import { NextResponse } from 'next/server';
import { getDoctorCatalog } from '@/lib/doctors/service';

export async function GET() {
  try {
    const doctors = await getDoctorCatalog();
    return NextResponse.json({ doctors });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to fetch doctors' }, { status: 500 });
  }
}
