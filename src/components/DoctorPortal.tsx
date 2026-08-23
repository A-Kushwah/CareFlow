'use client';

import { useEffect, useState } from 'react';

type Section = 'schedule' | 'leave';
const day = (v: string) => new Date(v).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
const time = (v: string) => new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
  const [selected, setSelected] = useState<any | null>(null);
  const [history, setHistory] = useState<any | null>(null);

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

  const load = async () => {
    setLoading(true);
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
    load();
  }, []);

  const openConsultation = (a: any) => {
    setSelected(a);
    setError('');
    setMessage('');
    setAiError(undefined);

    // Parse existing consultNotes if JSON structured
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
    setHistory(null);
  };

  const addPrescription = () => {
    setPrescriptions([
      ...prescriptions,
      { medication: '', dosage: '500mg', frequency: 'Once daily', duration: '7 days', instructions: 'Take as directed' },
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

  const openHistory = async (a: any) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/patients/${a.patientId}/history`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setHistory(data);
    } catch (e: any) {
      setError(e.message || 'Unable to load patient history');
    } finally {
      setBusy(false);
    }
  };

  const generate = async () => {
    if (!selected) return;
    if (!observations.trim() && !confirmedAssessment.trim()) {
      setError('Please enter clinical observations or confirmed assessment before completing consultation.');
      return;
    }

    // Validate prescriptions if any
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
          appointmentId: selected.id,
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
      await load();
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
      setMessage(`${data.cancelledAppointmentsCount || 0} conflicting appointments cancelled and patients notified.`);
      setLeave({ start: '', end: '', reason: '' });
      await load();
    } catch (e: any) {
      setError(e.message || 'Unable to submit leave');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Doctor workspace</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Clinical operations</h1>
          <p className="text-sm text-slate-500 mt-1">Review the patient queue, record doctor-authored prescriptions, and maintain visit summaries.</p>
        </div>
        <button onClick={load} className="btn-secondary text-xs">Refresh schedule</button>
      </header>

      {(message || error) && (
        <div className={`p-3 border-l-4 text-sm rounded-r ${error ? 'bg-rose-50 border-rose-600 text-rose-900' : 'bg-emerald-50 border-emerald-600 text-emerald-900'}`}>
          {error || message}
        </div>
      )}

      <nav className="flex gap-2 border-b border-slate-200" aria-label="Doctor workspace sections">
        <button onClick={() => setSection('schedule')} className={`px-4 py-3 text-sm font-semibold border-b-2 ${section === 'schedule' ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-500'}`}>
          Schedule <span className="text-xs font-normal">({appointments.length})</span>
        </button>
        <button onClick={() => setSection('leave')} className={`px-4 py-3 text-sm font-semibold border-b-2 ${section === 'leave' ? 'border-slate-950 text-slate-950' : 'border-transparent text-slate-500'}`}>
          Leave & availability
        </button>
      </nav>

      {section === 'schedule' ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Patient schedule</h2>
            <p className="text-sm text-slate-500">History is available directly from each assigned patient card.</p>
          </div>
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">Loading your schedule…</div>
          ) : appointments.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-lg p-12 text-center text-sm text-slate-500">
              Your schedule is clear. No appointments are currently assigned to you.
            </div>
          ) : (
            <div className="space-y-3">
              {appointments.map((a) => (
                <article key={a.id} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
                  <div className="grid md:grid-cols-[230px_1fr_auto] gap-5 items-start">
                    <div className="border-r border-slate-200 pr-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Appointment</p>
                      <p className="text-base font-bold text-slate-950 mt-1">{day(a.startTime)}</p>
                      <p className="text-lg font-semibold text-slate-800 mt-1">
                        {time(a.startTime)} <span className="text-slate-400 text-sm font-normal">— {time(a.endTime)}</span>
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-semibold text-slate-950">{a.patient?.name || 'Patient'}</h3>
                        <span className={`badge-${a.status === 'CONFIRMED' ? 'emerald' : a.status === 'CANCELLED' ? 'rose' : 'slate'}`}>
                          {a.status}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600">
                        <span className="font-semibold text-slate-800">Symptoms:</span> {a.symptoms || 'No symptoms provided.'}
                      </p>
                      <p className="text-xs text-slate-500">Only your assigned patient relationship can open history.</p>
                    </div>
                    <div className="flex md:flex-col gap-2 md:min-w-[150px]">
                      <button onClick={() => openHistory(a)} className="btn-secondary text-xs whitespace-nowrap">
                        {busy ? 'Loading…' : 'Patient history'}
                      </button>
                      <button onClick={() => openConsultation(a)} className="btn-primary text-xs whitespace-nowrap">
                        {a.aiPostSummary ? 'Open consultation' : 'Complete consultation'}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="max-w-3xl space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Leave & availability</h2>
            <p className="text-sm text-slate-500">Block dates when you are unavailable. Conflicting future appointments will be cancelled and patients notified.</p>
          </div>
          <form onSubmit={submitLeave} className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <label className="text-sm font-medium">
                Start date
                <input required type="date" value={leave.start} onChange={(e) => setLeave({ ...leave, start: e.target.value })} className="mt-1 w-full p-3 text-sm border border-slate-300 rounded" />
              </label>
              <label className="text-sm font-medium">
                End date
                <input required type="date" value={leave.end} onChange={(e) => setLeave({ ...leave, end: e.target.value })} className="mt-1 w-full p-3 text-sm border border-slate-300 rounded" />
              </label>
            </div>
            <label className="text-sm font-medium">
              Reason
              <input required value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} placeholder="Annual leave, conference, personal leave" className="mt-1 w-full p-3 text-sm border border-slate-300 rounded" />
            </label>
            <button disabled={busy} className="btn-primary text-sm">
              {busy ? 'Submitting leave…' : 'Submit leave dates'}
            </button>
          </form>
        </section>
      )}

      {/* Patient History Modal */}
      {history && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 p-4 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-5">
            <div className="flex justify-between border-b border-slate-200 pb-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-700">Longitudinal record</p>
                <h2 className="text-xl font-semibold">{history.patient.name}</h2>
                <p className="text-sm text-slate-500">Prior visits assigned to you</p>
              </div>
              <button onClick={() => setHistory(null)} className="text-xl text-slate-400">×</button>
            </div>
            {history.visits.map((v: any) => (
              <article key={v.id} className="border border-slate-200 rounded p-4">
                <div className="flex justify-between">
                  <p className="font-semibold text-sm">{day(v.startTime)}</p>
                  <span className="badge-slate">{v.status}</span>
                </div>
                {v.symptoms && <p className="text-sm mt-2"><strong>Symptoms:</strong> {v.symptoms}</p>}
                {v.consultNotes && <p className="text-sm mt-2 whitespace-pre-wrap"><strong>Consultation notes:</strong> {v.consultNotes}</p>}
              </article>
            ))}
            {history.reminders?.length > 0 && (
              <div className="border-t border-slate-200 pt-4">
                <h3 className="font-semibold text-sm">Doctor-Authored Prescriptions</h3>
                {history.reminders.map((r: any) => (
                  <p key={r.id} className="text-sm mt-2">{r.medication} · {r.dosage} · {r.frequency} ({r.duration || '7 days'}) — {r.instructions}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Consultation & Prescription Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 p-4 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex justify-between border-b border-slate-200 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Clinical Consultation Record</p>
                  <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded">Doctor-Authored</span>
                </div>
                <h2 className="text-xl font-semibold text-slate-950 mt-1">{selected.patient?.name}</h2>
                <p className="text-sm font-medium text-slate-600">{day(selected.startTime)} · {time(selected.startTime)}–{time(selected.endTime)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-2xl text-slate-400 hover:text-slate-600">×</button>
            </div>

            {error && <div className="p-3 bg-rose-50 border-l-4 border-rose-600 text-xs text-rose-900 rounded-r">{error}</div>}

            {/* Section 1: Clinical Notes */}
            <div className="space-y-3 bg-slate-50 border border-slate-200 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <span>1. Clinical Notes</span>
                <span className="text-xs font-normal text-slate-500">(Clinician Observations & Assessment)</span>
              </h3>
              <div>
                <label className="text-xs font-medium text-slate-700">Observations</label>
                <textarea rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} className="mt-1 w-full p-2.5 text-sm border border-slate-300 rounded bg-white" placeholder="Record physical exam findings, patient history notes, and symptom assessment." />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Confirmed Clinical Assessment</label>
                <input value={confirmedAssessment} onChange={(e) => setConfirmedAssessment(e.target.value)} className="mt-1 w-full p-2 text-sm border border-slate-300 rounded bg-white" placeholder="e.g. Acute bacterial sinusitis" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-700">Follow-up Instructions</label>
                <input value={followUpInstructions} onChange={(e) => setFollowUpInstructions(e.target.value)} className="mt-1 w-full p-2 text-sm border border-slate-300 rounded bg-white" placeholder="e.g. Return in 2 weeks or if fever persists above 101°F." />
              </div>
            </div>

            {/* Section 2: Doctor-Authored Prescription */}
            <div className="space-y-3 bg-emerald-50/50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-emerald-950">2. Doctor-Authored Prescription</h3>
                  <p className="text-xs text-slate-600">Enter explicit medication orders. AI will explain these orders but cannot alter or create prescriptions.</p>
                </div>
                <button onClick={addPrescription} type="button" className="btn-secondary text-xs bg-white border-emerald-300 text-emerald-900 hover:bg-emerald-100">
                  + Add Medication
                </button>
              </div>

              {prescriptions.length === 0 ? (
                <div className="p-4 text-center border border-dashed border-emerald-200 rounded text-xs text-slate-500 bg-white">
                  No medications prescribed for this consultation. Click "+ Add Medication" to prescribe.
                </div>
              ) : (
                <div className="space-y-3">
                  {prescriptions.map((p, idx) => (
                    <div key={idx} className="bg-white border border-emerald-200 rounded p-3 space-y-2 relative">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="text-xs font-bold text-emerald-900">Medication #{idx + 1}</span>
                        <button onClick={() => removePrescription(idx)} type="button" className="text-xs text-rose-600 font-semibold hover:underline">
                          Remove
                        </button>
                      </div>
                      <div className="grid sm:grid-cols-2 gap-2">
                        <label className="text-xs text-slate-700 font-medium">
                          Medication Name *
                          <input required value={p.medication} onChange={(e) => updatePrescription(idx, 'medication', e.target.value)} placeholder="e.g. Amoxicillin" className="mt-0.5 w-full p-2 text-xs border border-slate-300 rounded" />
                        </label>
                        <label className="text-xs text-slate-700 font-medium">
                          Dosage *
                          <input required value={p.dosage} onChange={(e) => updatePrescription(idx, 'dosage', e.target.value)} placeholder="e.g. 500mg" className="mt-0.5 w-full p-2 text-xs border border-slate-300 rounded" />
                        </label>
                        <label className="text-xs text-slate-700 font-medium">
                          Frequency *
                          <input required value={p.frequency} onChange={(e) => updatePrescription(idx, 'frequency', e.target.value)} placeholder="e.g. Every 8 hours with food" className="mt-0.5 w-full p-2 text-xs border border-slate-300 rounded" />
                        </label>
                        <label className="text-xs text-slate-700 font-medium">
                          Duration *
                          <input required value={p.duration} onChange={(e) => updatePrescription(idx, 'duration', e.target.value)} placeholder="e.g. 7 days" className="mt-0.5 w-full p-2 text-xs border border-slate-300 rounded" />
                        </label>
                      </div>
                      <label className="text-xs text-slate-700 font-medium block">
                        Special Instructions
                        <input value={p.instructions} onChange={(e) => updatePrescription(idx, 'instructions', e.target.value)} placeholder="e.g. Complete entire course even if symptoms resolve." className="mt-0.5 w-full p-2 text-xs border border-slate-300 rounded" />
                      </label>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <p className="text-xs text-slate-500">Prescriptions are confirmed by the doctor. AI will format the patient summary.</p>
              <button onClick={generate} disabled={busy} className="btn-primary text-sm px-5 py-2.5">
                {busy ? 'Saving & Generating Summary…' : 'Save Notes & Generate Patient Summary'}
              </button>
            </div>

            {/* AI Summary / Error Section */}
            {aiError && (
              <div className="bg-amber-50 border border-amber-200 rounded p-4 text-xs space-y-2 text-amber-900">
                <div className="flex items-center justify-between font-semibold">
                  <span>Patient Summary Status</span>
                  <span className="bg-amber-200 text-amber-900 text-[10px] px-2 py-0.5 rounded">AI Unavailable</span>
                </div>
                <p>Patient summary unavailable — clinician-entered prescription remains available.</p>
                <p className="text-amber-700">Reason: {aiError}</p>
                <button onClick={generate} disabled={busy} className="mt-1 btn-secondary text-xs bg-white text-amber-900 border-amber-300">
                  Retry generating AI summary
                </button>
              </div>
            )}

            {summary && !aiError && (
              <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-xs space-y-3">
                <div className="flex items-center justify-between border-b border-emerald-200 pb-2">
                  <h3 className="font-semibold text-emerald-950 text-sm">Patient-Facing Follow-Up Output</h3>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">AI Explanation Formatted</span>
                </div>
                <p className="text-slate-800 text-xs leading-5">{summary.summary}</p>
                {summary.medicationSummary?.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-semibold text-emerald-950">Formatted Medication Explanations:</p>
                    {summary.medicationSummary.map((m: any, i: number) => (
                      <p key={i} className="text-slate-700">• <strong>{m.medication} ({m.dosage})</strong>: {m.frequency} for {m.duration || 'duration as ordered'}. {m.instructions}</p>
                    ))}
                  </div>
                )}
                {summary.patientInstructions?.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-semibold text-emerald-950">Patient Instructions:</p>
                    {summary.patientInstructions.map((item: string, i: number) => (
                      <p key={i} className="text-slate-700">• {item}</p>
                    ))}
                  </div>
                )}
                <p className="text-[11px] italic text-slate-500 border-t border-emerald-200 pt-2">{summary.disclaimer}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
