'use client';

import { useEffect, useState } from 'react';
import { AvailableSlot } from '@/lib/types';

type Section = 'schedule' | 'history' | 'leave';

const formatDay = (v: string) => new Date(v).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
const formatTimeRange = (start: string, end: string) => {
  const s = new Date(start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const e = new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${s} — ${e}`;
};

interface PrescriptionItem {
  medication: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions: string;
}

export default function DoctorPortal() {
  const [section, setSection] = useState<Section>('schedule');
  const [appointments, setAppointments] = useState<any[]>([]);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);

  // Dedicated Patient History State
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientHistory, setPatientHistory] = useState<any | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Cancellation Modal State
  const [cancellingAppt, setCancellingAppt] = useState<any | null>(null);
  const [cancelReason, setCancelReason] = useState('Doctor request / schedule update');
  const [cancelBusy, setCancelBusy] = useState(false);

  // Reschedule Modal State
  const [reschedulingAppt, setReschedulingAppt] = useState<any | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailableSlot[]>([]);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<AvailableSlot | null>(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  // Google Calendar Integration State
  const [calendarStatus, setCalendarStatus] = useState<any | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);

  // Structured consultation form fields
  const [observations, setObservations] = useState('');
  const [confirmedAssessment, setConfirmedAssessment] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[]>([]);

  const [summary, setSummary] = useState<any | null>(null);
  const [aiError, setAiError] = useState<string | undefined>(undefined);
  const [modalMessage, setModalMessage] = useState('');
  const [modalError, setModalError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [generatingPreId, setGeneratingPreId] = useState<string | null>(null);
  const [leave, setLeave] = useState({ start: '', end: '', reason: '' });

  const loadSchedule = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/appointments');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Unable to load schedule');
      setAppointments(data.appointments || []);
    } catch (e: any) {
      setError(e.message);
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
    loadSchedule();
    fetchCalendarStatus();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlError = params.get('error');
      const connectedParam = params.get('calendar_connected');

      if (urlError) {
        setError(decodeURIComponent(urlError));
      } else if (connectedParam === 'true') {
        setMessage('Google Calendar connected successfully!');
        setTimeout(() => setMessage(''), 5000);
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
      setMessage('Google Calendar connection deactivated.');
      await fetchCalendarStatus();
      setTimeout(() => setMessage(''), 5000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCalendarBusy(false);
    }
  };

  // Load available slots when reschedule date changes
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
      setMessage('Appointment cancelled successfully. Patient and doctor email notifications queued.');
      setCancellingAppt(null);
      await loadSchedule();
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
          reason: 'Doctor requested reschedule',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reschedule appointment');
      setMessage('Appointment rescheduled successfully. Notifications queued.');
      setReschedulingAppt(null);
      await loadSchedule();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRescheduleBusy(false);
    }
  };

  const handleGeneratePreSummary = async (apptId: string, symptoms: string) => {
    setGeneratingPreId(apptId);
    setError('');
    try {
      const res = await fetch('/api/ai/pre-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms, appointmentId: apptId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate pre-visit summary');

      const summaryText = data.summary?.summary || (typeof data.summary === 'string' ? data.summary : null);
      if (summaryText) {
        setAppointments((prev) =>
          prev.map((item) => (item.id === apptId ? { ...item, aiPreSummary: summaryText } : item))
        );
      } else {
        await loadSchedule();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingPreId(null);
    }
  };

  const openApptModal = (a: any) => {
    setSelectedAppt(a);
    setSummary(null);
    setAiError(undefined);
    setModalMessage('');
    setModalError('');

    if (a.consultNotes) {
      try {
        const parsed = JSON.parse(a.consultNotes);
        if (parsed && typeof parsed === 'object') {
          setObservations(parsed.notes || '');
          setConfirmedAssessment(parsed.assessment || '');
          setFollowUpInstructions(parsed.followUpInstructions || '');
          setPrescriptions(parsed.prescriptions || []);
        } else {
          setObservations(a.consultNotes);
          setConfirmedAssessment('');
          setFollowUpInstructions('');
          setPrescriptions([]);
        }
      } catch {
        setObservations(a.consultNotes);
        setConfirmedAssessment('');
        setFollowUpInstructions('');
        setPrescriptions([]);
      }
    } else {
      setObservations('');
      setConfirmedAssessment('');
      setFollowUpInstructions('');
      setPrescriptions([]);
    }

    setSummary(a.aiPostSummary ? JSON.parse(a.aiPostSummary) : null);
  };

  const addPrescription = () => {
    setPrescriptions([
      ...prescriptions,
      { medication: '', dosage: '500mg', frequency: 'Once daily', duration: '7 days', instructions: 'Take with food' },
    ]);
  };

  const updatePrescription = (index: number, field: keyof PrescriptionItem, val: string) => {
    const next = [...prescriptions];
    next[index] = { ...next[index], [field]: val };
    setPrescriptions(next);
  };

  const removePrescription = (index: number) => {
    setPrescriptions(prescriptions.filter((_, i) => i !== index));
  };

  const fetchPatientHistory = async (patientId: string) => {
    setSelectedPatientId(patientId);
    setHistoryLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/patients/${patientId}/history`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch patient history');
      setPatientHistory(data);
      setSection('history');
    } catch (e: any) {
      setError(e.message || 'Unable to load patient history');
    } finally {
      setHistoryLoading(false);
    }
  };

  const handlePostVisitSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAppt) return;

    setModalError('');
    setModalMessage('');

    if (!observations.trim()) {
      setModalError('Please provide clinical observations before submitting.');
      return;
    }

    for (const p of prescriptions) {
      if (!p.medication.trim()) {
        setModalError('Medication name is required for all prescribed items.');
        return;
      }
    }

    setBusy(true);
    setMessage('');
    setError('');
    setAiError(undefined);

    try {
      const res = await fetch('/api/ai/post-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: selectedAppt.id,
          notes: observations,
          confirmedAssessment,
          followUpInstructions,
          prescriptions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save consultation notes');

      setModalMessage('✓ Clinical consultation record, prescriptions, and medication reminders saved successfully!');

      if (data.aiSummary) {
        setSummary(data.aiSummary);
      } else if (data.aiError) {
        setAiError(data.aiError);
      }

      await loadSchedule();
    } catch (e: any) {
      setModalError(e.message || 'Submission error');
    } finally {
      setBusy(false);
    }
  };

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/doctors/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: leave.start, endDate: leave.end, reason: leave.reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessage(`${data.cancelledAppointmentsCount || 0} conflicting future appointments were cancelled and patients notified.`);
      setLeave({ start: '', end: '', reason: '' });
      await loadSchedule();
    } catch (e: any) {
      setError(e.message || 'Unable to submit leave request');
    } finally {
      setBusy(false);
    }
  };

  const uniquePatients = Array.from(
    new Map(appointments.map((a) => [a.patientId, a.patient])).values()
  ).filter(Boolean);

  const isConnected = calendarStatus?.isConnected;
  const isReauth = calendarStatus?.connection?.status === 'REAUTH_REQUIRED';
  const accountEmail = calendarStatus?.connection?.providerAccountEmail;

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8" aria-label="Doctor Workspace">
      {/* Workspace Header */}
      <header className="med-panel p-6 sm:p-8 bg-white border border-slate-200/90 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-xs font-bold inline-block mb-1">
            Clinician Operations Workstation
          </span>
          <h1 className="text-2xl font-extrabold text-slate-900">Doctor Schedule & Clinical Operations</h1>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Review patient queue, prescribe medication orders, inspect patient history, and manage availability.
          </p>
        </div>
        <button onClick={loadSchedule} className="med-btn-secondary text-xs font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500">
          Refresh Schedule
        </button>
      </header>

      {(message || error) && (
        <div className={`p-4 border-l-4 text-xs font-bold rounded-2xl ${error ? 'bg-red-50 border-red-500 text-red-700' : 'bg-emerald-50 border-emerald-500 text-emerald-700'}`}>
          <p>{error || message}</p>
          {error.includes('GOOGLE_CLIENT_ID') && (
            <p className="text-[11px] font-normal text-slate-600 mt-1">
              To enable Google OAuth calendar sync, set <code className="bg-white px-1 py-0.5 rounded border border-slate-200">GOOGLE_CLIENT_ID</code> and <code className="bg-white px-1 py-0.5 rounded border border-slate-200">GOOGLE_CLIENT_SECRET</code> in your local <code className="bg-white px-1 py-0.5 rounded border border-slate-200">.env</code> file.
            </p>
          )}
        </div>
      )}

      {/* Account Integration & Per-User Google Calendar Card */}
      <section className="med-panel p-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center font-bold border border-teal-200">
              📅
            </div>
            <h2 className="text-base font-extrabold text-slate-900">Google Calendar Integration</h2>
            <span className={`clinical-badge-${isConnected ? 'success' : isReauth ? 'warning' : 'neutral'}`}>
              {isConnected ? '✓ Connected' : isReauth ? '⚠️ Action Required' : 'Not Connected'}
            </span>
          </div>
          <p className="text-xs font-medium text-slate-600">
            {isConnected
              ? `Authorized for ${accountEmail || 'your Google account'}. Patient appointments auto-sync directly to your professional calendar.`
              : isReauth
              ? 'Your Google OAuth token was revoked or expired. Please re-authorize to resume automated calendar sync.'
              : 'Connect your personal Google Calendar to automatically synchronize patient consultation invites.'}
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          {isConnected ? (
            <button
              onClick={handleDisconnectCalendar}
              disabled={calendarBusy}
              className="med-btn-secondary text-xs text-red-600 border-red-200 hover:bg-red-50 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 font-bold"
            >
              {calendarBusy ? 'Disconnecting…' : 'Disconnect Calendar'}
            </button>
          ) : (
            <button
              onClick={handleConnectCalendar}
              className="med-btn-primary text-xs min-h-[44px] shadow-md focus-visible:ring-2 focus-visible:ring-teal-500 font-bold"
            >
              {isReauth ? 'Re-authorize Google Calendar' : 'Connect Google Calendar'}
            </button>
          )}
        </div>
      </section>

      {/* Role-Specific Navigation Tabs */}
      <nav className="bg-slate-100/80 p-1.5 rounded-2xl flex flex-wrap gap-2 border border-slate-200/60" aria-label="Doctor workspace sections">
        <button
          onClick={() => setSection('schedule')}
          aria-current={section === 'schedule' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
            section === 'schedule'
              ? 'bg-white text-teal-800 shadow-sm border border-slate-200/80 font-extrabold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          Daily Schedule & Consultations ({appointments.length})
        </button>
        <button
          onClick={() => setSection('history')}
          aria-current={section === 'history' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
            section === 'history'
              ? 'bg-white text-teal-800 shadow-sm border border-slate-200/80 font-extrabold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          Patient History Explorer ({uniquePatients.length})
        </button>
        <button
          onClick={() => setSection('leave')}
          aria-current={section === 'leave' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
            section === 'leave'
              ? 'bg-white text-teal-800 shadow-sm border border-slate-200/80 font-extrabold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
          }`}
        >
          Manage Leave & Out of Office
        </button>
      </nav>

      {/* Section 1: Schedule */}
      {section === 'schedule' && (
        <section className="med-panel p-6 sm:p-8 space-y-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm">
          <div className="flex justify-between items-center border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-extrabold text-slate-900">Appointments & Consultation Queue</h2>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Select an appointment to open consultation entry.</p>
            </div>
            <span className="px-3 py-1 rounded-full bg-teal-50 text-teal-800 border border-teal-200 text-xs font-bold">
              {appointments.length} Total Patients
            </span>
          </div>

          {loading ? (
            <div className="bg-slate-50 p-12 text-center text-xs font-bold text-slate-500 rounded-2xl border border-slate-200">Loading appointments…</div>
          ) : appointments.length === 0 ? (
            <div className="bg-slate-50 p-12 text-center text-xs font-bold text-slate-500 rounded-2xl border border-slate-200">No appointments scheduled.</div>
          ) : (
            <div className="space-y-4">
              {appointments.map((a) => (
                <div key={a.id} className="med-card p-6 border border-slate-200/90 space-y-4 rounded-2xl bg-white shadow-xs">
                  <div className="grid md:grid-cols-[240px_1fr_auto] gap-5 items-start">
                    <div className="bg-slate-50 p-4 space-y-1 rounded-2xl border border-slate-200/80">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700">Scheduled Time</span>
                      <p className="text-sm font-extrabold text-slate-900">{formatDay(a.startTime)}</p>
                      <p className="text-xs font-bold text-teal-700">{formatTimeRange(a.startTime, a.endTime)}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-base font-extrabold text-slate-900">{a.patient?.name}</span>
                        <span className="text-xs font-bold text-slate-500">({a.patient?.email})</span>
                        <span className={`clinical-badge-${a.status === 'CONFIRMED' ? 'success' : a.status === 'COMPLETED' ? 'neutral' : 'warning'} font-extrabold`}>
                          {a.status}
                        </span>
                      </div>

                      {a.symptoms && (
                        <div className="text-xs text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-200/80 font-medium">
                          <strong className="font-bold text-slate-900">Chief Complaint:</strong> {a.symptoms}
                        </div>
                      )}

                      {a.aiPreSummary ? (
                        <div className="text-xs text-teal-900 bg-teal-50 p-3 rounded-xl border border-teal-200 font-semibold">
                          <strong className="font-extrabold text-teal-800">✨ AI Pre-Visit Triage Summary:</strong> {a.aiPreSummary}
                        </div>
                      ) : (
                        a.symptoms && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleGeneratePreSummary(a.id, a.symptoms);
                              }}
                              disabled={generatingPreId === a.id}
                              className="text-xs font-extrabold text-teal-700 hover:text-teal-900 hover:underline flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-teal-500 rounded-md p-1"
                            >
                              {generatingPreId === a.id ? '✨ Generating AI Pre-Visit Triage…' : '✨ Generate AI Pre-Visit Triage Summary'}
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    <div className="flex flex-col gap-2 min-w-[170px]">
                      <button onClick={() => openApptModal(a)} className="med-btn-primary text-xs justify-center min-h-[44px] font-bold focus-visible:ring-2 focus-visible:ring-teal-500 shadow-md">
                        {a.status === 'COMPLETED' ? 'Edit Consultation' : 'Conduct Consultation'}
                      </button>
                      <button onClick={() => fetchPatientHistory(a.patientId)} className="med-btn-secondary text-xs justify-center min-h-[44px] font-bold focus-visible:ring-2 focus-visible:ring-teal-500">
                        View Patient History
                      </button>
                      {a.status === 'CONFIRMED' && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => {
                              setReschedulingAppt(a);
                              setRescheduleDate(new Date(a.startTime).toISOString().slice(0, 10));
                            }}
                            className="med-btn-secondary text-[11px] min-h-[38px] flex-1 justify-center font-bold focus-visible:ring-2 focus-visible:ring-teal-500"
                          >
                            Reschedule
                          </button>
                          <button
                            onClick={() => setCancellingAppt(a)}
                            className="med-btn-secondary text-[11px] min-h-[38px] flex-1 justify-center text-red-600 border-red-200 hover:bg-red-50 font-bold focus-visible:ring-2 focus-visible:ring-teal-500"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Section 2: Patient History */}
      {section === 'history' && (
        <section className="med-panel p-6 sm:p-8 space-y-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900">Patient History Explorer</h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Historical consultation notes and prescriptions for your assigned patients.</p>
          </div>

          <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-200">
            {uniquePatients.map((p: any) => (
              <button
                key={p.id}
                onClick={() => fetchPatientHistory(p.id)}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  selectedPatientId === p.id ? 'bg-teal-700 text-white font-extrabold shadow-sm' : 'med-btn-secondary'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {historyLoading ? (
            <div className="bg-slate-50 p-12 text-center text-xs font-bold text-slate-500 rounded-2xl border border-slate-200">Loading patient history…</div>
          ) : !patientHistory ? (
            <div className="bg-slate-50 p-12 text-center text-xs font-bold text-slate-500 rounded-2xl border border-slate-200">Select a patient above to view history.</div>
          ) : (
            <div className="space-y-6">
              <div className="med-card p-5 border border-slate-200/80 bg-slate-50/60 rounded-2xl">
                <h3 className="text-base font-extrabold text-slate-900">{patientHistory.patient?.name}</h3>
                <p className="text-xs font-bold text-slate-500">{patientHistory.patient?.email}</p>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">Past Consultation History ({patientHistory.history?.length || 0})</h4>
                {patientHistory.history?.map((h: any) => (
                  <div key={h.id} className="med-card p-5 border border-slate-200/80 rounded-2xl space-y-3 bg-white">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                      <span className="text-xs font-extrabold text-slate-900">{formatDay(h.startTime)} at {formatTimeRange(h.startTime, h.endTime)}</span>
                      <span className="clinical-badge-neutral font-extrabold">{h.status}</span>
                    </div>
                    {h.symptoms && <p className="text-xs text-slate-700 font-medium"><strong className="text-slate-900">Symptoms:</strong> {h.symptoms}</p>}
                    {h.consultNotes && (
                      <div className="bg-slate-50 p-3.5 rounded-xl text-xs text-slate-800 space-y-1 border border-slate-200/70 font-medium">
                        <strong className="block text-[11px] font-bold uppercase text-teal-700">Doctor Notes:</strong>
                        <p className="whitespace-pre-wrap">{h.consultNotes}</p>
                      </div>
                    )}
                    {h.prescriptions?.length > 0 && (
                      <div className="bg-emerald-50/70 p-3.5 rounded-xl text-xs space-y-1 text-emerald-900 border border-emerald-200 font-medium">
                        <strong className="block text-[11px] font-bold uppercase text-emerald-800">Prescriptions:</strong>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {h.prescriptions.map((px: any, idx: number) => (
                            <li key={idx}><strong className="font-extrabold text-slate-900">{px.medication}</strong> {px.dosage} ({px.frequency}, {px.duration})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Section 3: Leave */}
      {section === 'leave' && (
        <section className="med-panel p-6 sm:p-8 space-y-6 bg-white border border-slate-200/90 rounded-3xl shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-extrabold text-slate-900">Manage Doctor Leave & Out of Office</h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Submitting leave will automatically cancel conflicting patient appointments and queue email notifications.</p>
          </div>

          <form onSubmit={handleLeaveSubmit} className="max-w-xl space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={leave.start}
                onChange={(e) => setLeave({ ...leave, start: e.target.value })}
                className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">End Date</label>
              <input
                type="date"
                required
                value={leave.end}
                onChange={(e) => setLeave({ ...leave, end: e.target.value })}
                className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">Reason for Leave</label>
              <textarea
                required
                rows={3}
                value={leave.reason}
                onChange={(e) => setLeave({ ...leave, reason: e.target.value })}
                placeholder="e.g. Medical Conference, Annual Leave"
                className="med-input text-xs w-full p-3 font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>

            <button type="submit" disabled={busy} className="med-btn-primary text-xs w-full min-h-[44px] font-bold shadow-md focus-visible:ring-2 focus-visible:ring-teal-500">
              {busy ? 'Submitting Leave…' : 'Submit Out of Office Period'}
            </button>
          </form>
        </section>
      )}

      {/* Consultation Entry Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center overflow-y-auto">
          <div className="med-panel bg-white max-w-3xl w-full p-6 sm:p-8 space-y-6 border border-slate-200/90 rounded-3xl shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">Conduct Consultation — {selectedAppt.patient?.name}</h3>
                <p className="text-xs font-bold text-teal-700 mt-0.5">{formatDay(selectedAppt.startTime)} ({formatTimeRange(selectedAppt.startTime, selectedAppt.endTime)})</p>
              </div>
              <button onClick={() => setSelectedAppt(null)} className="med-btn-secondary text-base font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400">×</button>
            </div>

            <form onSubmit={handlePostVisitSubmit} className="space-y-6">
              <div>
                <label htmlFor="clinical-obs" className="block text-xs font-extrabold text-slate-900 mb-1.5">
                  Clinical Observations & Examination Notes <span className="text-red-600">*</span>
                </label>
                <textarea
                  id="clinical-obs"
                  required
                  rows={4}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Record objective clinical observations, physical exam results, and findings…"
                  className="med-input text-xs w-full p-3.5 font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-teal-500"
                />
              </div>

              <div>
                <label htmlFor="clinical-assessment" className="block text-xs font-extrabold text-slate-900 mb-1.5">Confirmed Clinical Diagnosis / Assessment</label>
                <input
                  id="clinical-assessment"
                  type="text"
                  value={confirmedAssessment}
                  onChange={(e) => setConfirmedAssessment(e.target.value)}
                  placeholder="e.g. Primary Hypertension (ICD-10 I10), Acute Sinusitis"
                  className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
                />
              </div>

              <div>
                <label htmlFor="clinical-instructions" className="block text-xs font-extrabold text-slate-900 mb-1.5">Follow-Up Instructions for Patient</label>
                <textarea
                  id="clinical-instructions"
                  rows={2}
                  value={followUpInstructions}
                  onChange={(e) => setFollowUpInstructions(e.target.value)}
                  placeholder="e.g. Schedule follow-up ECG in 2 weeks, monitor blood pressure twice daily"
                  className="med-input text-xs w-full p-3 font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-teal-500"
                />
              </div>

              <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">Prescription Orders</h4>
                    <p className="text-[11px] font-semibold text-slate-600">Doctor-authored prescriptions saved directly to database before AI processing.</p>
                  </div>
                  <button type="button" onClick={addPrescription} className="med-btn-secondary text-xs min-h-[40px] text-emerald-800 border-emerald-300 font-bold focus-visible:ring-2 focus-visible:ring-teal-500">
                    + Add Medication
                  </button>
                </div>

                {prescriptions.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-500 italic">No medications prescribed for this consultation.</p>
                ) : (
                  <div className="space-y-3">
                    {prescriptions.map((p, idx) => (
                      <div key={idx} className="bg-white border border-emerald-200 rounded-xl p-4 space-y-3 shadow-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                          <input
                            type="text"
                            placeholder="Medication Name"
                            value={p.medication}
                            onChange={(e) => updatePrescription(idx, 'medication', e.target.value)}
                            className="med-input text-xs p-2.5 font-bold text-slate-900"
                          />
                          <input
                            type="text"
                            placeholder="Dosage (e.g. 500mg)"
                            value={p.dosage}
                            onChange={(e) => updatePrescription(idx, 'dosage', e.target.value)}
                            className="med-input text-xs p-2.5 font-bold text-slate-900"
                          />
                          <input
                            type="text"
                            placeholder="Frequency (e.g. Twice daily)"
                            value={p.frequency}
                            onChange={(e) => updatePrescription(idx, 'frequency', e.target.value)}
                            className="med-input text-xs p-2.5 font-bold text-slate-900"
                          />
                          <input
                            type="text"
                            placeholder="Duration (e.g. 7 days)"
                            value={p.duration}
                            onChange={(e) => updatePrescription(idx, 'duration', e.target.value)}
                            className="med-input text-xs p-2.5 font-bold text-slate-900"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Special Instructions (e.g. Take after meals)"
                            value={p.instructions}
                            onChange={(e) => updatePrescription(idx, 'instructions', e.target.value)}
                            className="med-input text-xs p-2.5 font-medium text-slate-900 flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => removePrescription(idx)}
                            className="med-btn-secondary text-xs text-red-600 p-2 border-red-200 min-h-[40px] font-bold focus-visible:ring-2 focus-visible:ring-teal-500"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {modalMessage && (
                <div className="text-xs text-emerald-800 bg-emerald-50 p-3.5 rounded-2xl border border-emerald-300 font-extrabold flex items-center gap-2">
                  {modalMessage}
                </div>
              )}
              {modalError && (
                <div className="text-xs text-red-700 bg-red-50 p-3.5 rounded-2xl border border-red-200 font-extrabold flex items-center gap-2">
                  ⚠️ {modalError}
                </div>
              )}
              {aiError && (
                <div className="text-xs text-red-700 bg-red-50 p-3.5 rounded-2xl border border-red-200 font-bold flex items-center gap-2">
                  ⚠️ AI Notice: {aiError}
                </div>
              )}

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => setSelectedAppt(null)} className="med-btn-secondary text-xs min-h-[44px] font-bold focus-visible:ring-2 focus-visible:ring-teal-500">Close</button>
                <button type="submit" disabled={busy} className="med-btn-primary text-xs min-h-[44px] font-bold shadow-md focus-visible:ring-2 focus-visible:ring-teal-500">
                  {busy ? 'Saving Clinical Record…' : summary ? '✓ Saved & Generated (Update Record)' : 'Save Consultation Record & Generate Summary'}
                </button>
              </div>
            </form>

            {summary && (
              <div className="bg-teal-50/60 border border-teal-200 rounded-2xl p-5 text-xs space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wide text-teal-900">Patient-Friendly Explanation Generated</h4>
                <p className="leading-relaxed font-semibold text-slate-800">{summary.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm p-4 flex items-center justify-center">
          <div className="med-panel bg-white max-w-md w-full p-6 space-y-5 border border-red-200 rounded-3xl shadow-2xl">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-red-700">Confirm Appointment Cancellation</h3>
                <p className="text-xs font-bold text-slate-500 mt-0.5">{cancellingAppt.patient?.name} · {formatDay(cancellingAppt.startTime)}</p>
              </div>
              <button onClick={() => setCancellingAppt(null)} className="med-btn-secondary text-base font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400">×</button>
            </div>
            <div>
              <label htmlFor="doc-cancel-reason" className="block text-xs font-bold text-slate-800 mb-1">Reason for Cancellation</label>
              <input
                id="doc-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
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
                <h3 className="text-base font-extrabold text-slate-900">Reschedule Patient Appointment</h3>
                <p className="text-xs font-bold text-teal-700 mt-0.5">Patient: {reschedulingAppt.patient?.name}</p>
              </div>
              <button onClick={() => setReschedulingAppt(null)} className="med-btn-secondary text-base font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400">×</button>
            </div>
            <div>
              <label htmlFor="doc-reschedule-date" className="block text-xs font-bold text-slate-800 mb-1">Select New Date:</label>
              <input
                id="doc-reschedule-date"
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
            <div className="space-y-2">
              <span className="block text-xs font-bold text-slate-800">Select Available Slot:</span>
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
                {rescheduleBusy ? 'Rescheduling…' : 'Confirm New Time Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
