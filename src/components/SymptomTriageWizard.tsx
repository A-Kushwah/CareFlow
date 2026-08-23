'use client';

import { useState, useEffect } from 'react';
import { AvailableSlot } from '@/lib/types';

export default function SymptomTriageWizard({
  doctor,
  slot,
  currentUser,
  onClose,
  onConfirmed,
}: {
  doctor: any;
  slot: AvailableSlot;
  currentUser: any;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [symptoms, setSymptoms] = useState('');
  const [holdId, setHoldId] = useState<string | null>(null);
  const [holdExpiresAt, setHoldExpiresAt] = useState<Date | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
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
  });

  const doctorName = doctor.user?.name || doctor.name;
  const specialty = doctor.specialty || 'General Practice';

  // Live countdown effect for slot hold duration
  useEffect(() => {
    if (!holdExpiresAt) return;

    const interval = setInterval(() => {
      const diffMs = holdExpiresAt.getTime() - Date.now();
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setRemainingSeconds(sec);

      if (sec === 0) {
        setErrorMsg('Slot hold expired. Please select a slot again.');
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [holdExpiresAt]);

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
      const expiresAt = new Date(data.hold.expiresAt);
      setHoldExpiresAt(expiresAt);
      setRemainingSeconds(Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)));
      return true;
    } catch {
      setErrorMsg('Failed to hold appointment slot');
      return false;
    }
  };

  const handleGeneratePreVisitSummary = async () => {
    if (!symptoms.trim()) {
      setErrorMsg('Please enter what you would like the doctor to know before proceeding');
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
      // Auto-create hold before confirmation if not yet created
      const holdCreated = await handleCreateHold();
      if (!holdCreated) return;
    }

    if (remainingSeconds === 0) {
      setErrorMsg('Slot hold expired. Please cancel and select a slot again.');
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
          patientId: currentUser.id,
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

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white border border-slate-200 rounded-lg max-w-xl w-full p-5 space-y-4 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Confirm Appointment</h3>
            <p className="text-xs text-slate-500">
              {doctorName} • {specialty} • {formattedDate} • {formattedTime}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {remainingSeconds !== null && remainingSeconds > 0 && (
              <span className="text-[11px] font-medium bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded">
                Slot held for {formatTimer(remainingSeconds)}
              </span>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-base">
              ×
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              What would you like the doctor to know?
            </label>
            <textarea
              rows={3}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="e.g. Dark skin rashes, persistent itching for 3 days..."
              className="w-full text-xs p-2.5 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
            />
          </div>

          {!aiSummary && (
            <button
              onClick={handleGeneratePreVisitSummary}
              disabled={loadingAi || !symptoms.trim()}
              className="w-full btn-secondary text-xs"
            >
              {loadingAi ? 'Generating preparation notes...' : 'Generate Visit Preparation Notes'}
            </button>
          )}

          {/* AI Visit Preparation Card */}
          {aiSummary && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 text-xs tracking-tight">
                  AI Visit Preparation
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
                  Urgency for clinician review: {aiSummary.urgencyLevel}
                </span>
              </div>

              <div>
                <strong className="text-slate-900 block mb-0.5 text-[11px] uppercase tracking-wide">
                  Chief complaint
                </strong>
                <p className="text-slate-700 text-xs">{aiSummary.chiefComplaint}</p>
              </div>

              {aiSummary.suggestedQuestions?.length > 0 && (
                <div>
                  <strong className="text-slate-900 block mb-0.5 text-[11px] uppercase tracking-wide">
                    Questions to consider
                  </strong>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-xs">
                    {aiSummary.suggestedQuestions.map((q: string, i: number) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Medical Disclaimer */}
              <div className="pt-2 border-t border-slate-200/80 text-[11px] text-slate-500 italic">
                AI-generated preparation notes help organize the consultation. They are not a diagnosis or medical advice.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-200">
          <button onClick={onClose} className="btn-secondary text-xs">
            Cancel
          </button>
          <button
            onClick={handleFinalConfirm}
            disabled={submitting || remainingSeconds === 0}
            className="btn-primary text-xs"
          >
            {submitting ? 'Confirming...' : 'Confirm Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
