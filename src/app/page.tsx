'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import AuthModal from '@/components/AuthModal';
import DoctorDirectory from '@/components/DoctorDirectory';
import SymptomTriageWizard from '@/components/SymptomTriageWizard';
import DoctorPortal from '@/components/DoctorPortal';
import AdminOutboxConsole from '@/components/AdminOutboxConsole';
import PatientDashboard from '@/components/PatientDashboard';
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
  const [accessDeniedMsg, setAccessDeniedMsg] = useState('');

  // Helper to determine allowed default tab for role
  const getPermittedTabForRole = (user: any | null): 'patient' | 'doctor' | 'admin' => {
    if (!user || user.role === Role.PATIENT || user.role === 'PATIENT') return 'patient';
    if (user.role === Role.DOCTOR || user.role === 'DOCTOR') return 'doctor';
    if (user.role === Role.ADMIN || user.role === 'ADMIN') return 'admin';
    return 'patient';
  };

  // Helper to check if user has permission to view requested tab
  const isTabAllowed = (tab: 'patient' | 'doctor' | 'admin', user: any | null): boolean => {
    if (!user || user.role === Role.PATIENT || user.role === 'PATIENT') {
      return tab === 'patient';
    }
    if (user.role === Role.DOCTOR || user.role === 'DOCTOR') {
      return tab === 'doctor';
    }
    if (user.role === Role.ADMIN || user.role === 'ADMIN') {
      return true; // Admin can inspect all views
    }
    return tab === 'patient';
  };

  // 1. Session verification on application mount
  const checkSession = () => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setCurrentUser(data.user);
          const defaultTab = getPermittedTabForRole(data.user);
          setActiveTab(defaultTab);
        } else {
          setCurrentUser(null);
          setActiveTab('patient');
        }
      })
      .catch(() => {
        setCurrentUser(null);
        setActiveTab('patient');
      });
  };

  useEffect(() => {
    checkSession();
  }, []);

  // Handle Tab Switch Request with Permission Verification
  const handleSelectTab = (targetTab: 'patient' | 'doctor' | 'admin') => {
    setAccessDeniedMsg('');
    if (!isTabAllowed(targetTab, currentUser)) {
      const allowed = getPermittedTabForRole(currentUser);
      setAccessDeniedMsg(`Access Denied: You do not have permission to view the ${targetTab} portal. Access restricted to authorized accounts.`);
      setActiveTab(allowed);
      return;
    }
    setActiveTab(targetTab);
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    setSelectedDoctor(null);
    setSelectedSlot(null);
    setPendingDoctor(null);
    setPendingSlot(null);
    setActiveTab('patient');
  };

  // 2. Intercept slot selection based on authentication state and role
  const handleSelectSlot = (doctor: any, slot: AvailableSlot) => {
    setAuthErrorMsg('');

    if (!currentUser) {
      setPendingDoctor(doctor);
      setPendingSlot(slot);
      setShowAuthModal(true);
      return;
    }

    if (currentUser.role !== Role.PATIENT && currentUser.role !== 'PATIENT') {
      setAuthErrorMsg(`Logged in as ${currentUser.name} (${currentUser.role}). Patient account login is required to book an appointment slot.`);
      return;
    }

    setSelectedDoctor(doctor);
    setSelectedSlot(slot);
  };

  // 3. Handle successful authentication from AuthModal
  const handleAuthSuccess = (user: any) => {
    setCurrentUser(user);
    setShowAuthModal(false);
    setAuthErrorMsg('');
    setAccessDeniedMsg('');

    const permitted = getPermittedTabForRole(user);
    setActiveTab(permitted);

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

  if (!currentUser) {
    return (
      <main className="min-h-screen bg-[#E0E5EC] grid place-items-center px-4 sm:px-6 py-12">
        <div className="neu-panel p-8 max-w-lg w-full text-center space-y-6">
          <div className="inline-flex items-center space-x-2 bg-[#EEF2F7] px-3 py-1 rounded-xl border border-[#D4D9E2]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16866D]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#16866D]">CarePulse Clinical Operations</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#26323B]">Sign In to Workstation</h1>
          <p className="text-xs font-medium leading-6 text-[#56616B]">
            Patients, clinicians, and operations personnel have separate session-protected workspaces. Authenticate to access your clinical dashboard.
          </p>
          <div className="pt-2">
            <a href="/login" className="neu-btn-primary text-xs w-full justify-center min-h-[44px]">
              Go to Sign In Page
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#E0E5EC] pb-12 space-y-6">
      {/* Top Header Navbar */}
      <Navbar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        currentUser={currentUser}
        onOpenLogin={() => setShowAuthModal(true)}
        onLogout={handleLogout}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-4">
        {/* Access Denied Banner */}
        {accessDeniedMsg && (
          <div className="p-4 bg-[#FEEFEE] border-l-4 border-[#B42318] text-[#B42318] text-xs font-bold rounded-r-xl flex items-center justify-between">
            <span>{accessDeniedMsg}</span>
            <button
              onClick={() => setAccessDeniedMsg('')}
              className="text-[#B42318] font-extrabold text-sm ml-4"
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </div>
        )}

        {/* Auth Error Banner */}
        {authErrorMsg && (
          <div className="p-4 bg-[#FFF8EB] border-l-4 border-[#A86B00] text-[#A86B00] text-xs font-bold rounded-r-xl flex items-center justify-between">
            <span>{authErrorMsg}</span>
            <button
              onClick={() => setAuthErrorMsg('')}
              className="text-[#A86B00] font-extrabold text-sm ml-4"
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </div>
        )}

        {/* Booking Confirmation Toast */}
        {bookingSuccessMsg && (
          <div className="p-4 bg-[#E6F4F1] border-l-4 border-[#16866D] text-[#16866D] text-xs font-bold rounded-r-xl flex items-center justify-between">
            <span>{bookingSuccessMsg}</span>
            <button
              onClick={() => setBookingSuccessMsg('')}
              className="text-[#16866D] font-extrabold text-sm ml-4"
              aria-label="Dismiss alert"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Dynamic Portal View (Gated by Permission) */}
      {activeTab === 'patient' && isTabAllowed('patient', currentUser) && (
        <div className="space-y-8">
          <PatientDashboard />
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <DoctorDirectory onSelectSlot={handleSelectSlot} />
          </div>
        </div>
      )}

      {activeTab === 'doctor' && isTabAllowed('doctor', currentUser) && (
        <DoctorPortal />
      )}

      {activeTab === 'admin' && isTabAllowed('admin', currentUser) && (
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
