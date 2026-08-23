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

  useEffect(() => {
    loadSchedule();
  }, []);

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

  const openConsultation = (a: any) => {
    setSelectedAppt(a);
    setError('');
    setMessage('');
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

  const submitConsultation = async () => {
    if (!selectedAppt) return;
    if (!observations.trim() && !confirmedAssessment.trim()) {
      setError('Please enter clinical observations or confirmed assessment before completing consultation.');
      return;
    }

    for (let i = 0; i < prescriptions.length; i++) {
      const p = prescriptions[i];
      if (!p.medication.trim() || !p.dosage.trim() || !p.frequency.trim() || !p.duration.trim()) {
        setError(`Prescription #${i + 1} requires medication name, dosage, frequency, and duration.`);
        return;
      }
    }

    setBusy(true);
    setError('');
    setMessage('');
    setAiError(undefined);

    const compositeNotes = [
      observations.trim() ? `Clinical Observations: ${observations.trim()}` : '',
      confirmedAssessment.trim() ? `Confirmed Assessment: ${confirmedAssessment.trim()}` : '',
    ].filter(Boolean).join('\n\n');

    try {
      const res = await fetch('/api/ai/post-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: selectedAppt.id,
          notes: compositeNotes,
          followUpInstructions: followUpInstructions.trim(),
          prescriptions,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete consultation');

      setSummary(data.summary);
      if (data.aiError) {
        setAiError(data.aiError);
        setMessage('Clinician consultation record & prescriptions saved. Patient AI summary was unavailable.');
      } else {
        setMessage('Clinician consultation record saved and patient AI summary generated.');
      }
      await loadSchedule();
    } catch (e: any) {
      setError(e.message || 'Unable to save consultation record');
    } finally {
      setBusy(false);
    }
  };

  const submitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
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
          {error || message}
        </div>
      )}

      {/* Role-Specific Navigation Tabs */}
      <nav className="neu-inset p-1.5 flex flex-wrap gap-2" aria-label="Doctor workspace sections">
        <button
          onClick={() => setSection('schedule')}
          aria-current={section === 'schedule' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            section === 'schedule' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#56616B] hover:text-[#26323B]'
          }`}
        >
          1. Schedule <span className="text-[10px] font-normal">({appointments.length})</span>
        </button>
        <button
          onClick={() => setSection('history')}
          aria-current={section === 'history' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            section === 'history' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#56616B] hover:text-[#26323B]'
          }`}
        >
          2. Patient History
        </button>
        <button
          onClick={() => setSection('leave')}
          aria-current={section === 'leave' ? 'page' : undefined}
          className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
            section === 'leave' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#56616B] hover:text-[#26323B]'
          }`}
        >
          3. Leave & Availability
        </button>
      </nav>

      {/* SECTION 1: SCHEDULE */}
      {section === 'schedule' && (
        <section className="neu-panel p-6 space-y-6" aria-labelledby="schedule-heading">
          <div>
            <h2 id="schedule-heading" className="text-lg font-bold text-[#26323B]">1. Patient Schedule</h2>
            <p className="text-xs font-medium text-[#56616B] mt-0.5">
              History is accessible directly from each assigned patient card.
            </p>
          </div>

          {loading ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
              Loading schedule…
            </div>
          ) : appointments.length === 0 ? (
            <div className="neu-inset p-12 text-center text-xs font-semibold text-[#66727D]">
              Your schedule is clear. No patient appointments are assigned to your session.
            </div>
          ) : (
            <div className="space-y-4">
              {appointments.map((a) => {
                const hasNotes = Boolean(a.consultNotes || a.aiPostSummary);
                const canCancelOrReschedule = a.status === 'CONFIRMED' || a.status === 'HELD';

                return (
                  <article key={a.id} className="neu-card p-6 border border-[#EEF2F7]">
                    <div className="grid md:grid-cols-[280px_1fr_auto] gap-6 items-start">
                      {/* Prominent Date & Time Typography */}
                      <div className="neu-inset p-4 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-[#5667D8]">Appointment Slot</span>
                        <time className="block text-lg font-extrabold text-[#26323B]">{formatDay(a.startTime)}</time>
                        <time className="block text-base font-bold text-[#5667D8]">{formatTimeRange(a.startTime, a.endTime)}</time>
                      </div>

                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-base font-bold text-[#26323B]">{a.patient?.name || 'Assigned Patient'}</h3>
                          <span className={`clinical-badge-${a.status === 'CONFIRMED' ? 'success' : a.status === 'COMPLETED' ? 'neutral' : 'danger'}`}>
                            {a.status}
                          </span>
                          {hasNotes && <span className="clinical-badge-neutral">Notes Complete</span>}
                        </div>
                        <p className="text-xs font-medium text-[#56616B]">
                          <strong className="text-[#26323B] font-bold">Reported Symptoms:</strong> {a.symptoms || 'No symptoms reported.'}
                        </p>
                        <p className="text-[11px] font-semibold text-[#66727D]">
                          Session authorized doctor relationship enforced.
                        </p>
                      </div>

                      {/* Direct Actions Visible Directly On Patient Card */}
                      <div className="flex flex-col gap-2 min-w-[170px]">
                        <button
                          onClick={() => fetchPatientHistory(a.patientId)}
                          disabled={historyLoading && selectedPatientId === a.patientId}
                          className="neu-btn-secondary text-xs min-h-[40px] justify-center"
                        >
                          {historyLoading && selectedPatientId === a.patientId ? 'Loading…' : 'View Patient History'}
                        </button>

                        <button
                          onClick={() => openConsultation(a)}
                          className="neu-btn-primary text-xs min-h-[40px] justify-center"
                        >
                          {a.aiPostSummary ? 'Open Consultation' : 'Complete Consultation'}
                        </button>

                        {canCancelOrReschedule && (
                          <div className="grid grid-cols-2 gap-1.5 pt-1">
                            <button
                              onClick={() => {
                                setReschedulingAppt(a);
                                setRescheduleDate(new Date(a.startTime).toISOString().slice(0, 10));
                              }}
                              className="neu-btn-secondary text-[11px] py-1.5 px-2 justify-center"
                            >
                              Reschedule
                            </button>
                            <button
                              onClick={() => setCancellingAppt(a)}
                              className="neu-btn-secondary text-[11px] py-1.5 px-2 justify-center text-[#B42318] border-[#FECDCA]"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* SECTION 2: PATIENT HISTORY */}
      {section === 'history' && (
        <section className="neu-panel p-6 space-y-6" aria-labelledby="history-heading">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D4D9E2] pb-4">
            <div>
              <h2 id="history-heading" className="text-lg font-bold text-[#26323B]">2. Longitudinal Patient History</h2>
              <p className="text-xs font-medium text-[#56616B] mt-0.5">
                Inspect prior visit records and doctor-authored prescriptions for assigned patients only.
              </p>
            </div>

            {uniquePatients.length > 0 && (
              <div className="flex items-center space-x-3">
                <label htmlFor="patient-select" className="text-xs font-bold text-[#56616B]">Select Patient:</label>
                <select
                  id="patient-select"
                  value={selectedPatientId || ''}
                  onChange={(e) => fetchPatientHistory(e.target.value)}
                  className="neu-input text-xs px-3 py-2 text-[#26323B] font-bold min-h-[44px]"
                >
                  <option value="" disabled>Choose assigned patient…</option>
                  {uniquePatients.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.email})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {historyLoading ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
              Loading authorized patient history…
            </div>
          ) : !patientHistory ? (
            <div className="neu-inset p-12 text-center text-xs font-semibold text-[#66727D]">
              Select a patient above or click "View Patient History" directly on any appointment card.
            </div>
          ) : (
            <div className="space-y-6">
              <div className="neu-card p-5 border border-[#EEF2F7] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#5667D8]">Patient Record</span>
                  <h3 className="text-lg font-extrabold text-[#26323B]">{patientHistory.patient?.name}</h3>
                  <p className="text-xs font-medium text-[#56616B]">{patientHistory.patient?.email}</p>
                </div>
                <span className="clinical-badge-success">{patientHistory.visits?.length || 0} Recorded Visits</span>
              </div>

              {/* Visits List */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-[#26323B]">Prior Visits Assigned to Your Session</h4>
                {patientHistory.visits?.map((v: any) => (
                  <article key={v.id} className="neu-card p-5 border border-[#EEF2F7] space-y-2">
                    <div className="flex justify-between items-center border-b border-[#D4D9E2] pb-2">
                      <span className="font-extrabold text-sm text-[#26323B]">{formatDay(v.startTime)}</span>
                      <span className="clinical-badge-neutral">{v.status}</span>
                    </div>
                    {v.symptoms && <p className="text-xs font-semibold text-[#56616B]"><strong className="text-[#26323B]">Symptoms:</strong> {v.symptoms}</p>}
                    {v.consultNotes && (
                      <div className="neu-inset p-3 text-xs font-medium text-[#26323B] whitespace-pre-wrap">
                        <strong className="block text-[11px] font-bold text-[#56616B] mb-1">Consultation Notes:</strong>
                        {v.consultNotes}
                      </div>
                    )}
                  </article>
                ))}
              </div>

              {/* Prescriptions & Reminders List */}
              {patientHistory.reminders?.length > 0 && (
                <div className="neu-panel p-5 space-y-3 bg-[#E6F4F1] border-2 border-[#16866D]">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#16866D]">Doctor-Authored Prescriptions & Reminders</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {patientHistory.reminders.map((r: any) => (
                      <div key={r.id} className="bg-white border border-[#9EE2D4] rounded-xl p-3.5 text-xs space-y-1">
                        <span className="font-bold text-[#26323B]">{r.medication} · {r.dosage}</span>
                        <p className="text-[#56616B] font-medium">{r.frequency} ({r.duration || '7 days'})</p>
                        {r.instructions && <p className="text-[#66727D] italic text-[11px]">{r.instructions}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: LEAVE & AVAILABILITY */}
      {section === 'leave' && (
        <section className="neu-panel p-6 space-y-6 max-w-3xl" aria-labelledby="leave-heading">
          <div>
            <h2 id="leave-heading" className="text-lg font-bold text-[#26323B]">3. Leave & Availability Management</h2>
            <p className="text-xs font-medium text-[#56616B] mt-0.5">
              Block dates when you are unavailable. Conflicting future appointments will be cancelled and patients notified automatically.
            </p>
          </div>

          <form onSubmit={submitLeave} className="neu-card p-6 space-y-5 border border-[#EEF2F7]">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="leave-start" className="block text-xs font-bold text-[#26323B] mb-1">Start Date *</label>
                <input
                  id="leave-start"
                  required
                  type="date"
                  value={leave.start}
                  onChange={(e) => setLeave({ ...leave, start: e.target.value })}
                  className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="leave-end" className="block text-xs font-bold text-[#26323B] mb-1">End Date *</label>
                <input
                  id="leave-end"
                  required
                  type="date"
                  value={leave.end}
                  onChange={(e) => setLeave({ ...leave, end: e.target.value })}
                  className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
                />
              </div>
            </div>

            <div>
              <label htmlFor="leave-reason" className="block text-xs font-bold text-[#26323B] mb-1">Reason for Leave *</label>
              <input
                id="leave-reason"
                required
                value={leave.reason}
                onChange={(e) => setLeave({ ...leave, reason: e.target.value })}
                placeholder="e.g. Clinical conference, annual leave, personal leave"
                className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
              />
            </div>

            <div className="bg-[#FFF8EB] border-l-4 border-[#A86B00] p-4 text-xs font-medium text-[#A86B00] rounded-r-xl">
              <strong>Warning:</strong> Submitting this leave request will automatically cancel any patient appointments falling within this timeframe and send email notifications to affected patients.
            </div>

            <button disabled={busy} className="neu-btn-primary text-xs w-full justify-center min-h-[44px]">
              {busy ? 'Submitting Leave Request…' : 'Confirm & Submit Leave Request'}
            </button>
          </form>
        </section>
      )}

      {/* Consultation Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center overflow-y-auto">
          <div className="neu-panel bg-[#E0E5EC] max-w-3xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5667D8]">Clinical Consultation Record</span>
                  <span className="clinical-badge-success">Doctor-Authored</span>
                </div>
                <h2 className="text-xl font-extrabold text-[#26323B] mt-1">{selectedAppt.patient?.name}</h2>
                <p className="text-xs font-bold text-[#56616B]">
                  {formatDay(selectedAppt.startTime)} · {formatTimeRange(selectedAppt.startTime, selectedAppt.endTime)}
                </p>
              </div>
              <button
                onClick={() => setSelectedAppt(null)}
                className="neu-btn-secondary text-sm font-bold p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                ×
              </button>
            </div>

            {error && <div className="p-3 bg-[#FEEFEE] border-l-4 border-[#B42318] text-xs font-bold text-[#B42318] rounded-r">{error}</div>}

            {/* Field 1: Clinical Observations & Assessment */}
            <div className="neu-card p-5 space-y-3 border border-[#EEF2F7]">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#26323B]">1. Clinical Observations & Confirmed Assessment</h3>
              <div>
                <label className="block text-xs font-bold text-[#56616B] mb-1">Observations</label>
                <textarea
                  rows={3}
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Record physical exam findings, vital signs, and symptoms history."
                  className="neu-input text-xs w-full p-3 font-medium text-[#26323B]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#56616B] mb-1">Confirmed Clinical Assessment</label>
                <input
                  value={confirmedAssessment}
                  onChange={(e) => setConfirmedAssessment(e.target.value)}
                  placeholder="e.g. Acute bacterial sinusitis"
                  className="neu-input text-xs w-full p-3 font-medium text-[#26323B] min-h-[44px]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#56616B] mb-1">Follow-Up Instructions</label>
                <input
                  value={followUpInstructions}
                  onChange={(e) => setFollowUpInstructions(e.target.value)}
                  placeholder="e.g. Return in 2 weeks or if fever exceeds 101°F."
                  className="neu-input text-xs w-full p-3 font-medium text-[#26323B] min-h-[44px]"
                />
              </div>
            </div>

            {/* Field 2: Doctor-Authored Prescription */}
            <div className="bg-[#E6F4F1] border-2 border-[#16866D] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#16866D]">2. Doctor-Authored Prescriptions</h3>
                  <p className="text-[11px] font-semibold text-[#56616B]">Doctor-authored orders. AI will explain but cannot alter orders.</p>
                </div>
                <button
                  type="button"
                  onClick={addPrescription}
                  className="neu-btn-secondary text-xs bg-white text-[#16866D] border-[#9EE2D4] hover:bg-[#E6F4F1]"
                >
                  + Add Medication
                </button>
              </div>

              {prescriptions.length === 0 ? (
                <div className="neu-inset p-4 text-center text-xs font-semibold text-[#66727D]">
                  No medications prescribed. Click "+ Add Medication" to prescribe.
                </div>
              ) : (
                <div className="space-y-3">
                  {prescriptions.map((p, idx) => (
                    <div key={idx} className="bg-white border border-[#9EE2D4] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="text-xs font-extrabold text-[#16866D]">Medication Order #{idx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removePrescription(idx)}
                          className="text-xs font-bold text-[#B42318] hover:underline"
                        >
                          Remove Order
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-[#26323B] mb-1">Medication Name *</label>
                          <input
                            required
                            value={p.medication}
                            onChange={(e) => updatePrescription(idx, 'medication', e.target.value)}
                            placeholder="e.g. Amoxicillin"
                            className="neu-input text-xs w-full p-2.5 font-bold text-[#26323B]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#26323B] mb-1">Dosage *</label>
                          <input
                            required
                            value={p.dosage}
                            onChange={(e) => updatePrescription(idx, 'dosage', e.target.value)}
                            placeholder="e.g. 500mg"
                            className="neu-input text-xs w-full p-2.5 font-bold text-[#26323B]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#26323B] mb-1">Frequency *</label>
                          <input
                            required
                            value={p.frequency}
                            onChange={(e) => updatePrescription(idx, 'frequency', e.target.value)}
                            placeholder="e.g. Twice daily with food"
                            className="neu-input text-xs w-full p-2.5 font-bold text-[#26323B]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-[#26323B] mb-1">Duration *</label>
                          <input
                            required
                            value={p.duration}
                            onChange={(e) => updatePrescription(idx, 'duration', e.target.value)}
                            placeholder="e.g. 7 days"
                            className="neu-input text-xs w-full p-2.5 font-bold text-[#26323B]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-[#26323B] mb-1">Special Instructions</label>
                        <input
                          value={p.instructions}
                          onChange={(e) => updatePrescription(idx, 'instructions', e.target.value)}
                          placeholder="e.g. Take with food. Complete entire course."
                          className="neu-input text-xs w-full p-2.5 font-bold text-[#26323B]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-[#D4D9E2] pt-4">
              <p className="text-xs font-semibold text-[#66727D]">Clinician authority confirmed. AI formats patient summary.</p>
              <button
                onClick={submitConsultation}
                disabled={busy}
                className="neu-btn-primary text-xs min-h-[44px]"
              >
                {busy ? 'Saving & Generating Summary…' : 'Save Record & Generate Explanation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancellingAppt && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center">
          <div className="neu-panel bg-[#E0E5EC] max-w-md w-full p-6 space-y-5 border border-[#FECDCA]">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#B42318]">Confirm Appointment Cancellation</h3>
                <p className="text-xs font-semibold text-[#56616B] mt-0.5">
                  Patient: {cancellingAppt.patient?.name} · {formatDay(cancellingAppt.startTime)}
                </p>
              </div>
              <button onClick={() => setCancellingAppt(null)} className="neu-btn-secondary text-sm font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>

            <div>
              <label htmlFor="doc-cancel-reason" className="block text-xs font-bold text-[#26323B] mb-1">Cancellation Reason</label>
              <input
                id="doc-cancel-reason"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Doctor schedule update"
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
                <p className="text-xs font-semibold text-[#5667D8] mt-0.5">
                  Patient: {reschedulingAppt.patient?.name}
                </p>
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
                {rescheduleBusy ? 'Rescheduling…' : 'Confirm New Appointment Time'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
