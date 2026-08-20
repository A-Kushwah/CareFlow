'use client';

import { useState } from 'react';
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
  const [patientId, setPatientId] = useState('');
  const [patients, setPatients] = useState<any[]>([]);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [aiSummary, setAiSummary] = useState<any | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const formattedTime = `${new Date(slot.startTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })} - ${new Date(slot.endTime).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  const formattedDate = new Date(slot.startTime).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const handleCreateHold = async () => {
    setErrorMsg('');
    try {
      const res = await fetch('/api/appointments/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctorId: doctor.id,
          startTime: slot.startTime,
          endTime: slot.endTime,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'This slot was reserved by another patient');
        return false;
      }

      setHoldId(data.hold.id);
      return true;
    } catch {
      setErrorMsg('Failed to hold appointment slot');
      return false;
    }
  };

  const handleGeneratePreVisitSummary = async () => {
    if (!symptoms.trim()) {
      setErrorMsg('Please enter symptoms before proceeding');
      return;
    }

    setLoadingAi(true);
    setErrorMsg('');

    try {
      const holdCreated = holdId ? true : await handleCreateHold();
      if (!holdCreated) {
        setLoadingAi(false);
        return;
      }

      const res = await fetch('/api/ai/pre-visit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symptoms }),
      });

      const data = await res.json();
      if (res.ok && data.summary) {
        setAiSummary(data.summary);
      } else {
        setErrorMsg(data.error || 'Failed to generate pre-visit summary');
      }
    } catch {
      setErrorMsg('Pre-visit generation request failed');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleFinalConfirm = async () => {
    if (!holdId) {
      setErrorMsg('Slot hold expired or missing');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          holdId,
          patientId: patientId || 'demo-patient-id',
          symptoms,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Booking confirmation failed');
        setSubmitting(false);
        return;
      }

      onConfirmed();
    } catch {
      setErrorMsg('Network error confirming appointment');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
      <div className="desk-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">Confirm Appointment</h3>
            <p className="text-xs text-slate-500">
              {doctor.user?.name || doctor.name} • {formattedDate} ({formattedTime})
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-lg">
            ×
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Patient Symptoms & Clinical Context:
            </label>
            <textarea
              rows={3}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="Describe your current symptoms or reason for visit..."
              className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-slate-900"
            />
          </div>

          {!aiSummary && (
            <button
              onClick={handleGeneratePreVisitSummary}
              disabled={loadingAi || !symptoms.trim()}
              className="w-full btn-secondary text-xs font-medium"
            >
              {loadingAi ? 'Preparing visit summary...' : 'Generate Visit Preparation Summary'}
            </button>
          )}

          {/* AI Pre-Visit Summary Card */}
          {aiSummary && (
            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 uppercase text-[10px] tracking-wider">
                  Visit Preparation Summary
                </span>
                <span
                  className={`badge-${
                    aiSummary.urgencyLevel === 'High'
                      ? 'rose'
                      : aiSummary.urgencyLevel === 'Medium'
                      ? 'amber'
                      : 'emerald'
                  }`}
                >
                  Urgency: {aiSummary.urgencyLevel}
                </span>
              </div>

              <p className="text-slate-700">
                <strong>Chief Complaint:</strong> {aiSummary.chiefComplaint}
              </p>

              {aiSummary.suggestedQuestions?.length > 0 && (
                <div>
                  <strong className="text-slate-800 block mb-1">Suggested Questions for Doctor:</strong>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-600">
                    {aiSummary.suggestedQuestions.map((q: string, i: number) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-200">
                {aiSummary.disclaimer}
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button
            onClick={handleFinalConfirm}
            disabled={submitting}
            className="btn-primary text-xs"
          >
            {submitting ? 'Confirming...' : 'Confirm Appointment'}
          </button>
        </div>
      </div>
    </div>
  );
}
