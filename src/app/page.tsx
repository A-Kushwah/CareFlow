'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthModal from '@/components/AuthModal';
import DoctorDirectory from '@/components/DoctorDirectory';
import SymptomTriageWizard from '@/components/SymptomTriageWizard';
import DoctorPortal from '@/components/DoctorPortal';
import AdminOutboxConsole from '@/components/AdminOutboxConsole';
import { AvailableSlot, Role } from '@/lib/types';

export default function HomePage() {
  const [activeTab, setActiveTab] = useState<'patient' | 'doctor' | 'admin'>('patient');
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingDoctor, setPendingDoctor] = useState<any | null>(null);
  const [pendingSlot, setPendingSlot] = useState<AvailableSlot | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<any | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [bookingSuccessMsg, setBookingSuccessMsg] = useState('');
  const [authErrorMsg, setAuthErrorMsg] = useState('');

  // 1. Session verification on application mount
  const checkSession = () => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setCurrentUser(data.user);
        } else {
          setCurrentUser(null);
        }
      })
      .catch(() => setCurrentUser(null));
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    setSelectedDoctor(null);
    setSelectedSlot(null);
    setPendingDoctor(null);
    setPendingSlot(null);
  };

  // 2. Intercept slot selection based on authentication state and role
  const handleSelectSlot = (doctor: any, slot: AvailableSlot) => {
    setAuthErrorMsg('');

    if (!currentUser) {
      // Unauthenticated: Save pending slot & doctor, open AuthModal
      setPendingDoctor(doctor);
      setPendingSlot(slot);
      setShowAuthModal(true);
      return;
    }

    if (currentUser.role !== Role.PATIENT && currentUser.role !== 'PATIENT') {
      // Non-Patient role: Explain that patient authentication is required for booking
      setAuthErrorMsg(`Logged in as ${currentUser.name} (${currentUser.role}). Patient account login is required to book an appointment slot.`);
      return;
    }

    // Authenticated Patient: Open booking wizard
    setSelectedDoctor(doctor);
    setSelectedSlot(slot);
  };

  // 3. Handle successful authentication from AuthModal
  const handleAuthSuccess = (user: any) => {
    setCurrentUser(user);
    setShowAuthModal(false);
    setAuthErrorMsg('');

    if (pendingDoctor && pendingSlot) {
      if (user.role === Role.PATIENT || user.role === 'PATIENT') {
        setSelectedDoctor(pendingDoctor);
        setSelectedSlot(pendingSlot);
        setPendingDoctor(null);
        setPendingSlot(null);
      } else {
        setAuthErrorMsg(`Logged in as ${user.name} (${user.role}). Patient account login is required to book an appointment slot.`);
        setPendingDoctor(null);
        setPendingSlot(null);
      }
    }
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
      <Navbar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        currentUser={currentUser}
        onOpenLogin={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />

      {/* Auth Error Banner */}
      {authErrorMsg && (
        <div className="p-3 bg-amber-50 border-l-4 border-amber-600 text-amber-900 text-xs font-medium rounded-r-md flex items-center justify-between">
          <span>{authErrorMsg}</span>
          <button
            onClick={() => setAuthErrorMsg('')}
            className="text-amber-500 hover:text-amber-800 font-bold ml-4"
          >
            ×
          </button>
        </div>
      )}

      {/* Clean Notification Alert */}
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

      {/* Authentication Modal */}
      {showAuthModal && (
        <AuthModal
          onClose={() => {
            setShowAuthModal(false);
            setPendingDoctor(null);
            setPendingSlot(null);
          }}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* Symptom Triage & Booking Modal */}
      {selectedDoctor && selectedSlot && currentUser && (
        <SymptomTriageWizard
          doctor={selectedDoctor}
          slot={selectedSlot}
          currentUser={currentUser}
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
