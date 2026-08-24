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
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
  const specialty = doctor.specialty || doctor.specialization || 'General Practice';

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
        setStep(2);
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="triage-dialog-title"
    >
      <div className="med-panel bg-white max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl border border-slate-200/90 rounded-3xl">
        {/* Step Indicator Header */}
        <div className="space-y-4 border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="w-8 h-8 rounded-full bg-teal-100 text-teal-800 font-extrabold flex items-center justify-center text-xs">
                {step}/3
              </span>
              <div>
                <h3 id="triage-dialog-title" className="text-base font-extrabold text-slate-900 leading-snug">
                  Clinical Symptom Triage & Booking
                </h3>
                <p className="text-xs font-medium text-slate-500">
                  {doctorName} • {specialty}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              {remainingSeconds !== null && remainingSeconds > 0 && (
                <span className="clinical-badge-warning shadow-xs animate-pulse">
                  Slot held: {formatTimer(remainingSeconds)}
                </span>
              )}
              <button
                onClick={onClose}
                className="med-btn-secondary text-base font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-teal-500"
                aria-label="Close booking modal"
              >
                ×
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-teal-600 to-sky-600 h-full transition-all duration-300 rounded-full"
              style={{ width: `${(step / 3) * 100}%` }}
            />
          </div>

          <div className="flex justify-between text-[11px] font-bold text-slate-400">
            <span className={step >= 1 ? 'text-teal-700 font-extrabold' : ''}>1. Symptoms</span>
            <span className={step >= 2 ? 'text-teal-700 font-extrabold' : ''}>2. AI Evaluation</span>
            <span className={step >= 3 ? 'text-teal-700 font-extrabold' : ''}>3. Confirmation</span>
          </div>
        </div>

        {/* Slot Details Banner */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 flex items-center justify-between text-xs">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Selected Slot</span>
            <span className="font-extrabold text-slate-900">{formattedDate}</span>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Consultation Window</span>
            <span className="font-extrabold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-md border border-teal-200">
              {formattedTime}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-50 border-l-4 border-red-500 text-red-700 text-xs font-bold flex items-center justify-between" role="alert">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step Content */}
        <div className="space-y-4" aria-live="polite">
          <div>
            <label htmlFor="symptoms-input" className="block text-xs font-bold text-slate-900 mb-1.5">
              What would you like the doctor to know? (Symptoms & Reason for Visit) *
            </label>
            <textarea
              id="symptoms-input"
              rows={3}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="e.g. Skin rashes on left arm, fever for 2 days, feeling fatigued..."
              className="med-input text-xs w-full p-3 font-semibold text-slate-900 focus-visible:ring-2 focus-visible:ring-teal-500"
            />
          </div>

          {!aiSummary && (
            <button
              onClick={handleGeneratePreVisitSummary}
              disabled={loadingAi || !symptoms.trim()}
              className="med-btn-secondary text-xs w-full justify-center min-h-[44px] font-bold shadow-xs focus-visible:ring-2 focus-visible:ring-teal-500 flex items-center gap-2"
            >
              {loadingAi ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating Visit Preparation Notes…
                </>
              ) : (
                'Generate Visit Preparation Notes'
              )}
            </button>
          )}

          {/* AI Structured Urgency & Triage Card */}
          {aiSummary && (
            <div className="med-card p-5 space-y-4 text-xs border border-slate-200 bg-slate-50/50 rounded-2xl">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal-600" />
                  <span className="font-extrabold text-slate-900 text-xs">
                    AI Clinical Triage Assessment
                  </span>
                </div>
                <span
                  className={
                    aiSummary.urgencyLevel === 'High' || aiSummary.urgencyLevel === 'Emergency'
                      ? 'clinical-badge-danger shadow-xs'
                      : aiSummary.urgencyLevel === 'Medium' || aiSummary.urgencyLevel === 'Consult Recommended'
                      ? 'clinical-badge-warning shadow-xs'
                      : 'clinical-badge-success shadow-xs'
                  }
                >
                  {aiSummary.urgencyLevel === 'High' || aiSummary.urgencyLevel === 'Emergency' ? (
                    <>🚨 Urgency: High (Emergency Risk)</>
                  ) : aiSummary.urgencyLevel === 'Medium' || aiSummary.urgencyLevel === 'Consult Recommended' ? (
                    <>⚠️ Urgency: Medium (Consult Recommended)</>
                  ) : (
                    <>✅ Urgency: Low (Self-Care / Standard Consult)</>
                  )}
                </span>
              </div>

              <div>
                <strong className="text-slate-900 block mb-1 text-[10px] uppercase font-extrabold tracking-wider">
                  Chief Complaint Summary
                </strong>
                <p className="text-slate-700 font-semibold bg-white p-3 rounded-xl border border-slate-200/60 leading-relaxed">
                  {aiSummary.chiefComplaint}
                </p>
              </div>

              {aiSummary.suggestedQuestions?.length > 0 && (
                <div>
                  <strong className="text-slate-900 block mb-1 text-[10px] uppercase font-extrabold tracking-wider">
                    Recommended Patient Questions
                  </strong>
                  <ul className="space-y-1.5 text-slate-700 font-medium bg-white p-3 rounded-xl border border-slate-200/60">
                    {aiSummary.suggestedQuestions.map((q: string, i: number) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-teal-600 font-extrabold">•</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-2 text-[11px] text-slate-500 italic">
                AI preparation notes organize clinical context for your doctor and do not substitute professional diagnostic evaluation.
              </div>
            </div>
          )}
        </div>

        {/* Action Controls Footer */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-100">
          <button
            onClick={onClose}
            className="med-btn-secondary text-xs min-h-[44px] px-5 font-bold focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (step < 3) setStep((s) => (s + 1) as any);
              handleFinalConfirm();
            }}
            disabled={submitting || remainingSeconds === 0}
            className="med-btn-primary text-xs min-h-[44px] px-6 font-bold shadow-md focus-visible:ring-2 focus-visible:ring-teal-500 flex items-center gap-2"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Confirming Appointment…
              </>
            ) : (
              'Confirm Appointment Booking'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

