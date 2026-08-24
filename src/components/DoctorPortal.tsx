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
      await loadSchedule();
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

    if (!observations.trim()) {
      setError('Please provide clinical notes before submitting.');
      return;
    }

    for (const p of prescriptions) {
      if (!p.medication.trim()) {
        setError('Medication name is required for all prescribed items.');
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

      if (data.stage1Success) {
        setMessage('Stage 1 Complete: Doctor notes, prescriptions, and medication reminders saved successfully!');
      }

      if (data.aiSummary) {
        setSummary(data.aiSummary);
      } else if (data.aiError) {
        setAiError(data.aiError);
      }

      await loadSchedule();
    } catch (e: any) {
      setError(e.message || 'Submission error');
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
      <header className="neu-panel p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#5667D8]">Clinician Workstation</span>
          <h1 className="text-2xl font-extrabold text-[#26323B] mt-1">Doctor Schedule & Clinical Operations</h1>
          <p className="text-xs font-medium text-[#56616B] mt-1">
            Review patient queue, prescribe medication orders, inspect patient history, and manage availability.
          </p>
        </div>
        <button onClick={loadSchedule} className="neu-btn-secondary text-xs font-bold min-h-[44px]">
          Refresh Schedule
        </button>
      </header>

      {(message || error) && (
        <div className={`p-4 border-l-4 text-xs font-bold rounded-r-xl ${error ? 'bg-[#FEEFEE] border-[#B42318] text-[#B42318]' : 'bg-[#E6F4F1] border-[#16866D] text-[#16866D]'}`}>
          <p>{error || message}</p>
          {error.includes('GOOGLE_CLIENT_ID') && (
            <p className="text-[11px] font-normal text-[#56616B] mt-1">
              To enable Google OAuth calendar sync, set <code className="bg-white px-1 py-0.5 rounded border">GOOGLE_CLIENT_ID</code> and <code className="bg-white px-1 py-0.5 rounded border">GOOGLE_CLIENT_SECRET</code> in your local <code className="bg-white px-1 py-0.5 rounded border">.env</code> file.
            </p>
          )}
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
              ? `Authorized for ${accountEmail || 'your Google account'}. Patient appointments auto-sync directly to your professional calendar.`
              : isReauth
              ? 'Your Google OAuth token was revoked or expired. Please re-authorize to resume automated calendar sync.'
              : 'Connect your personal Google Calendar to automatically synchronize patient consultation invites.'}
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

      {/* Role-Specific Navigation Tabs */}
      <nav className="neu-inset p-1.5 flex flex-wrap gap-2" aria-label="Doctor workspace sections">
        <button
          onClick={() => setSection('schedule')}
          aria-current={section === 'schedule' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            section === 'schedule' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#56616B] hover:text-[#26323B]'
          }`}
        >
          Daily Schedule & Consultations ({appointments.length})
        </button>
        <button
          onClick={() => setSection('history')}
          aria-current={section === 'history' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            section === 'history' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#56616B] hover:text-[#26323B]'
          }`}
        >
          Patient History Explorer ({uniquePatients.length})
        </button>
        <button
          onClick={() => setSection('leave')}
          aria-current={section === 'leave' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            section === 'leave' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#56616B] hover:text-[#26323B]'
          }`}
        >
          Manage Leave & Out of Office
        </button>
      </nav>

      {/* Section 1: Schedule */}
      {section === 'schedule' && (
        <section className="neu-panel p-6 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-[#26323B]">Appointments & Consultation Queue</h2>
              <p className="text-xs font-medium text-[#56616B]">Select an appointment to open consultation entry.</p>
            </div>
          </div>

          {loading ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">Loading appointments…</div>
          ) : appointments.length === 0 ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">No appointments scheduled.</div>
          ) : (
            <div className="space-y-4">
              {appointments.map((a) => (
                <div key={a.id} className="neu-card p-5 border border-[#EEF2F7] space-y-4">
                  <div className="grid md:grid-cols-[220px_1fr_auto] gap-4 items-start">
                    <div className="neu-inset p-3.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#5667D8]">Scheduled Time</span>
                      <p className="text-sm font-extrabold text-[#26323B]">{formatDay(a.startTime)}</p>
                      <p className="text-xs font-bold text-[#5667D8]">{formatTimeRange(a.startTime, a.endTime)}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-base font-bold text-[#26323B]">{a.patient?.name}</span>
                        <span className="text-xs font-medium text-[#56616B]">({a.patient?.email})</span>
                        <span className={`clinical-badge-${a.status === 'CONFIRMED' ? 'success' : a.status === 'COMPLETED' ? 'neutral' : 'warning'}`}>
                          {a.status}
                        </span>
                      </div>

                      {a.symptoms && (
                        <div className="text-xs text-[#26323B] bg-[#EEF2F7] p-2.5 rounded-xl border border-[#D4D9E2]">
                          <strong className="font-bold text-[#26323B]">Chief Complaint:</strong> {a.symptoms}
                        </div>
                      )}

                      {a.aiPreSummary ? (
                        <div className="text-xs text-[#5667D8] bg-[#E8EAFA] p-2.5 rounded-xl border border-[#5667D8]/20">
                          <strong className="font-bold">AI Pre-Visit Triage Summary:</strong> {a.aiPreSummary}
                        </div>
                      ) : (
                        a.symptoms && (
                          <div className="pt-1">
                            <button
                              onClick={() => handleGeneratePreSummary(a.id, a.symptoms)}
                              disabled={generatingPreId === a.id}
                              className="text-xs font-bold text-[#5667D8] hover:underline flex items-center gap-1.5"
                            >
                              {generatingPreId === a.id ? '✨ Generating AI Pre-Visit Triage…' : '✨ Generate AI Pre-Visit Triage Summary'}
                            </button>
                          </div>
                        )
                      )}
                    </div>

                    <div className="flex flex-col gap-2 min-w-[170px]">
                      <button onClick={() => openApptModal(a)} className="neu-btn-primary text-xs justify-center min-h-[40px]">
                        {a.status === 'COMPLETED' ? 'Edit Consultation' : 'Conduct Consultation'}
                      </button>
                      <button onClick={() => fetchPatientHistory(a.patientId)} className="neu-btn-secondary text-xs justify-center min-h-[40px]">
                        View Patient History
                      </button>
                      {a.status === 'CONFIRMED' && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => {
                              setReschedulingAppt(a);
                              setRescheduleDate(new Date(a.startTime).toISOString().slice(0, 10));
                            }}
                            className="neu-btn-secondary text-[11px] min-h-[36px] flex-1 justify-center"
                          >
                            Reschedule
                          </button>
                          <button
                            onClick={() => setCancellingAppt(a)}
                            className="neu-btn-secondary text-[11px] min-h-[36px] flex-1 justify-center text-[#B42318] border-[#FECDCA]"
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
        <section className="neu-panel p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-[#26323B]">Patient History Explorer</h2>
            <p className="text-xs font-medium text-[#56616B]">Historical consultation notes and prescriptions for your assigned patients.</p>
          </div>

          <div className="flex flex-wrap gap-2 pb-2 border-b border-[#D4D9E2]">
            {uniquePatients.map((p: any) => (
              <button
                key={p.id}
                onClick={() => fetchPatientHistory(p.id)}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all min-h-[40px] ${
                  selectedPatientId === p.id ? 'neu-btn-active bg-[#5667D8] text-white' : 'neu-btn-secondary'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>

          {historyLoading ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">Loading patient history…</div>
          ) : !patientHistory ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">Select a patient above to view history.</div>
          ) : (
            <div className="space-y-6">
              <div className="neu-card p-5 border border-[#EEF2F7]">
                <h3 className="text-base font-extrabold text-[#26323B]">{patientHistory.patient?.name}</h3>
                <p className="text-xs font-semibold text-[#56616B]">{patientHistory.patient?.email}</p>
              </div>

              <div className="space-y-4">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#26323B]">Past Consultation History ({patientHistory.history?.length || 0})</h4>
                {patientHistory.history?.map((h: any) => (
                  <div key={h.id} className="neu-card p-5 border border-[#EEF2F7] space-y-3">
                    <div className="flex justify-between items-center border-b border-[#D4D9E2] pb-2">
                      <span className="text-xs font-extrabold text-[#26323B]">{formatDay(h.startTime)} at {formatTimeRange(h.startTime, h.endTime)}</span>
                      <span className="clinical-badge-neutral">{h.status}</span>
                    </div>
                    {h.symptoms && <p className="text-xs text-[#56616B]"><strong className="text-[#26323B]">Symptoms:</strong> {h.symptoms}</p>}
                    {h.consultNotes && (
                      <div className="bg-[#EEF2F7] p-3 rounded-xl text-xs text-[#26323B] space-y-1">
                        <strong className="block text-[11px] font-bold uppercase text-[#5667D8]">Doctor Notes:</strong>
                        <p className="whitespace-pre-wrap">{h.consultNotes}</p>
                      </div>
                    )}
                    {h.prescriptions?.length > 0 && (
                      <div className="bg-[#E6F4F1] p-3 rounded-xl text-xs space-y-1 text-[#16866D]">
                        <strong className="block text-[11px] font-bold uppercase">Prescriptions:</strong>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {h.prescriptions.map((px: any, idx: number) => (
                            <li key={idx}><strong className="font-bold">{px.medication}</strong> {px.dosage} ({px.frequency}, {px.duration})</li>
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
        <section className="neu-panel p-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-[#26323B]">Manage Doctor Leave & Out of Office</h2>
            <p className="text-xs font-medium text-[#56616B]">Submitting leave will automatically cancel conflicting patient appointments and queue email notifications.</p>
          </div>

          <form onSubmit={handleLeaveSubmit} className="max-w-xl space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#26323B] mb-1">Start Date</label>
              <input
                type="date"
                required
                value={leave.start}
                onChange={(e) => setLeave({ ...leave, start: e.target.value })}
                className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#26323B] mb-1">End Date</label>
              <input
                type="date"
                required
                value={leave.end}
                onChange={(e) => setLeave({ ...leave, end: e.target.value })}
                className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#26323B] mb-1">Reason for Leave</label>
              <textarea
                required
                rows={3}
                value={leave.reason}
                onChange={(e) => setLeave({ ...leave, reason: e.target.value })}
                placeholder="e.g. Medical Conference, Annual Leave"
                className="neu-input text-xs w-full p-3 font-bold text-[#26323B]"
              />
            </div>

            <button type="submit" disabled={busy} className="neu-btn-primary text-xs w-full min-h-[44px]">
              {busy ? 'Submitting Leave…' : 'Submit Out of Office Period'}
            </button>
          </form>
        </section>
      )}

      {/* Consultation Entry Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center overflow-y-auto">
          <div className="neu-panel bg-[#E0E5EC] max-w-3xl w-full p-6 space-y-6 border border-[#EEF2F7] my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-[#26323B]">Conduct Consultation — {selectedAppt.patient?.name}</h3>
                <p className="text-xs font-semibold text-[#5667D8]">{formatDay(selectedAppt.startTime)} ({formatTimeRange(selectedAppt.startTime, selectedAppt.endTime)})</p>
              </div>
              <button onClick={() => setSelectedAppt(null)} className="neu-btn-secondary text-sm font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>

            <form onSubmit={handlePostVisitSubmit} className="space-y-6">
              <div>
                <label htmlFor="clinical-obs" className="block text-xs font-extrabold text-[#26323B] mb-1">
                  Clinical Observations & Examination Notes <span className="text-[#B42318]">*</span>
                </label>
                <textarea
                  id="clinical-obs"
                  required
                  rows={4}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Record objective clinical observations, physical exam results, and findings…"
                  className="neu-input text-xs w-full p-3.5 font-semibold text-[#26323B]"
                />
              </div>

              <div>
                <label htmlFor="clinical-assessment" className="block text-xs font-extrabold text-[#26323B] mb-1">Confirmed Clinical Diagnosis / Assessment</label>
                <input
                  id="clinical-assessment"
                  type="text"
                  value={confirmedAssessment}
                  onChange={(e) => setConfirmedAssessment(e.target.value)}
                  placeholder="e.g. Primary Hypertension (ICD-10 I10), Acute Sinusitis"
                  className="neu-input text-xs w-full p-3 font-semibold text-[#26323B] min-h-[44px]"
                />
              </div>

              <div>
                <label htmlFor="clinical-instructions" className="block text-xs font-extrabold text-[#26323B] mb-1">Follow-Up Instructions for Patient</label>
                <textarea
                  id="clinical-instructions"
                  rows={2}
                  value={followUpInstructions}
                  onChange={(e) => setFollowUpInstructions(e.target.value)}
                  placeholder="e.g. Schedule follow-up ECG in 2 weeks, monitor blood pressure twice daily"
                  className="neu-input text-xs w-full p-3 font-semibold text-[#26323B]"
                />
              </div>

              <div className="bg-[#E6F4F1] border border-[#9EE2D4] rounded-2xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#16866D]">Prescription Orders</h4>
                    <p className="text-[11px] font-semibold text-[#56616B]">Doctor-authored prescriptions saved directly to database before AI processing.</p>
                  </div>
                  <button type="button" onClick={addPrescription} className="neu-btn-secondary text-xs min-h-[40px] text-[#16866D] border-[#9EE2D4]">
                    + Add Medication
                  </button>
                </div>

                {prescriptions.length === 0 ? (
                  <p className="text-xs font-semibold text-[#66727D] italic">No medications prescribed for this consultation.</p>
                ) : (
                  <div className="space-y-3">
                    {prescriptions.map((p, idx) => (
                      <div key={idx} className="bg-white border border-[#9EE2D4] rounded-xl p-3.5 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <input
                            type="text"
                            placeholder="Medication Name"
                            value={p.medication}
                            onChange={(e) => updatePrescription(idx, 'medication', e.target.value)}
                            className="neu-input text-xs p-2.5 font-bold text-[#26323B]"
                          />
                          <input
                            type="text"
                            placeholder="Dosage (e.g. 500mg)"
                            value={p.dosage}
                            onChange={(e) => updatePrescription(idx, 'dosage', e.target.value)}
                            className="neu-input text-xs p-2.5 font-bold text-[#26323B]"
                          />
                          <input
                            type="text"
                            placeholder="Frequency (e.g. Twice daily)"
                            value={p.frequency}
                            onChange={(e) => updatePrescription(idx, 'frequency', e.target.value)}
                            className="neu-input text-xs p-2.5 font-bold text-[#26323B]"
                          />
                          <input
                            type="text"
                            placeholder="Duration (e.g. 7 days)"
                            value={p.duration}
                            onChange={(e) => updatePrescription(idx, 'duration', e.target.value)}
                            className="neu-input text-xs p-2.5 font-bold text-[#26323B]"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Special Instructions (e.g. Take after meals)"
                            value={p.instructions}
                            onChange={(e) => updatePrescription(idx, 'instructions', e.target.value)}
                            className="neu-input text-xs p-2.5 font-medium text-[#26323B] flex-1"
                          />
                          <button
                            type="button"
                            onClick={() => removePrescription(idx)}
                            className="neu-btn-secondary text-xs text-[#B42318] p-2 border-[#FECDCA] min-h-[40px]"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#D4D9E2]">
                <button type="button" onClick={() => setSelectedAppt(null)} className="neu-btn-secondary text-xs min-h-[44px]">Close</button>
                <button type="submit" disabled={busy} className="neu-btn-primary text-xs min-h-[44px]">
                  {busy ? 'Saving Clinical Record…' : 'Save Consultation Record & Generate Summary'}
                </button>
              </div>
            </form>

            {summary && (
              <div className="bg-[#EEF2F7] border border-[#5667D8]/30 rounded-2xl p-5 text-xs space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-wide text-[#5667D8]">Patient-Friendly Explanation Generated</h4>
                <p className="leading-5 font-medium text-[#26323B]">{summary.summary}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center">
          <div className="neu-panel bg-[#E0E5EC] max-w-md w-full p-6 space-y-5 border border-[#FECDCA]">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#B42318]">Confirm Appointment Cancellation</h3>
                <p className="text-xs font-semibold text-[#56616B] mt-0.5">{cancellingAppt.patient?.name} · {formatDay(cancellingAppt.startTime)}</p>
              </div>
              <button onClick={() => setCancellingAppt(null)} className="neu-btn-secondary text-sm font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>
            <div>
              <label htmlFor="doc-cancel-reason" className="block text-xs font-bold text-[#26323B] mb-1">Reason for Cancellation</label>
              <input
                id="doc-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
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
                <h3 className="text-base font-extrabold text-[#26323B]">Reschedule Patient Appointment</h3>
                <p className="text-xs font-semibold text-[#5667D8] mt-0.5">Patient: {reschedulingAppt.patient?.name}</p>
              </div>
              <button onClick={() => setReschedulingAppt(null)} className="neu-btn-secondary text-sm font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>
            <div>
              <label htmlFor="doc-reschedule-date" className="block text-xs font-bold text-[#26323B] mb-1">Select New Date:</label>
              <input
                id="doc-reschedule-date"
                type="date"
                value={rescheduleDate}
                onChange={(e) => setRescheduleDate(e.target.value)}
                className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
              />
            </div>
            <div className="space-y-2">
              <span className="block text-xs font-bold text-[#26323B]">Select Available Slot:</span>
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
                {rescheduleBusy ? 'Rescheduling…' : 'Confirm New Time Slot'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
