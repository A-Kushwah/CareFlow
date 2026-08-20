import { NextResponse } from 'next/server';
import { applyDoctorLeave } from '@/lib/doctors/service';
import { requireAuth } from '@/lib/auth/guard';
import { Role } from '@/lib/types';

export async function POST(req: Request) {
  const { errorResponse, session } = await requireAuth([Role.ADMIN, Role.DOCTOR]);
  if (errorResponse) return errorResponse;

  try {
    const { doctorId, startDate, endDate, reason } = await req.json();

    const targetDoctorId = doctorId || session?.doctorId;
    if (!targetDoctorId) {
      return NextResponse.json({ error: 'Doctor ID is required' }, { status: 400 });
    }

    if (!startDate || !endDate || !reason) {
      return NextResponse.json({ error: 'startDate, endDate, and reason are required' }, { status: 400 });
    }

    const result = await applyDoctorLeave(targetDoctorId, startDate, endDate, reason);
    return NextResponse.json({
      message: 'Doctor leave granted successfully',
      result,
    }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to submit doctor leave' }, { status: 400 });
  }
}
