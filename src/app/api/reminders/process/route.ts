import { NextResponse } from 'next/server';
import { processMedicationReminders } from '@/lib/reminders/service';

export async function POST() {
  try {
    const result = await processMedicationReminders();
    return NextResponse.json({ message: 'Medication reminder job run completed', result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Reminder processing failed' }, { status: 500 });
  }
}
