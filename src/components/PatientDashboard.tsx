'use client';

import { useEffect, useMemo, useState } from 'react';
import { AvailableSlot } from '@/lib/types';

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
  const [successMsg, setSuccessMsg] = useState('');

  // Cancellation Modal State
  const [cancellingAppt, setCancellingAppt] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('Schedule conflict');
  const [cancelBusy, setCancelBusy] = useState(false);

  // Reschedule Modal State
  const [reschedulingAppt, setReschedulingAppt] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailableSlot[]>([]);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<AvailableSlot | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  // Google Calendar Settings State
  const [calendarStatus, setCalendarStatus] = useState<any | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);

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

  const fetchCalendarStatus = async () => {
    try {
      const res = await fetch('/api/integrations/google-calendar/status');
      const data = await res.json();
      if (res.ok) setCalendarStatus(data);
    } catch {
      // Ignore fallback
    }
  };

  useEffect(() => {
    load();
    fetchCalendarStatus();
  }, []);

  const handleConnectCalendar = () => {
    window.location.href = '/api/integrations/google-calendar/connect?returnUrl=/';
  };

  const handleDisconnectCalendar = async () => {
    setCalendarBusy(true);
    setError('');
    try {
      const res = await fetch('/api/integrations/google-calendar/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to disconnect');
      setSuccessMsg('Google Calendar connection deactivated.');
      await fetchCalendarStatus();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalendarBusy(false);
    }
  };

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

  useEffect(() => {
    if (!reschedulingAppt || !rescheduleDate) return;
    setRescheduleLoading(true);
    setSelectedRescheduleSlot(null);

    fetch(`/api/doctors/slots?doctorId=${reschedulingAppt.doctorId}&date=${rescheduleDate}`)
      .then((res) => res.json())
      .then((data) => {
        setRescheduleSlots(data.slots || []);
      })
      .finally(() => setRescheduleLoading(false));
  }, [reschedulingAppt, rescheduleDate]);

  const handleCancelSubmit = async () => {
    if (!cancellingAppt) return;
    setCancelBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/appointments/${cancellingAppt.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to cancel appointment');
      setSuccessMsg('Appointment cancelled successfully. Notifications queued.');
      setCancellingAppt(null);
      await load();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCancelBusy(false);
    }
  };

  const handleRescheduleSubmit = async () => {
    if (!reschedulingAppt || !selectedRescheduleSlot) return;
    setRescheduleBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/appointments/${reschedulingAppt.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newStartTime: selectedRescheduleSlot.startTime,
          newEndTime: selectedRescheduleSlot.endTime,
          reason: 'Patient requested reschedule',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reschedule appointment');
      setSuccessMsg('Appointment rescheduled successfully. Notifications queued.');
      setReschedulingAppt(null);
      await load();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRescheduleBusy(false);
    }
  };

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

  const isConnected = calendarStatus?.isConnected;
  const isReauth = calendarStatus?.connection?.status === 'REAUTH_REQUIRED';
  const accountEmail = calendarStatus?.connection?.providerAccountEmail;

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

      {successMsg && (
        <div className="p-4 bg-[#E6F4F1] border-l-4 border-[#16866D] text-xs font-bold text-[#16866D] rounded-r-xl">
          {successMsg}
        </div>
      )}

      {/* Account Integration & Per-User Google Calendar Card */}
      <section className="neu-panel p-5 border border-[#EEF2F7] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-extrabold text-[#26323B]">Google Calendar Integration</h2>
            <span className={`clinical-badge-${isConnected ? 'success' : isReauth ? 'warning' : 'neutral'}`}>
              {isConnected ? 'Connected' : isReauth ? 'Re-authorization Required' : 'Not Connected'}
            </span>
          </div>
          <p className="text-xs text-[#56616B]">
            {isConnected
              ? `Authorized for ${accountEmail || 'your Google account'}. Appointments auto-sync directly to your personal calendar.`
              : isReauth
              ? 'Your Google OAuth token was revoked or expired. Please re-authorize to resume automated calendar sync.'
              : 'Connect your personal Google Calendar to receive automatic appointment invites.'}
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {isConnected ? (
            <button
              onClick={handleDisconnectCalendar}
              disabled={calendarBusy}
              className="neu-btn-secondary text-xs text-[#B42318] border-[#FECDCA] min-h-[40px]"
            >
              {calendarBusy ? 'Disconnecting…' : 'Disconnect Calendar'}
            </button>
          ) : (
            <button
              onClick={handleConnectCalendar}
              className="neu-btn-primary text-xs min-h-[40px]"
            >
              {isReauth ? 'Re-authorize Google Calendar' : 'Connect Google Calendar'}
            </button>
          )}
        </div>
      </section>

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

                      <div className="flex flex-col gap-2 min-w-[150px]">
                        <span className={`clinical-badge-${appointment.status === 'CONFIRMED' ? 'success' : 'warning'} text-center`}>
                          {appointment.status}
                        </span>
                        <button
                          onClick={() => {
                            setReschedulingAppt(appointment);
                            setRescheduleDate(new Date(appointment.startTime).toISOString().slice(0, 10));
                          }}
                          className="neu-btn-secondary text-xs min-h-[40px] justify-center"
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => setCancellingAppt(appointment)}
                          className="neu-btn-secondary text-xs min-h-[40px] justify-center text-[#B42318] border-[#FECDCA]"
                        >
                          Cancel Visit
                        </button>
                      </div>
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

                      {appointment.symptoms && (
                        <div className="bg-[#EEF2F7] border border-[#D4D9E2] rounded-xl p-3.5 space-y-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#56616B]">What You Reported:</span>
                          <p className="text-xs font-semibold text-[#26323B]">{appointment.symptoms}</p>
                        </div>
                      )}

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

      {/* Cancel Confirmation Modal */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center">
          <div className="neu-panel bg-[#E0E5EC] max-w-md w-full p-6 space-y-5 border border-[#FECDCA]">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#B42318]">Confirm Appointment Cancellation</h3>
                <p className="text-xs font-semibold text-[#56616B] mt-0.5">
                  {cancellingAppt.doctor?.user?.name} · {formatDayOfWeek(cancellingAppt.startTime)}
                </p>
              </div>
              <button onClick={() => setCancellingAppt(null)} className="neu-btn-secondary text-sm font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>

            <div className="text-xs font-medium text-[#26323B] space-y-2">
              <p>Are you sure you want to cancel this appointment?</p>
              <p className="text-[#56616B]">Cancelling will release your reserved slot. Email notifications and Google Calendar deletion events will be queued for both you and your doctor.</p>
            </div>

            <div>
              <label htmlFor="cancel-reason" className="block text-xs font-bold text-[#26323B] mb-1">Reason for Cancellation</label>
              <input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Schedule conflict, feeling better"
                className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#D4D9E2]">
              <button onClick={() => setCancellingAppt(null)} className="neu-btn-secondary text-xs min-h-[44px]">Keep Appointment</button>
              <button onClick={handleCancelSubmit} disabled={cancelBusy} className="neu-btn-primary text-xs bg-[#B42318] hover:bg-[#911C13] min-h-[44px]">
                {cancelBusy ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingAppt && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center overflow-y-auto">
          <div className="neu-panel bg-[#E0E5EC] max-w-xl w-full p-6 space-y-5 border border-[#EEF2F7] my-8">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#26323B]">Reschedule Appointment Slot</h3>
                <p className="text-xs font-semibold text-[#5667D8] mt-0.5">
                  With {reschedulingAppt.doctor?.user?.name || 'Specialist'} ({reschedulingAppt.doctor?.specialty})
                </p>
              </div>
              <button onClick={() => setReschedulingAppt(null)} className="neu-btn-secondary text-sm font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>

            <div className="neu-inset p-3.5 text-xs font-semibold text-[#26323B] space-y-1">
              <span className="block text-[10px] font-bold text-[#66727D] uppercase tracking-wider">Current Appointment Slot:</span>
              <p>{formatDayOfWeek(reschedulingAppt.startTime)} at {formatTimeRange(reschedulingAppt.startTime, reschedulingAppt.endTime)}</p>
            </div>

            <div>
              <label htmlFor="reschedule-date" className="block text-xs font-bold text-[#26323B] mb-1">Select New Date:</label>
              <input
                id="reschedule-date"
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-bold text-[#26323B]">Select New Time Slot:</span>
              {rescheduleLoading ? (
                <div className="neu-inset p-6 text-center text-xs font-semibold text-[#66727D]">Calculating available slots…</div>
              ) : rescheduleSlots.length === 0 ? (
                <div className="neu-inset p-6 text-center text-xs font-semibold text-[#66727D]">No available slots found for this date.</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-1">
                  {rescheduleSlots.map((slot, idx) => {
                    const isSelected = selectedRescheduleSlot?.startTime === slot.startTime;
                    const timeStr = new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                      <button
                        key={idx}
                        disabled={!slot.isAvailable}
                        onClick={() => setSelectedRescheduleSlot(slot)}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                          isSelected
                            ? 'neu-btn-active bg-[#5667D8] text-white'
                            : slot.isAvailable
                            ? 'neu-btn-secondary'
                            : 'bg-[#D4D9E2]/50 text-[#66727D] cursor-not-allowed line-through shadow-none'
                        }`}
                      >
                        {timeStr}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#D4D9E2]">
              <button onClick={() => setReschedulingAppt(null)} className="neu-btn-secondary text-xs min-h-[44px]">Cancel</button>
              <button
                onClick={handleRescheduleSubmit}
                disabled={!selectedRescheduleSlot || rescheduleBusy}
                className="neu-btn-primary text-xs min-h-[44px]"
              >
                {rescheduleBusy ? 'Confirming Reschedule…' : 'Confirm New Appointment Time'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
