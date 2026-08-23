'use client';

import { useEffect, useMemo, useState } from 'react';

function formatDate(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
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
    <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Patient dashboard</p>
          <h1 className="text-2xl font-semibold text-slate-950">Your care record</h1>
          <p className="text-sm text-slate-500 mt-1">Appointments, doctor-authored prescriptions, and AI follow-up explanations in one place.</p>
        </div>
        <button onClick={load} className="btn-secondary text-xs">Refresh record</button>
      </div>

      {error && <div className="p-3 bg-rose-50 border-l-4 border-rose-600 text-xs text-rose-900">{error}</div>}

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading your care record…</div>
      ) : (
        <>
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">Total visits</p>
              <p className="text-2xl font-semibold mt-2">{appointments.length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">Completed consultations</p>
              <p className="text-2xl font-semibold mt-2">{appointments.filter((a) => a.status === 'COMPLETED').length}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500">Active reminders</p>
              <p className="text-2xl font-semibold mt-2">{reminders.filter((r) => r.status === 'ACTIVE').length}</p>
            </div>
          </section>

          {/* Appointments & Consultation Results Section */}
          <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Appointments and consultation results</h2>
              <p className="text-xs text-slate-500 mt-1">Doctor-authored prescriptions are preserved separately from AI-generated explanations.</p>
            </div>

            {appointments.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">No appointments yet. Use the Patient Portal to book a visit.</p>
            ) : (
              <div className="space-y-6">
                {appointments.map((appointment) => {
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
                    <article key={appointment.id} className="border border-slate-200 rounded-lg p-5 space-y-4 shadow-sm bg-white">
                      {/* Header bar */}
                      <div className="grid md:grid-cols-[220px_1fr_auto] gap-4 items-start border-b border-slate-100 pb-4">
                        <div className="border-r border-slate-200 pr-4">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Consultation Date</p>
                          <p className="text-base font-bold text-slate-950 mt-1">
                            {new Date(appointment.startTime).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-sm font-semibold text-slate-700 mt-0.5">
                            {new Date(appointment.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — {new Date(appointment.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-950">{appointment.doctor?.user?.name || 'Assigned clinician'}</h3>
                            <span className="bg-slate-100 text-slate-700 text-xs font-medium px-2.5 py-0.5 rounded">
                              {appointment.doctor?.specialty || 'Clinical Consultation'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">CarePulse Verified Clinician Record</p>
                        </div>
                        <span className={`badge-${appointment.status === 'CONFIRMED' ? 'emerald' : appointment.status === 'COMPLETED' ? 'slate' : 'rose'}`}>
                          {appointment.status}
                        </span>
                      </div>

                      {/* Original Symptoms */}
                      {appointment.symptoms && (
                        <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs space-y-1">
                          <span className="font-semibold text-slate-800 uppercase tracking-wide text-[10px]">What you reported (Symptoms):</span>
                          <p className="text-slate-700 text-xs">{appointment.symptoms}</p>
                        </div>
                      )}

                      {/* Doctor-Authored Consultation Notes */}
                      {appointment.consultNotes && (
                        <div className="bg-slate-50/70 border border-slate-200 rounded p-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                              <span>Clinician Consultation Notes</span>
                              <span className="bg-slate-200 text-slate-800 text-[10px] px-2 py-0.5 rounded font-medium">Clinician-Entered</span>
                            </h4>
                          </div>
                          {parsedNotes ? (
                            <div className="text-xs text-slate-700 space-y-2">
                              {parsedNotes.notes && <p className="whitespace-pre-wrap"><strong className="text-slate-900">Observations:</strong> {parsedNotes.notes}</p>}
                              {parsedNotes.assessment && <p><strong className="text-slate-900">Assessment:</strong> {parsedNotes.assessment}</p>}
                              {parsedNotes.followUpInstructions && <p><strong className="text-slate-900">Follow-Up Instructions:</strong> {parsedNotes.followUpInstructions}</p>}
                            </div>
                          ) : (
                            <p className="text-xs text-slate-700 whitespace-pre-wrap">{appointment.consultNotes}</p>
                          )}
                        </div>
                      )}

                      {/* Doctor-Authored Prescriptions Section (Persisted in Prescription Model) */}
                      {activePrescriptions.length > 0 && (
                        <div className="border border-emerald-200 bg-emerald-50/30 rounded-lg p-4 space-y-3">
                          <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-950">Doctor-Authored Prescriptions</h4>
                              <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">Clinician-Confirmed (Prescription Model)</span>
                            </div>
                            <span className="text-[11px] text-emerald-800 font-medium">Prescribed by {appointment.doctor?.user?.name || 'Doctor'}</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {activePrescriptions.map((p: any, idx: number) => (
                              <div key={idx} className="bg-white border border-emerald-200 rounded-md p-3 text-xs space-y-1.5 shadow-sm">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1">
                                  <span className="font-bold text-emerald-950 text-sm">{p.medication}</span>
                                  <span className="bg-emerald-100 text-emerald-900 text-[10px] font-semibold px-2 py-0.5 rounded">{p.dosage}</span>
                                </div>
                                <div className="text-slate-700 space-y-0.5">
                                  <p><span className="font-semibold text-slate-900">Frequency:</span> {p.frequency}</p>
                                  <p><span className="font-semibold text-slate-900">Duration:</span> {p.duration}</p>
                                  {p.instructions && <p className="text-slate-600 italic mt-1"><span className="font-semibold not-italic text-slate-900">Instructions:</span> {p.instructions}</p>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Visible Patient Status Badges & AI Explanation Container */}
                      {isAiAvailable && (
                        <div className="bg-emerald-50/80 border border-emerald-200 rounded-lg p-4 text-xs space-y-3 text-slate-800">
                          <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xs uppercase tracking-wide text-emerald-950">Patient-Friendly Follow-Up Explanation</h4>
                              <span className="bg-emerald-600 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                                AI explanation available
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500">Separately Formatted</span>
                          </div>

                          <p className="leading-5 text-slate-700">{summary.summary}</p>

                          {summary.patientInstructions?.length > 0 && (
                            <div className="space-y-1">
                              <p className="font-semibold text-slate-900">Instructions to follow:</p>
                              <ul className="list-disc pl-4 space-y-0.5 text-slate-700">
                                {summary.patientInstructions.map((item: string, i: number) => (
                                  <li key={i}>{item}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <p className="text-[11px] italic text-slate-500 border-t border-emerald-200/50 pt-2">{summary.disclaimer}</p>
                        </div>
                      )}

                      {isAiUnavailable && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs space-y-3 text-amber-950">
                          <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xs uppercase tracking-wide text-amber-950">Patient Summary Status</h4>
                              <span className="bg-amber-200 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded">
                                AI explanation unavailable — clinician instructions are still available
                              </span>
                            </div>
                            <button
                              onClick={() => handleRetryExplanation(appointment)}
                              disabled={retryingId === appointment.id}
                              className="btn-secondary text-xs bg-white text-amber-900 border-amber-300 hover:bg-amber-100"
                            >
                              {retryingId === appointment.id ? 'Retrying…' : 'Retry explanation'}
                            </button>
                          </div>

                          <p className="text-amber-900 leading-5">
                            Your clinician consultation notes and prescriptions above are fully preserved and confirmed. The AI-formatted explanation is temporarily unavailable.
                          </p>
                        </div>
                      )}

                      {!appointment.consultNotes && !summary && (
                        <p className="text-xs text-slate-500 py-2">The consultation record and prescription will appear here after your doctor completes the visit.</p>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active Reminders & Clinician History */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-slate-900">Active Medication Reminders</h2>
              {reminders.length === 0 ? (
                <p className="text-xs text-slate-500 mt-4">No medication reminders active.</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {reminders.map((r) => (
                    <div key={r.id} className="border-b border-slate-100 pb-2 text-xs">
                      <p className="font-semibold text-slate-900">{r.medication} · {r.dosage}</p>
                      <p className="text-slate-600">{r.frequency} ({r.duration || '7 days'}) · Status: {r.status}</p>
                      {r.instructions && <p className="text-slate-500 text-[11px] italic">{r.instructions}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-slate-900">History by Clinician</h2>
              {doctors.length === 0 ? (
                <p className="text-xs text-slate-500 mt-4">Your clinician history will appear after your first appointment.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {doctors.map((group) => (
                    <div key={group.doctor?.id} className="border-l-2 border-slate-300 pl-3">
                      <p className="text-xs font-semibold text-slate-900">{group.doctor?.user?.name || 'Clinician'}</p>
                      <p className="text-xs text-slate-500">{group.visits.length} recorded visit{group.visits.length === 1 ? '' : 's'}</p>
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
