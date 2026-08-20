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
    setBookingSuccessMsg('Appointment confirmed. Email and calendar updates have been queued.');
    setTimeout(() => setBookingSuccessMsg(''), 8000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Navbar with Active Portal Switcher */}
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Success Notification Banner */}
      {bookingSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-sm font-semibold shadow-lg animate-bounce">
          {bookingSuccessMsg}
        </div>
      )}

      {/* Main Tab Switcher Pills */}
      <div className="glass-panel p-2 flex items-center justify-center gap-2 max-w-xl mx-auto">
        <button
          onClick={() => setActiveTab('patient')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'patient'
              ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          🩺 Patient Portal & Booking
        </button>

        <button
          onClick={() => setActiveTab('doctor')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'doctor'
              ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          👨‍⚕️ Doctor Portal & Leave
        </button>

        <button
          onClick={() => setActiveTab('admin')}
          className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all ${
            activeTab === 'admin'
              ? 'bg-gradient-to-r from-sky-500 to-teal-500 text-white shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          ⚙️ Admin Outbox Console
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
