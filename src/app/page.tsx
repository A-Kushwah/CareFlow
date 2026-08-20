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
    setBookingSuccessMsg('Appointment confirmed successfully. Transactional outbox notification queued for delivery.');
    setTimeout(() => setBookingSuccessMsg(''), 8000);
  };

  return (
    <div className="space-y-5">
      {/* Top Header Navbar */}
      <Navbar activeTab={activeTab} onSelectTab={setActiveTab} />

      {/* Clean Stationary Notification Alert */}
      {bookingSuccessMsg && (
        <div className="p-3 bg-emerald-50 border-l-4 border-emerald-600 text-slate-800 text-xs font-medium rounded-r-md flex items-center justify-between">
          <span>{bookingSuccessMsg}</span>
          <button
            onClick={() => setBookingSuccessMsg('')}
            className="text-slate-400 hover:text-slate-600 font-bold ml-4"
          >
            ×
          </button>
        </div>
      )}

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
