'use client';

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import DoctorDirectory from '@/components/DoctorDirectory';
import SymptomTriageWizard from '@/components/SymptomTriageWizard';
import DoctorPortal from '@/components/DoctorPortal';
import AdminOutboxConsole from '@/components/AdminOutboxConsole';
import { AvailableSlot } from '@/lib/types';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'patient' | 'doctor' | 'admin'>('patient');
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState('');

  const handleSelectSlot = (doctor: any, slot: AvailableSlot) => {
    setSelectedDoctor(doctor);
    setSelectedSlot(slot);
  };

  const handleBookingConfirmed = () => {
    setSelectedDoctor(null);
    setSelectedSlot(null);
    setBookingSuccessMsg('Appointment confirmed successfully. Transactional outbox notifications and calendar sync events queued.');
    setTimeout(() => setBookingSuccessMsg(''), 8000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Navbar */}
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Confirmation Notification Banner */}
      {bookingSuccessMsg && (
        <div className="p-3.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold shadow-xs">
          {bookingSuccessMsg}
        </div>
      )}

      {/* Primary Tab Switcher */}
      <div className="desk-card p-1.5 flex items-center justify-center gap-1.5 max-w-xl mx-auto">
        <button
          onClick={() => setActiveTab('patient')}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'patient'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Patient Booking
        </button>

        <button
          onClick={() => setActiveTab('doctor')}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'doctor'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Doctor Schedule
        </button>

        <button
          onClick={() => setActiveTab('admin')}
          className={`flex-1 py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
            activeTab === 'admin'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Operations & Outbox
        </button>
      </div>

      {/* Dynamic Portal View */}
      {activeTab === 'patient' && (
        <DoctorDirectory onSelectSlot={handleSelectSlot} />
      )}

      {activeTab === 'doctor' && (
        <DoctorPortal />
      )}

      {activeTab === 'admin' && (
        <AdminOutboxConsole />
      )}

      {/* Symptom Triage & Checkout Modal */}
      {selectedDoctor && selectedSlot && (
        <SymptomTriageWizard
          doctor={selectedDoctor}
          slot={selectedSlot}
          onClose={() => {
            setSelectedDoctor(null);
            setSelectedSlot(null);
          }}
          onConfirmed={handleBookingConfirmed}
        />
      )}
    </div>
  );
}
