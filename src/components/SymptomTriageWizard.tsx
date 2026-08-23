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

  const formattedDate = new Date(slot.startTime).toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const doctorName = doctor.user?.name || doctor.name;
  const specialty = doctor.specialty || 'General Practice';

  // Live countdown timer for slot hold
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
      setErrorMsg('Please enter symptoms or information for the clinician');
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
        setErrorMsg(data.error || 'Failed to generate pre-visit preparation summary');
      }
    } catch {
      setErrorMsg('Pre-visit request failed');
    } finally {
      setLoadingAi(false);
    }
  };

  const handleFinalConfirm = async () => {
    if (!holdId) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#26323B]/60 p-4">
      <div className="neu-panel bg-[#E0E5EC] max-w-xl w-full p-6 space-y-5 shadow-2xl border border-[#EEF2F7]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D4D9E2] pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#26323B]">Confirm Clinical Appointment</h3>
            <p className="text-xs font-bold text-[#56616B] mt-0.5">
              {doctorName} • {specialty} • {formattedDate} • {formattedTime}
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {remainingSeconds !== null && remainingSeconds > 0 && (
              <span className="clinical-badge-warning">
                Slot held for {formatTimer(remainingSeconds)}
              </span>
            )}
            <button
              onClick={onClose}
              className="neu-btn-secondary text-sm font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close booking modal"
            >
              ×
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-[#FEEFEE] border-l-4 border-[#B42318] text-[#B42318] text-xs font-bold">
            {errorMsg}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="symptoms-input" className="block text-xs font-bold text-[#26323B] mb-1">
              What would you like the doctor to know? (Symptoms & Reason for Visit)
            </label>
            <textarea
              id="symptoms-input"
              rows={3}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="e.g. Skin rashes on left arm, fever for 2 days..."
              className="neu-input text-xs w-full p-3 font-medium text-[#26323B]"
            />
          </div>

          {!aiSummary && (
            <button
              onClick={handleGeneratePreVisitSummary}
              disabled={loadingAi || !symptoms.trim()}
              className="neu-btn-secondary text-xs w-full justify-center min-h-[44px]"
            >
              {loadingAi ? 'Generating Visit Preparation Notes…' : 'Generate Visit Preparation Notes'}
            </button>
          )}

          {/* AI Visit Preparation Card */}
          {aiSummary && (
            <div className="neu-card p-4 space-y-3 text-xs border border-[#EEF2F7]">
              <div className="flex items-center justify-between border-b border-[#D4D9E2] pb-2">
                <span className="font-extrabold text-[#26323B] text-xs">
                  AI Visit Preparation Notes
                </span>
                <span
                  className={`clinical-badge-${
                    aiSummary.urgencyLevel === 'High'
                      ? 'danger'
                      : aiSummary.urgencyLevel === 'Medium'
                      ? 'warning'
                      : 'success'
                  }`}
                >
                  Urgency: {aiSummary.urgencyLevel}
                </span>
              </div>

              <div>
                <strong className="text-[#26323B] block mb-0.5 text-[10px] uppercase font-extrabold tracking-wider">
                  Chief Complaint
                </strong>
                <p className="text-[#56616B] font-medium">{aiSummary.chiefComplaint}</p>
              </div>

              {aiSummary.suggestedQuestions?.length > 0 && (
                <div>
                  <strong className="text-[#26323B] block mb-0.5 text-[10px] uppercase font-extrabold tracking-wider">
                    Questions to Consider
                  </strong>
                  <ul className="list-disc pl-4 space-y-0.5 text-[#56616B] font-medium">
                    {aiSummary.suggestedQuestions.map((q: string, i: number) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2 border-t border-[#D4D9E2] text-[11px] text-[#66727D] italic">
                AI preparation notes organize information only and do not constitute a diagnosis or medical advice.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#D4D9E2]">
          <button onClick={onClose} className="neu-btn-secondary text-xs min-h-[44px]">
            Cancel
          </button>
          <button
            onClick={handleFinalConfirm}
            disabled={submitting || remainingSeconds === 0}
            className="neu-btn-primary text-xs min-h-[44px]"
          >
            {submitting ? 'Confirming Appointment…' : 'Confirm Appointment Booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
