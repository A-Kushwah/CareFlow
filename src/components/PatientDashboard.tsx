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

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get('error');
      const connectedParam = params.get('calendar_connected');

      if (urlError) {
        setError(decodeURIComponent(urlError));
      } else if (connectedParam === 'true') {
        setSuccessMsg('Google Calendar connected successfully!');
        setTimeout(() => setSuccessMsg(''), 5000);
      }
    }
  }, []);

  const handleConnectCalendar = () => {
    if (calendarStatus && calendarStatus.isOauthConfigured === false) {
      setError('Google OAuth Client credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) must be configured in environment variables.');
      return;
    }
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
        <div className="p-4 bg-[#FEEFEE] border-l-4 border-[#B42318] text-xs font-bold text-[#B42318] rounded-r-xl space-y-1">
          <p>{error}</p>
          {error.includes('GOOGLE_CLIENT_ID') && (
            <p className="text-[11px] font-normal text-[#56616B]">
              To enable Google OAuth calendar sync, set <code className="bg-white px-1 py-0.5 rounded border">GOOGLE_CLIENT_ID</code> and <code className="bg-white px-1 py-0.5 rounded border">GOOGLE_CLIENT_SECRET</code> in your local <code className="bg-white px-1 py-0.5 rounded border">.env</code> file.
            </p>
          )}
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-[#E6F4F1] border-l-4 border-[#16866D] text-xs font-bold text-[#16866D] rounded-r-xl">
          {successMsg}
        </div>
      )}

      {/* Account Integration & Per-User Google Calendar Card */}
      <section className="med-panel p-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold border border-teal-200">
              📅
            </div>
            <h2 className="text-base font-extrabold text-slate-900">Google Calendar Automated Sync</h2>
            <span className={`clinical-badge-${isConnected ? 'success' : isReauth ? 'warning' : 'neutral'}`}>
              {isConnected ? '✓ Connected' : isReauth ? '⚠️ Action Required' : 'Not Connected'}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-600">
            {isConnected
              ? `Authorized for ${accountEmail || 'your Google account'}. Clinical appointments automatically sync to your calendar with reminder alerts.`
              : isReauth
              ? 'Your Google OAuth token requires re-authorization to keep appointment sync active.'
              : 'Connect your personal Google Calendar to automatically receive calendar invites and reminders.'}
          </p>
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {isConnected ? (
            <button
              onClick={handleDisconnectCalendar}
              disabled={calendarBusy}
              className="med-btn-secondary text-xs text-red-600 border-red-200 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-teal-500 min-h-[44px]"
            >
              {calendarBusy ? 'Disconnecting…' : 'Disconnect Calendar'}
            </button>
          ) : (
            <button
              onClick={handleConnectCalendar}
              className="med-btn-primary text-xs min-h-[44px] shadow-md focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {isReauth ? 'Re-authorize Google Calendar' : 'Connect Google Calendar'}
            </button>
          )}
        </div>
      </section>

      {loading ? (
        <div className="med-panel py-20 text-center text-xs font-bold text-slate-500 bg-white rounded-3xl border border-slate-200" aria-live="polite">
          <svg className="animate-spin h-6 w-6 text-teal-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading care record…
        </div>
      ) : (
        <>
          {/* Top Bento Quick Metrics Grid */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-5" aria-label="Care record metrics">
            <div className="med-card p-6 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2 hover:border-teal-300 transition-colors">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Upcoming Visits</span>
                <span className="p-2 rounded-xl bg-sky-50 text-sky-700 text-xs font-bold">🩺 Scheduled</span>
              </div>
              <p className="text-3xl font-extrabold text-slate-900">{upcomingAppointments.length}</p>
              <p className="text-[11px] font-semibold text-slate-500">Active reserved consultation slots</p>
            </div>

            <div className="med-card p-6 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2 hover:border-teal-300 transition-colors">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Completed Consultations</span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold">✓ Verified</span>
              </div>
              <p className="text-3xl font-extrabold text-slate-900">
                {appointments.filter((a) => a.status === 'COMPLETED').length}
              </p>
              <p className="text-[11px] font-semibold text-slate-500">Includes notes & prescriptions</p>
            </div>

            <div className="med-card p-6 bg-white border border-slate-200/80 rounded-2xl shadow-xs space-y-2 hover:border-teal-300 transition-colors">
              <div className="flex items-center justify-between text-slate-400">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Active Reminders</span>
                <span className="p-2 rounded-xl bg-teal-50 text-teal-700 text-xs font-bold">⏰ Medication</span>
              </div>
              <p className="text-3xl font-extrabold text-teal-700">
                {reminders.filter((r) => r.status === 'ACTIVE').length}
              </p>
              <p className="text-[11px] font-semibold text-slate-500">Deduplicated schedule alerts</p>
            </div>
          </section>

          {/* Priority 1: Upcoming Appointments */}
          <section className="med-panel p-6 sm:p-8 space-y-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm" aria-labelledby="upcoming-heading">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 id="upcoming-heading" className="text-lg font-extrabold text-slate-900">1. Upcoming Appointments</h2>
                <p className="text-xs font-medium text-slate-500 mt-0.5">Your scheduled consultations with CareFlow specialists.</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-200 text-xs font-bold">
                {upcomingAppointments.length} Active
              </span>
            </div>

            {upcomingAppointments.length === 0 ? (
              <div className="bg-slate-50 p-10 text-center text-xs font-bold text-slate-500 rounded-2xl border border-slate-200">
                No upcoming appointments currently scheduled. Select a specialist below to book a slot.
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingAppointments.map((appointment) => (
                  <article key={appointment.id} className="med-card p-6 border border-slate-200/90 space-y-4 rounded-2xl bg-white shadow-xs">
                    <div className="grid md:grid-cols-[280px_1fr_auto] gap-6 items-start">
                      {/* Prominent Date & Time Card */}
                      <div className="bg-gradient-to-br from-teal-50 to-sky-50 p-4 space-y-1 rounded-2xl border border-teal-100">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-800">Scheduled Date</span>
                        <time className="block text-base font-extrabold text-slate-900">
                          {formatDayOfWeek(appointment.startTime)}
                        </time>
                        <time className="block text-sm font-extrabold text-teal-700">
                          {formatTimeRange(appointment.startTime, appointment.endTime)}
                        </time>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-base font-extrabold text-slate-900">{appointment.doctor?.user?.name || 'Assigned Specialist'}</h3>
                          <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                            {appointment.doctor?.specialty || 'Medical Consultation'}
                          </span>
                        </div>
                        {appointment.symptoms && (
                          <div className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200/80 font-medium">
                            <strong className="text-slate-900 font-bold">Reported Symptoms:</strong> {appointment.symptoms}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 min-w-[160px]">
                        <span className={`clinical-badge-${appointment.status === 'CONFIRMED' ? 'success' : 'warning'} text-center shadow-xs justify-center`}>
                          {appointment.status === 'CONFIRMED' ? '✓ Scheduled' : '⏳ Hold Pending'}
                        </span>
                        <button
                          onClick={() => {
                            setReschedulingAppt(appointment);
                            setRescheduleDate(new Date(appointment.startTime).toISOString().slice(0, 10));
                          }}
                          className="med-btn-secondary text-xs min-h-[44px] justify-center focus-visible:ring-2 focus-visible:ring-teal-500 font-bold"
                        >
                          Reschedule
                        </button>
                        <button
                          onClick={() => setCancellingAppt(appointment)}
                          className="med-btn-secondary text-xs min-h-[44px] justify-center text-red-600 border-red-200 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-teal-500 font-bold"
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
          <section className="med-panel p-6 sm:p-8 space-y-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm" aria-labelledby="consultations-heading">
            <div className="border-b border-slate-100 pb-4">
              <h2 id="consultations-heading" className="text-lg font-extrabold text-slate-900">2. Previous Consultations & Clinical Records</h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5">
                Completed consultation summaries, doctor-authored prescriptions, and AI follow-up explanations.
              </p>
            </div>

            {completedAppointments.length === 0 ? (
              <div className="bg-slate-50 p-10 text-center text-xs font-bold text-slate-500 rounded-2xl border border-slate-200">
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
                    <article key={appointment.id} className="med-card p-6 border border-slate-200/90 space-y-5 rounded-2xl bg-white shadow-xs">
                      <div className="grid md:grid-cols-[280px_1fr_auto] gap-6 items-start border-b border-slate-100 pb-4">
                        <div className="bg-slate-50 p-4 space-y-1 rounded-2xl border border-slate-200/80">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Consultation Date</span>
                          <time className="block text-base font-extrabold text-slate-900">
                            {formatDayOfWeek(appointment.startTime)}
                          </time>
                          <time className="block text-xs font-bold text-slate-500">
                            {formatTimeRange(appointment.startTime, appointment.endTime)}
                          </time>
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-extrabold text-slate-900">{appointment.doctor?.user?.name || 'Assigned Clinician'}</h3>
                            <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                              {appointment.doctor?.specialty || 'General Consultation'}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-500 mt-1">CareFlow Authenticated Medical Record</p>
                        </div>
                        <span className="clinical-badge-neutral font-extrabold">{appointment.status}</span>
                      </div>

                      {appointment.symptoms && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">What You Reported:</span>
                          <p className="text-xs font-bold text-slate-900">{appointment.symptoms}</p>
                        </div>
                      )}

                      {appointment.consultNotes && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 space-y-3">
                          <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                              <span>Clinician Consultation Notes</span>
                            </h4>
                            <span className="clinical-badge-neutral">Clinician-Entered</span>
                          </div>
                          {parsedNotes ? (
                            <div className="text-xs text-slate-800 space-y-2 font-medium">
                              {parsedNotes.notes && <p className="whitespace-pre-wrap"><strong className="font-bold text-slate-900">Observations:</strong> {parsedNotes.notes}</p>}
                              {parsedNotes.assessment && <p><strong className="font-bold text-slate-900">Assessment:</strong> {parsedNotes.assessment}</p>}
                              {parsedNotes.followUpInstructions && <p><strong className="font-bold text-slate-900">Follow-Up Instructions:</strong> {parsedNotes.followUpInstructions}</p>}
                            </div>
                          ) : (
                            <p className="text-xs font-medium text-slate-900 whitespace-pre-wrap">{appointment.consultNotes}</p>
                          )}
                        </div>
                      )}

                      {activePrescriptions.length > 0 && (
                        <div className="bg-emerald-50/60 border-2 border-emerald-500/80 rounded-2xl p-5 space-y-4">
                          <div className="flex flex-wrap items-center justify-between border-b border-emerald-200 pb-3 gap-2">
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">Doctor-Authored Prescriptions</h4>
                              <span className="clinical-badge-success">Clinician-Confirmed</span>
                            </div>
                            <span className="text-xs font-bold text-emerald-800">Prescribed by {appointment.doctor?.user?.name || 'Clinician'}</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {activePrescriptions.map((p: any, idx: number) => (
                              <div key={idx} className="bg-white border border-emerald-200 rounded-xl p-4 text-xs space-y-2 shadow-xs">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <span className="font-extrabold text-slate-900 text-sm">{p.medication}</span>
                                  <span className="clinical-badge-success">{p.dosage}</span>
                                </div>
                                <div className="text-slate-800 space-y-1 font-semibold">
                                  <p><span className="font-bold text-slate-500">Frequency:</span> {p.frequency}</p>
                                  <p><span className="font-bold text-slate-500">Duration:</span> {p.duration || '7 days'}</p>
                                  {p.instructions && (
                                    <p className="text-slate-600 italic mt-1"><span className="font-bold not-italic text-slate-800">Instructions:</span> {p.instructions}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {isAiAvailable && (
                        <div className="bg-teal-50/50 border border-teal-200 rounded-2xl p-5 text-xs space-y-3">
                          <div className="flex items-center justify-between border-b border-teal-200/80 pb-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xs uppercase tracking-wide text-teal-900">Patient-Friendly Explanation</h4>
                              <span className="clinical-badge-neutral bg-teal-100 text-teal-800 border-teal-300">
                                AI Explanation Active
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500">Clear Format</span>
                          </div>

                          <p className="leading-relaxed font-semibold text-slate-800">{summary.summary}</p>

                          {summary.patientInstructions?.length > 0 && (
                            <div className="space-y-1.5">
                              <p className="font-bold text-slate-900">Follow-up instructions to consider:</p>
                              <ul className="space-y-1 text-slate-700 font-medium">
                                {summary.patientInstructions.map((item: string, i: number) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-teal-600 font-extrabold">•</span>
                                    <span>{item}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <p className="text-[11px] italic text-slate-500 border-t border-teal-200/60 pt-2">{summary.disclaimer}</p>
                        </div>
                      )}

                      {isAiUnavailable && (
                        <div className="bg-amber-50 border-2 border-amber-400 rounded-2xl p-5 text-xs space-y-3 text-amber-900">
                          <div className="flex flex-wrap items-center justify-between border-b border-amber-200 pb-2 gap-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-xs uppercase tracking-wide">Patient Summary Status</h4>
                              <span className="clinical-badge-warning">
                                AI explanation unavailable — clinician instructions are still available
                              </span>
                            </div>
                            <button
                              onClick={() => handleRetryExplanation(appointment)}
                              disabled={retryingId === appointment.id}
                              className="med-btn-secondary text-xs min-h-[44px] font-bold focus-visible:ring-2 focus-visible:ring-teal-500"
                            >
                              {retryingId === appointment.id ? 'Retrying…' : 'Retry explanation'}
                            </button>
                          </div>

                          <p className="font-medium leading-relaxed">
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

          {/* Priority 3 & 4: Active Reminders & History by Clinician Bento Grid */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-label="Reminders and Clinicians">
            <div className="med-panel p-6 sm:p-8 space-y-5 bg-white border border-slate-200/90 rounded-3xl shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-extrabold text-slate-900">3. Active Medication Reminders</h2>
                <span className="px-2.5 py-0.5 text-xs font-bold bg-teal-50 text-teal-800 rounded-full border border-teal-200">
                  {reminders.length} Active
                </span>
              </div>

              {reminders.length === 0 ? (
                <p className="text-xs font-bold text-slate-500 bg-slate-50 p-6 rounded-2xl text-center border border-slate-200">
                  No active medication reminders recorded.
                </p>
              ) : (
                <div className="space-y-3">
                  {reminders.map((r) => (
                    <div key={r.id} className="bg-slate-50 p-4 text-xs space-y-1.5 rounded-2xl border border-slate-200/80">
                      <div className="flex justify-between items-center">
                        <span className="font-extrabold text-slate-900 text-sm">{r.medication} · {r.dosage}</span>
                        <span className="clinical-badge-success">✓ Active</span>
                      </div>
                      <p className="text-slate-700 font-semibold">{r.frequency} ({r.duration || '7 days'})</p>
                      {r.instructions && <p className="text-slate-500 italic text-[11px]">{r.instructions}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="med-panel p-6 sm:p-8 space-y-5 bg-white border border-slate-200/90 rounded-3xl shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-base font-extrabold text-slate-900">4. History by Clinician</h2>
                <span className="px-2.5 py-0.5 text-xs font-bold bg-slate-100 text-slate-700 rounded-full">
                  {doctors.length} Specialist{doctors.length === 1 ? '' : 's'}
                </span>
              </div>

              {doctors.length === 0 ? (
                <p className="text-xs font-bold text-slate-500 bg-slate-50 p-6 rounded-2xl text-center border border-slate-200">
                  Clinician history will appear after your first consultation.
                </p>
              ) : (
                <div className="space-y-3">
                  {doctors.map((group) => (
                    <div key={group.doctor?.id} className="med-card p-4 flex items-center justify-between border border-slate-200/80 rounded-2xl bg-white">
                      <div>
                        <p className="text-sm font-extrabold text-slate-900">{group.doctor?.user?.name || 'Assigned Clinician'}</p>
                        <p className="text-xs font-bold text-teal-700">{group.doctor?.specialty || 'Specialist'}</p>
                      </div>
                      <span className="clinical-badge-neutral font-extrabold">{group.visits.length} Visit{group.visits.length === 1 ? '' : 's'}</span>
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="med-panel bg-white max-w-md w-full p-6 space-y-5 border border-red-200 rounded-3xl shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-red-700">Confirm Appointment Cancellation</h3>
                <p className="text-xs font-bold text-slate-500 mt-0.5">
                  {cancellingAppt.doctor?.user?.name} · {formatDayOfWeek(cancellingAppt.startTime)}
                </p>
              </div>
              <button onClick={() => setCancellingAppt(null)} className="med-btn-secondary text-base font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400">×</button>
            </div>

            <div className="text-xs font-medium text-slate-800 space-y-2">
              <p>Are you sure you want to cancel this appointment?</p>
              <p className="text-slate-500">Cancelling will release your reserved slot. Email notifications and Google Calendar deletion events will be queued for both you and your doctor.</p>
            </div>

            <div>
              <label htmlFor="cancel-reason" className="block text-xs font-bold text-slate-800 mb-1">Reason for Cancellation</label>
              <input
                id="cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Schedule conflict, feeling better"
                className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
              <button onClick={() => setCancellingAppt(null)} className="med-btn-secondary text-xs min-h-[44px] font-bold focus-visible:ring-2 focus-visible:ring-teal-500">Keep Appointment</button>
              <button onClick={handleCancelSubmit} disabled={cancelBusy} className="med-btn-primary text-xs bg-red-600 hover:bg-red-700 min-h-[44px] font-bold shadow-md focus-visible:ring-2 focus-visible:ring-teal-500">
                {cancelBusy ? 'Cancelling…' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {reschedulingAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center overflow-y-auto">
          <div className="med-panel bg-white max-w-xl w-full p-6 sm:p-8 space-y-5 border border-slate-200/90 rounded-3xl shadow-2xl my-8">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Reschedule Appointment Slot</h3>
                <p className="text-xs font-bold text-teal-700 mt-0.5">
                  With {reschedulingAppt.doctor?.user?.name || 'Specialist'} ({reschedulingAppt.doctor?.specialty})
                </p>
              </div>
              <button onClick={() => setReschedulingAppt(null)} className="med-btn-secondary text-base font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400">×</button>
            </div>

            <div className="bg-slate-50 p-4 text-xs font-semibold text-slate-800 rounded-2xl border border-slate-200/80 space-y-1">
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Appointment Slot:</span>
              <p>{formatDayOfWeek(reschedulingAppt.startTime)} at {formatTimeRange(reschedulingAppt.startTime, reschedulingAppt.endTime)}</p>
            </div>

            <div>
              <label htmlFor="reschedule-date" className="block text-xs font-bold text-slate-800 mb-1">Select New Date:</label>
              <input
                id="reschedule-date"
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>

            <div className="space-y-2">
              <span className="block text-xs font-bold text-slate-800">Select New Time Slot:</span>
              {rescheduleLoading ? (
                <div className="bg-slate-50 p-6 text-center text-xs font-semibold text-slate-500 rounded-2xl border border-slate-200">Calculating available slots…</div>
              ) : rescheduleSlots.length === 0 ? (
                <div className="bg-slate-50 p-6 text-center text-xs font-semibold text-slate-500 rounded-2xl border border-slate-200">No available slots found for this date.</div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto p-1">
                  {rescheduleSlots.map((slot, idx) => {
                    const isSelected = selectedRescheduleSlot?.startTime === slot.startTime;
                    const timeStr = new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    return (
                      <button
                        key={idx}
                        disabled={!slot.isAvailable}
                        onClick={() => setSelectedRescheduleSlot(slot)}
                        className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                          isSelected
                            ? 'bg-teal-700 text-white border border-teal-700 font-extrabold shadow-sm'
                            : slot.isAvailable
                            ? 'bg-white border border-slate-200 text-slate-800 hover:bg-slate-100'
                            : 'bg-slate-100 text-slate-400 border border-slate-200/50 cursor-not-allowed line-through shadow-none'
                        }`}
                      >
                        {timeStr}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
              <button onClick={() => setReschedulingAppt(null)} className="med-btn-secondary text-xs min-h-[44px] font-bold focus-visible:ring-2 focus-visible:ring-teal-500">Cancel</button>
              <button
                onClick={handleRescheduleSubmit}
                disabled={!selectedRescheduleSlot || rescheduleBusy}
                className="med-btn-primary text-xs min-h-[44px] font-bold shadow-md focus-visible:ring-2 focus-visible:ring-teal-500"
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
