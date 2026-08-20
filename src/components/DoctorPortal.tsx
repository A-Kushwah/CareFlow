'use client';

import { useState, useEffect } from 'react';

export default function DoctorPortal() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Consult Notes Form Modal
  const [activeAppt, setActiveAppt] = useState<any>(null);
  const [consultNotes, setConsultNotes] = useState('');
  const [generatingPostVisit, setGeneratingPostVisit] = useState(false);

  // Leave Form
  const [leaveStart, setLeaveStart] = useState('');
  const [leaveEnd, setLeaveEnd] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveStatusMsg, setLeaveStatusMsg] = useState('');

  const fetchAppointments = () => {
    setLoading(true);
    fetch('/api/appointments')
      .then((res) => res.json())
      .then((data) => {
        setAppointments(data.appointments || []);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetch('/api/doctors')
      .then((res) => res.json())
      .then((data) => {
        if (data.doctors && data.doctors.length > 0) {
          setDoctors(data.doctors);
          setSelectedDoctorId(data.doctors[0].id);
        }
      });
    fetchAppointments();
  }, []);

  const handleCompleteVisit = async () => {
    if (!activeAppt || !consultNotes.trim()) return;
    setGeneratingPostVisit(true);

    try {
      const res = await fetch('/api/ai/post-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointmentId: activeAppt.id,
          consultNotes,
        }),
      });

      if (res.ok) {
        setActiveAppt(null);
        setConsultNotes('');
        fetchAppointments();
      }
    } catch {
      // Error handled
    } finally {
      setGeneratingPostVisit(false);
    }
  };

  const handleSubmitLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeaveStatusMsg('');

    if (!selectedDoctorId || !leaveStart || !leaveEnd || !leaveReason) return;

    try {
      const res = await fetch('/api/doctors/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: selectedDoctorId,
          startDate: leaveStart,
          endDate: leaveEnd,
          reason: leaveReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setLeaveStatusMsg(`✅ Leave approved! Cancelled ${data.result.conflictingCount} conflicting appointment(s) and queued patient notifications.`);
        setLeaveReason('');
        fetchAppointments();
      } else {
        setLeaveStatusMsg(`❌ Error: ${data.error}`);
      }
    } catch (err: any) {
      setLeaveStatusMsg(`❌ Exception: ${err.message}`);
    }
  };

  return (
    <div className="space-y-8">
      {/* Doctor Leave Management Card */}
      <div className="glass-panel p-6">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-teal-400"></span>
          Doctor Leave & Schedule Conflict Manager
        </h3>
        <p className="text-xs text-gray-400 mb-6">
          Submit doctor leave dates. The engine automatically excludes these dates from availability and cancels/reschedules any conflicting future bookings with instant outbox email delivery.
        </p>

        <form onSubmit={handleSubmitLeave} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Select Doctor:</label>
            <select
              value={selectedDoctorId}
              onChange={(e) => setSelectedDoctorId(e.target.value)}
              className="w-full bg-gray-900/80 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.specialty})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Leave Start Date:</label>
            <input
              type="date"
              value={leaveStart}
              onChange={(e) => setLeaveStart(e.target.value)}
              className="w-full bg-gray-900/80 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Leave End Date:</label>
            <input
              type="date"
              value={leaveEnd}
              onChange={(e) => setLeaveEnd(e.target.value)}
              className="w-full bg-gray-900/80 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Reason:</label>
            <input
              type="text"
              placeholder="e.g. Medical Conference"
              value={leaveReason}
              onChange={(e) => setLeaveReason(e.target.value)}
              className="w-full bg-gray-900/80 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-2 md:col-span-4 flex items-center justify-between mt-2">
            <span className="text-xs font-medium text-teal-300">{leaveStatusMsg}</span>
            <button type="submit" className="btn-primary text-xs">
              Apply Doctor Leave & Trigger Reschedule Outbox
            </button>
          </div>
        </form>
      </div>

      {/* Doctor Appointments Queue */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <h3 className="text-lg font-bold text-white">Doctor Consultation Queue</h3>
          <button onClick={fetchAppointments} className="text-xs text-sky-400 hover:text-sky-300 underline">
            Refresh Queue
          </button>
        </div>

        {loading ? (
          <div className="text-center py-6 text-sm text-sky-400 animate-pulse">Loading consultations...</div>
        ) : appointments.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">No appointments scheduled.</div>
        ) : (
          <div className="space-y-4">
            {appointments.map((appt) => {
              const formattedTime = new Date(appt.startTime).toLocaleString([], {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div key={appt.id} className="glass-card p-5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-white text-base">{appt.patient?.name || 'Patient'}</span>
                      <span className={`badge-status badge-${appt.status.toLowerCase()}`}>{appt.status}</span>
                    </div>
                    <p className="text-xs text-sky-400">
                      With {appt.doctor?.user?.name || 'Doctor'} • {formattedTime}
                    </p>
                    {appt.symptoms && (
                      <p className="text-xs text-gray-300 mt-2 bg-gray-900/60 p-2.5 rounded-lg border border-white/5">
                        <strong>Patient Symptoms:</strong> {appt.symptoms}
                      </p>
                    )}
                    {appt.aiPreSummary && (
                      <div className="text-[11px] text-teal-300 bg-teal-500/10 p-2 rounded border border-teal-500/20 mt-2">
                        <strong>AI Pre-Visit Assessment:</strong> {appt.aiPreSummary}
                      </div>
                    )}
                  </div>

                  {appt.status === 'CONFIRMED' && (
                    <button
                      onClick={() => {
                        setActiveAppt(appt);
                        setConsultNotes('');
                      }}
                      className="btn-primary text-xs whitespace-nowrap self-start md:self-center"
                    >
                      Complete Consultation & Generate Notes
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Consultation Notes Modal */}
      {activeAppt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-panel w-full max-w-xl p-6 relative">
            <h4 className="text-lg font-bold text-white mb-2">Doctor Consultation Notes</h4>
            <p className="text-xs text-gray-400 mb-4">Patient: {activeAppt.patient?.name}</p>

            <textarea
              rows={4}
              value={consultNotes}
              onChange={(e) => setConsultNotes(e.target.value)}
              placeholder="e.g. Diagnosed acute sinus pressure. Prescribed Amoxicillin 500mg. Recommend 7 days rest..."
              className="w-full bg-gray-900/80 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-sky-500 focus:outline-none mb-4"
            />

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setActiveAppt(null)}
                className="py-2 px-4 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCompleteVisit}
                disabled={generatingPostVisit || !consultNotes.trim()}
                className="btn-primary text-xs"
              >
                {generatingPostVisit ? 'Synthesizing Post-Visit Notes...' : 'Complete & Generate AI Summary'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
