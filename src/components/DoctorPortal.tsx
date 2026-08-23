'use client';

import { useState, useEffect } from 'react';

export default function DoctorPortal() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loadingAppts, setLoadingAppts] = useState(true);
  const [selectedAppt, setSelectedAppt] = useState<any | null>(null);
  const [notes, setNotes] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState('');
  const [generatedSummary, setGeneratedSummary] = useState<any | null>(null);

  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [submittingLeave, setSubmittingLeave] = useState(false);
  const [leaveMsg, setLeaveMsg] = useState('');

  const fetchAppointments = () => {
    setLoadingAppts(true);
    fetch('/api/appointments')
      .then((res) => res.json())
      .then((data) => {
        if (data.appointments) {
          setAppointments(data.appointments);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingAppts(false));
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const handleGeneratePostVisit = async () => {
    if (!selectedAppt || !notes.trim()) {
      setAiError('Please enter clinical consultation notes before generating instructions.');
      return;
    }

    setGeneratingAi(true);
    setAiError('');

    try {
      const res = await fetch('/api/ai/post-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: selectedAppt.id,
          notes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error || 'Failed to generate post-visit instructions.');
        setGeneratingAi(false);
        return;
      }

      setGeneratedSummary(data.summary);
      fetchAppointments();
    } catch {
      setAiError('AI Provider service unavailable. Please retry or enter manual instructions.');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveStartDate || !leaveEndDate || !leaveReason) return;

    setSubmittingLeave(true);
    setLeaveMsg('');

    try {
      const res = await fetch('/api/doctors/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: leaveStartDate,
          endDate: leaveEndDate,
          reason: leaveReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLeaveMsg(`Leave registered successfully. ${data.cancelledAppointmentsCount} conflicting appointments cancelled.`);
        setLeaveStartDate('');
        setLeaveEndDate('');
        setLeaveReason('');
        fetchAppointments();
      } else {
        setLeaveMsg(data.error || 'Failed to submit leave');
      }
    } catch {
      setLeaveMsg('Error submitting leave');
    } finally {
      setSubmittingLeave(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-4 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Doctor Clinical Workbench</h2>
          <p className="text-xs text-slate-500">Manage patient consultations, post-visit notes, and schedule leave</p>
        </div>
        <button onClick={fetchAppointments} className="btn-secondary text-xs">
          Refresh Queue
        </button>
      </div>

      {leaveMsg && (
        <div className="p-3 bg-emerald-50 border-l-4 border-emerald-600 text-slate-800 text-xs font-medium rounded-r">
          {leaveMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments Queue */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
              Scheduled Patient Consultations
            </h3>

            {loadingAppts ? (
              <div className="p-6 text-center text-slate-500 text-xs">Loading patient schedule...</div>
            ) : appointments.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">No scheduled appointments for this doctor profile.</div>
            ) : (
              <div className="space-y-2">
                {appointments.map((appt) => {
                  const startTimeStr = new Date(appt.startTime).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={appt.id}
                      className="p-3 border border-slate-200 rounded hover:border-slate-400 transition-all flex items-center justify-between bg-slate-50/50"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-slate-900">
                            {appt.patient?.name || 'Patient'}
                          </span>
                          <span
                            className={`badge-${
                              appt.status === 'CONFIRMED'
                                ? 'emerald'
                                : appt.status === 'CANCELLED'
                                ? 'rose'
                                : 'slate'
                            }`}
                          >
                            {appt.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{startTimeStr}</p>
                        {appt.symptoms && (
                          <p className="text-xs text-slate-700 italic">"Symptoms: {appt.symptoms}"</p>
                        )}
                      </div>

                      <button
                        onClick={() => {
                          setSelectedAppt(appt);
                          setNotes(appt.consultNotes || '');
                          setGeneratedSummary(appt.aiPostSummary ? JSON.parse(appt.aiPostSummary) : null);
                          setAiError('');
                        }}
                        className="btn-secondary text-xs"
                      >
                        {appt.aiPostSummary ? 'View/Edit Notes' : 'Clinical Summary'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Leave Application Form */}
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
              Submit Doctor Leave
            </h3>
            <form onSubmit={handleApplyLeave} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Start Date:</label>
                <input
                  type="date"
                  value={leaveStartDate}
                  onChange={(e) => setLeaveStartDate(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">End Date:</label>
                <input
                  type="date"
                  value={leaveEndDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Reason:</label>
                <input
                  type="text"
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  placeholder="e.g. Medical conference, Personal leave"
                  className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
                />
              </div>

              <button type="submit" disabled={submittingLeave} className="w-full btn-primary text-xs">
                {submittingLeave ? 'Submitting...' : 'Register Leave'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Consultation Notes Modal */}
      {selectedAppt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full p-5 space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Consultation Notes — {selectedAppt.patient?.name}
                </h3>
                <p className="text-xs text-slate-500">Enter doctor observations to generate patient instructions</p>
              </div>
              <button
                onClick={() => {
                  setSelectedAppt(null);
                  setGeneratedSummary(null);
                }}
                className="text-slate-400 hover:text-slate-600 font-bold text-base"
              >
                ×
              </button>
            </div>

            {aiError && (
              <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium space-y-1">
                <p>{aiError}</p>
                <button
                  onClick={handleGeneratePostVisit}
                  className="text-xs text-rose-900 underline font-semibold"
                >
                  Retry Provider Generation
                </button>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Doctor Consultation Notes:
                </label>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Diagnosed with acute sinusitis. Prescribed Amoxicillin 500mg once daily for 7 days. Advised bed rest..."
                  className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
                />
              </div>

              <button
                onClick={handleGeneratePostVisit}
                disabled={generatingAi || !notes.trim()}
                className="w-full btn-secondary text-xs"
              >
                {generatingAi ? 'Generating structured instructions...' : 'Generate Patient Summary'}
              </button>

              {generatedSummary && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2 text-xs">
                  <span className="font-semibold text-slate-900 text-xs block">
                    Structured Patient Instructions
                  </span>

                  {generatedSummary.patientInstructions?.length > 0 && (
                    <div>
                      <strong className="text-slate-800 block mb-0.5 text-[11px] uppercase">Instructions:</strong>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-700 text-xs">
                        {generatedSummary.patientInstructions.map((ins: string, i: number) => (
                          <li key={i}>{ins}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {generatedSummary.medicationSummary?.length > 0 && (
                    <div>
                      <strong className="text-slate-800 block mb-0.5 text-[11px] uppercase">Prescribed Medications:</strong>
                      <div className="space-y-1">
                        {generatedSummary.medicationSummary.map((m: any, i: number) => (
                          <div key={i} className="p-2 bg-white border border-slate-200 rounded text-[11px]">
                            <strong>{m.medication}</strong> ({m.dosage}) — {m.frequency}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="text-[11px] text-slate-500 italic pt-2 border-t border-slate-200">
                    {generatedSummary.disclaimer}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-200">
              <button
                onClick={() => {
                  setSelectedAppt(null);
                  setGeneratedSummary(null);
                }}
                className="btn-primary text-xs"
              >
                Close Workbench
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
