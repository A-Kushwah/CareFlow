'use client';

import { useState, useEffect } from 'react';
import { AvailableSlot } from '@/lib/types';

export default function SymptomTriageWizard({
  doctor,
  slot,
  onClose,
  onConfirmed,
}: {
  doctor: any;
  slot: AvailableSlot;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [symptoms, setSymptoms] = useState('');
  const [patientEmail, setPatientEmail] = useState('alex.rivera@example.com');
  const [patientName, setPatientName] = useState('Alex Rivera');
  const [patientId, setPatientId] = useState('');
  const [holdId, setHoldId] = useState('');
  const [holdExpiresAt, setHoldExpiresAt] = useState<number | null>(null);
  const [aiSummary, setAiSummary] = useState<any>(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [timeLeftSec, setTimeLeftSec] = useState(300);

  // Initial setup: fetch patient ID and create 5-min slot hold
  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setPatientId(data.user.id);
          setPatientEmail(data.user.email);
          setPatientName(data.user.name);
          initiateHold(data.user.id);
        } else {
          // Fallback demo patient lookup
          fetch('/api/appointments')
            .then((r) => r.json())
            .then((apptsData) => {
              const demoPatientId = apptsData.appointments?.[0]?.patientId || 'patient-demo-id';
              setPatientId(demoPatientId);
              initiateHold(demoPatientId);
            });
        }
      });
  }, []);

  const initiateHold = async (pId: string) => {
    try {
      const res = await fetch('/api/appointments/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: doctor.id,
          patientId: pId,
          startTime: slot.startTime,
          endTime: slot.endTime,
        }),
      });

      const data = await res.json();
      if (res.ok && data.hold) {
        setHoldId(data.hold.id);
        const expTime = new Date(data.hold.expiresAt).getTime();
        setHoldExpiresAt(expTime);
      }
    } catch {
      // Hold error handled silently
    }
  };

  // Hold Countdown Timer
  useEffect(() => {
    if (!holdExpiresAt) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((holdExpiresAt - Date.now()) / 1000));
      setTimeLeftSec(remaining);
      if (remaining === 0) {
        clearInterval(interval);
        setError('Slot hold expired. Please select a new slot.');
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [holdExpiresAt]);

  const handleGenerateAiTriage = async () => {
    if (!symptoms.trim()) return;
    setGeneratingAi(true);
    try {
      const res = await fetch('/api/ai/pre-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms }),
      });
      const data = await res.json();
      setAiSummary(data);
    } catch {
      // Error handled
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleConfirmBooking = async () => {
    if (timeLeftSec === 0) {
      setError('Slot hold has expired. Cannot complete booking.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId,
          doctorId: doctor.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
          symptoms,
          aiPreSummary: aiSummary ? JSON.stringify(aiSummary) : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Booking failed');
      }

      onConfirmed();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const formattedTime = new Date(slot.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const formattedDate = new Date(slot.startTime).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="glass-panel w-full max-w-2xl p-6 md:p-8 max-h-[90vh] overflow-y-auto relative border-sky-500/30">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl p-2"
        >
          ✕
        </button>

        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-white">Confirm Appointment Checkout</h3>
            <p className="text-xs text-sky-400 mt-0.5">
              {doctor.name} ({doctor.specialty}) • {formattedDate} at {formattedTime}
            </p>
          </div>

          <div className="text-right">
            <span className="block text-[10px] uppercase text-amber-400 font-semibold">Hold Timer:</span>
            <span className="text-lg font-mono font-bold text-amber-300">
              {Math.floor(timeLeftSec / 60)}:{(timeLeftSec % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
            🚨 {error}
          </div>
        )}

        {/* Patient Details */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Patient Name:</label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full bg-gray-900/80 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">Patient Email (for notifications):</label>
            <input
              type="email"
              value={patientEmail}
              onChange={(e) => setPatientEmail(e.target.value)}
              className="w-full bg-gray-900/80 border border-white/10 rounded-lg p-2.5 text-sm text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Describe your symptoms & reason for visit:
            </label>
            <textarea
              rows={3}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="e.g. Mild chest pressure and tightness when climbing stairs..."
              className="w-full bg-gray-900/80 border border-white/10 rounded-lg p-3 text-sm text-white focus:border-sky-500 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleGenerateAiTriage}
            disabled={!symptoms.trim() || generatingAi}
            className="w-full py-2 px-4 rounded-lg bg-gradient-to-r from-teal-500/20 to-sky-500/20 border border-teal-500/30 text-teal-300 hover:bg-teal-500/30 text-xs font-semibold flex items-center justify-center gap-2"
          >
            {generatingAi ? 'Generating AI Pre-Visit Triage...' : '✨ Generate AI Pre-Visit Summary for Doctor'}
          </button>
        </div>

        {/* AI Pre-Visit Summary Card */}
        {aiSummary && (
          <div className="p-4 mb-6 rounded-xl bg-teal-500/10 border border-teal-500/30 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-teal-300 uppercase tracking-wide">AI Pre-Visit Assessment</span>
              <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] uppercase border ${
                aiSummary.urgencyLevel === 'High'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : aiSummary.urgencyLevel === 'Medium'
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  : 'bg-teal-500/20 text-teal-300 border-teal-500/40'
              }`}>
                Urgency: {aiSummary.urgencyLevel}
              </span>
            </div>

            <p className="text-gray-200"><strong>Chief Complaint:</strong> {aiSummary.chiefComplaint}</p>

            {aiSummary.suggestedQuestions?.length > 0 && (
              <div>
                <strong className="text-teal-200 block mb-1">Suggested Clinical Questions for Doctor:</strong>
                <ul className="list-disc list-inside space-y-0.5 text-gray-300">
                  {aiSummary.suggestedQuestions.map((q: string, i: number) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[10px] text-gray-400 italic mt-2 border-t border-teal-500/20 pt-2">
              {aiSummary.disclaimer}
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="py-2 px-4 rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmBooking}
            disabled={submitting || timeLeftSec === 0}
            className="btn-primary text-sm flex items-center gap-2"
          >
            {submitting ? 'Confirming Transaction...' : 'Confirm Appointment Booking ($' + doctor.consultFee + ')'}
          </button>
        </div>
      </div>
    </div>
  );
}
