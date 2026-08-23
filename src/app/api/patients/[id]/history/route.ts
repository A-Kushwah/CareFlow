import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { Role } from '@/lib/types';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized session' }, { status: 401 });
  if (session.role !== Role.DOCTOR && session.role !== Role.ADMIN) return NextResponse.json({ error: 'Only the assigned doctor can view patient history' }, { status: 403 });
  if (session.role === Role.DOCTOR) {
    const doctor = await prisma.doctorProfile.findUnique({ where: { userId: session.userId } });
    if (!doctor) return NextResponse.json({ error: 'Doctor profile not found' }, { status: 404 });
    const assignedVisit = await prisma.appointment.findFirst({ where: { doctorId: doctor.id, patientId: params.id } });
    if (!assignedVisit) return NextResponse.json({ error: 'This patient has no visit history with you' }, { status: 403 });
  }
  const patient = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, name: true, email: true } });
  if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
  const visits = await prisma.appointment.findMany({
    where: { patientId: params.id, ...(session.role === Role.DOCTOR ? { doctor: { userId: session.userId } } : {}) },
    include: { doctor: { select: { id: true, specialty: true, user: { select: { name: true } } } } },
    orderBy: { startTime: 'desc' },
  });
  const reminders = await prisma.medicationReminder.findMany({ where: { patientId: params.id }, orderBy: { createdAt: 'desc' } });
  return NextResponse.json({ success: true, patient, visits, reminders });
}
