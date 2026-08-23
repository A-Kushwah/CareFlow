'use client';

import { useEffect, useMemo, useState } from 'react';

function formatDayOfWeek(value: string) {
  return new Date(value).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeRange(startTime: string, endTime: string) {
  const start = new Date(startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const end = new Date(endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${start} — ${end}`;
}

export default function PatientDashboard() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [reminders, setReminders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [appointmentsRes, remindersRes] = await Promise.all([
        fetch('/api/appointments'),
        fetch('/api/reminders'),
      ]);
      const appointmentsData = await appointmentsRes.json();
      const remindersData = await remindersRes.json();
      if (!appointmentsRes.ok) throw new Error(appointmentsData.error || 'Unable to load appointments');
      setAppointments(appointmentsData.appointments || []);
      setReminders(remindersData.reminders || []);
    } catch (err: any) {
      setError(err.message || 'Unable to load your care record');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const doctors = useMemo(() => {
    const grouped = new Map<string, any>();
    appointments.forEach((appointment) => {
      const id = appointment.doctor?.id || appointment.doctorId;
      if (!grouped.has(id)) grouped.set(id, { doctor: appointment.doctor, visits: [] });
      grouped.get(id).visits.push(appointment);
    });
    return Array.from(grouped.values());
  }, [appointments]);

  const upcomingAppointments = useMemo(() => {
    return appointments.filter((a) => a.status === 'CONFIRMED' || a.status === 'HELD');
  }, [appointments]);

  const completedAppointments = useMemo(() => {
    return appointments.filter((a) => a.status === 'COMPLETED' || a.status === 'CANCELLED');
  }, [appointments]);

  const handleRetryExplanation = async (appointment: any) => {
    let parsedNotes: any = null;
    if (appointment.consultNotes) {
      try {
        parsedNotes = JSON.parse(appointment.consultNotes);
      } catch {
        parsedNotes = null;
      }
    }

    const notesText = parsedNotes?.notes || appointment.consultNotes || 'Follow-up consultation';
    const followUp = parsedNotes?.followUpInstructions || '';
    const prescriptions = appointment.prescriptions || parsedNotes?.prescriptions || [];

    setRetryingId(appointment.id);
    setError('');

    try {
      const res = await fetch('/api/ai/post-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: appointment.id,
          notes: notesText,
          followUpInstructions: followUp,
          prescriptions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to retry explanation');
      await load();
    } catch (err: any) {
      setError(err.message || 'Retry explanation failed');
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8" aria-label="Patient Workspace">
      {/* Workspace Header */}
      <header className="neu-panel p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#16866D]">Patient Workspace</span>
          <h1 className="text-2xl font-extrabold text-[#26323B] mt-1">Your Care Record & Follow-Up Portal</h1>
          <p className="text-xs font-medium text-[#56616B] mt-1">
            Doctor-authored prescriptions, visit timelines, and AI explanations organized in one place.
          </p>
        </div>
        <button onClick={load} className="neu-btn-secondary text-xs font-bold self-start sm:self-auto min-h-[44px]">
          Refresh Record
        </button>
      </header>

      {error && (
        <div className="p-4 bg-[#FEEFEE] border-l-4 border-[#B42318] text-xs font-bold text-[#B42318] rounded-r-xl">
          {error}
        </div>
      )}

      {loading ? (
        <div className="neu-panel py-16 text-center text-sm font-semibold text-[#56616B]">
          Loading schedule…
        </div>
      ) : (
        <>
          {/* Top Quick Metrics */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-5" aria-label="Care record metrics">
            <div className="neu-card p-5 border border-[#EEF2F7]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#66727D]">Upcoming Visits</p>
              <p className="text-3xl font-extrabold text-[#26323B] mt-2">{upcomingAppointments.length}</p>
            </div>
            <div className="neu-card p-5 border border-[#EEF2F7]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#66727D]">Completed Consultations</p>
              <p className="text-3xl font-extrabold text-[#26323B] mt-2">
                {appointments.filter((a) => a.status === 'COMPLETED').length}
              </p>
            </div>
            <div className="neu-card p-5 border border-[#EEF2F7]">
              <p className="text-xs font-bold uppercase tracking-wider text-[#66727D]">Active Medication Reminders</p>
              <p className="text-3xl font-extrabold text-[#16866D] mt-2">
                {reminders.filter((r) => r.status === 'ACTIVE').length}
              </p>
            </div>
          </section>

          {/* Priority 1: Upcoming Appointments */}
          <section className="neu-panel p-6 space-y-6" aria-labelledby="upcoming-heading">
            <div>
              <h2 id="upcoming-heading" className="text-lg font-bold text-[#26323B]">1. Upcoming Appointments</h2>
              <p className="text-xs font-medium text-[#56616B] mt-0.5">Your scheduled consultations with CarePulse specialists.</p>
            </div>

            {upcomingAppointments.length === 0 ? (
              <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
                No upcoming appointments currently scheduled. Select a specialist below to book a slot.
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingAppointments.map((appointment) => (
                  <article key={appointment.id} className="neu-card p-6 border border-[#EEF2F7] space-y-4">
                    <div className="grid md:grid-cols-[260px_1fr_auto] gap-6 items-start">
                      {/* Prominent Date & Time Typography */}
                      <div className="neu-inset p-4 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#5667D8]">Scheduled Date</span>
                        <time className="block text-lg font-extrabold text-[#26323B]">
                          {formatDayOfWeek(appointment.startTime)}
                        </time>
                        <time className="block text-base font-bold text-[#5667D8]">
                          {formatTimeRange(appointment.startTime, appointment.endTime)}
                        </time>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-base font-bold text-[#26323B]">{appointment.doctor?.user?.name || 'Assigned Specialist'}</h3>
                          <span className="clinical-badge-neutral">{appointment.doctor?.specialty || 'Medical Consultation'}</span>
                        </div>
                        {appointment.symptoms && (
                          <div className="text-xs text-[#56616B] bg-[#EEF2F7] p-2.5 rounded-xl border border-[#D4D9E2]">
                            <strong className="text-[#26323B] font-bold">Reported Symptoms:</strong> {appointment.symptoms}
                          </div>
                        )}
                      </div>

                      <span className={`clinical-badge-${appointment.status === 'CONFIRMED' ? 'success' : 'warning'}`}>
                        {appointment.status}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          {/* Priority 2: Previous Consultations & Doctor-Authored Prescriptions */}
          <section className="neu-panel p-6 space-y-6" aria-labelledby="consultations-heading">
            <div>
              <h2 id="consultations-heading" className="text-lg font-bold text-[#26323B]">2. Previous Consultations & Clinical Records</h2>
              <p className="text-xs font-medium text-[#56616B] mt-0.5">
                Completed consultation summaries, doctor-authored prescriptions, and AI follow-up explanations.
              </p>
            </div>

            {completedAppointments.length === 0 ? (
              <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
                No completed consultation records found.
              </div>
            ) : (
              <div className="space-y-6">
                {completedAppointments.map((appointment) => {
                  let summary: any = null;
                  try {
                    summary = appointment.aiPostSummary ? JSON.parse(appointment.aiPostSummary) : null;
                  } catch {
                    summary = null;
                  }

                  let parsedNotes: any = null;
                  if (appointment.consultNotes) {
                    try {
                      parsedNotes = JSON.parse(appointment.consultNotes);
                    } catch {
                      parsedNotes = null;
                    }
                  }

                  const activePrescriptions = appointment.prescriptions?.length > 0
                    ? appointment.prescriptions
                    : (parsedNotes?.prescriptions || []);

                  const isAiAvailable = summary && !summary.error;
                  const isAiUnavailable = appointment.status === 'COMPLETED' && (!summary || summary.error);

                  return (
                    <article key={appointment.id} className="neu-card p-6 border border-[#EEF2F7] space-y-5">
                      {/* Prominent Date & Time Header */}
                      <div className="grid md:grid-cols-[260px_1fr_auto] gap-6 items-start border-b border-[#D4D9E2] pb-4">
                        <div className="neu-inset p-4 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#66727D]">Consultation Date</span>
                          <time className="block text-base font-extrabold text-[#26323B]">
                            {formatDayOfWeek(appointment.startTime)}
                          </time>
                          <time className="block text-sm font-bold text-[#56616B]">
                            {formatTimeRange(appointment.startTime, appointment.endTime)}
                          </time>
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-[#26323B]">{appointment.doctor?.user?.name || 'Assigned Clinician'}</h3>
                            <span className="clinical-badge-neutral">{appointment.doctor?.specialty || 'General Consultation'}</span>
                          </div>
                          <p className="text-xs font-semibold text-[#66727D] mt-1">CarePulse Authenticated Visit Record</p>
                        </div>
                        <span className="clinical-badge-neutral">{appointment.status}</span>
                      </div>

                      {/* What you reported */}
                      {appointment.symptoms && (
                        <div className="bg-[#EEF2F7] border border-[#D4D9E2] rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#56616B]">What You Reported:</span>
                          <p className="text-xs font-semibold text-[#26323B]">{appointment.symptoms}</p>
                        </div>
                      )}

                      {/* Clinician Notes */}
                      {appointment.consultNotes && (
                        <div className="bg-[#EEF2F7] border border-[#D4D9E2] rounded-2xl p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#26323B] flex items-center gap-2">
                              <span>Clinician Consultation Notes</span>
                              <span className="clinical-badge-neutral">Clinician-Entered</span>
                            </h4>
                          </div>
                          {parsedNotes ? (
                            <div className="text-xs text-[#26323B] space-y-1.5 font-medium">
                              {parsedNotes.notes && <p className="whitespace-pre-wrap"><strong className="font-bold text-[#26323B]">Observations:</strong> {parsedNotes.notes}</p>}
                              {parsedNotes.assessment && <p><strong className="font-bold text-[#26323B]">Assessment:</strong> {parsedNotes.assessment}</p>}
                              {parsedNotes.followUpInstructions && <p><strong className="font-bold text-[#26323B]">Follow-Up Instructions:</strong> {parsedNotes.followUpInstructions}</p>}
                            </div>
                          ) : (
                            <p className="text-xs font-medium text-[#26323B] whitespace-pre-wrap">{appointment.consultNotes}</p>
                          )}
                        </div>
                      )}

                      {/* Doctor-Authored Prescriptions (Prescription Model) */}
                      {activePrescriptions.length > 0 && (
                        <div className="bg-[#E6F4F1] border-2 border-[#16866D] rounded-2xl p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between border-b border-[#9EE2D4] pb-2.5 gap-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#16866D]">Doctor-Authored Prescriptions</h4>
                              <span className="clinical-badge-success">Clinician-Confirmed</span>
                            </div>
                            <span className="text-xs font-bold text-[#16866D]">Prescribed by {appointment.doctor?.user?.name || 'Clinician'}</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {activePrescriptions.map((p: any, idx: number) => (
                              <div key={idx} className="bg-white border border-[#9EE2D4] rounded-xl p-4 text-xs space-y-2 shadow-sm">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <span className="font-extrabold text-[#26323B] text-sm">{p.medication}</span>
                                  <span className="clinical-badge-success">{p.dosage}</span>
                                </div>
                                <div className="text-[#26323B] space-y-1 font-medium">
                                  <p><span className="font-bold text-[#56616B]">Frequency:</span> {p.frequency}</p>
                                  <p><span className="font-bold text-[#56616B]">Duration:</span> {p.duration || '7 days'}</p>
                                  {p.instructions && (
                                    <p className="text-[#56616B] italic mt-1"><span className="font-bold not-italic text-[#26323B]">Instructions:</span> {p.instructions}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Patient Status Badges & AI Explanation Container */}
                      {isAiAvailable && (
                        <div className="bg-[#EEF2F7] border border-[#5667D8]/30 rounded-2xl p-5 text-xs space-y-3">
                          <div className="flex items-center justify-between border-b border-[#D4D9E2] pb-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xs uppercase tracking-wide text-[#5667D8]">Patient-Friendly Explanation</h4>
                              <span className="clinical-badge-neutral bg-[#E8EAFA] text-[#5667D8] border-[#5667D8]/30">
                                AI explanation available
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-[#66727D]">Separately Formatted</span>
                          </div>

                          <p className="leading-5 font-medium text-[#26323B]">{summary.summary}</p>

                          {summary.patientInstructions?.length > 0 && (
                            <div className="space-y-1">
                              <p className="font-bold text-[#26323B]">Follow-up instructions to consider:</p>
                              <ul className="list-disc pl-4 space-y-0.5 text-[#56616B]">
                                {summary.patientInstructions.map((item: string, i: number) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <p className="text-[11px] italic text-[#66727D] border-t border-[#D4D9E2] pt-2">{summary.disclaimer}</p>
                        </div>
                      )}

                      {isAiUnavailable && (
                        <div className="bg-[#FFF8EB] border-2 border-[#A86B00] rounded-2xl p-5 text-xs space-y-3 text-[#A86B00]">
                          <div className="flex flex-wrap items-center justify-between border-b border-[#F7D89C] pb-2 gap-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xs uppercase tracking-wide">Patient Summary Status</h4>
                              <span className="clinical-badge-warning">
                                AI explanation unavailable — clinician instructions are still available
                              </span>
                            </div>
                            <button
                              onClick={() => handleRetryExplanation(appointment)}
                              disabled={retryingId === appointment.id}
                              className="neu-btn-secondary text-xs min-h-[44px]"
                            >
                              {retryingId === appointment.id ? 'Retrying…' : 'Retry explanation'}
                            </button>
                          </div>

                          <p className="font-medium leading-5">
                            Your clinician consultation notes and prescriptions above are fully preserved and confirmed. The AI-formatted explanation is temporarily unavailable.
                          </p>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Priority 3 & 4: Active Reminders & History by Clinician */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-label="Reminders and Clinicians">
            <div className="neu-panel p-6 space-y-4">
              <h2 className="text-base font-bold text-[#26323B]">3. Active Medication Reminders</h2>
              {reminders.length === 0 ? (
                <p className="text-xs font-semibold text-[#66727D]">No active medication reminders recorded.</p>
              ) : (
                <div className="space-y-3">
                  {reminders.map((r) => (
                    <div key={r.id} className="neu-inset p-3.5 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-[#26323B]">{r.medication} · {r.dosage}</span>
                        <span className="clinical-badge-success">{r.status}</span>
                      </div>
                      <p className="text-[#56616B] font-medium">{r.frequency} ({r.duration || '7 days'})</p>
                      {r.instructions && <p className="text-[#66727D] italic text-[11px]">{r.instructions}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="neu-panel p-6 space-y-4">
              <h2 className="text-base font-bold text-[#26323B]">4. History by Clinician</h2>
              {doctors.length === 0 ? (
                <p className="text-xs font-semibold text-[#66727D]">Clinician history will appear after your first consultation.</p>
              ) : (
                <div className="space-y-3">
                  {doctors.map((group) => (
                    <div key={group.doctor?.id} className="neu-card p-4 flex items-center justify-between border border-[#EEF2F7]">
                      <div>
                        <p className="text-sm font-bold text-[#26323B]">{group.doctor?.user?.name || 'Assigned Clinician'}</p>
                        <p className="text-xs font-semibold text-[#56616B]">{group.doctor?.specialty || 'Specialist'}</p>
                      </div>
                      <span className="clinical-badge-neutral">{group.visits.length} Visit{group.visits.length === 1 ? '' : 's'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
