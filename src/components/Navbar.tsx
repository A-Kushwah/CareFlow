'use client';

import { useState } from 'react';
import { Role } from '@/lib/types';

export default function Navbar({
  activeTab,
  onSelectTab,
  currentUser,
  onOpenLogin,
  onLogout,
}: {
  activeTab: 'patient' | 'doctor' | 'admin';
  onSelectTab: (tab: 'patient' | 'doctor' | 'admin') => void;
  currentUser: any | null;
  onOpenLogin: () => void;
  onLogout: () => void;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isPatient = !currentUser || currentUser.role === Role.PATIENT || currentUser.role === 'PATIENT';
  const isDoctor = currentUser && (currentUser.role === Role.DOCTOR || currentUser.role === 'DOCTOR');
  const isAdmin = currentUser && (currentUser.role === Role.ADMIN || currentUser.role === 'ADMIN');

  return (
    <header className="sticky top-0 z-40 bg-[#E0E5EC] border-b border-[#D4D9E2] shadow-[0_4px_12px_rgba(163,177,198,0.4)] px-4 sm:px-6 py-3">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* CarePulse Wordmark & Clinical Handoff Label */}
        <div
          className="flex items-center space-x-3 cursor-pointer group focus-visible:ring-2 focus-visible:ring-[#5667D8] rounded-xl p-1"
          onClick={() => onSelectTab('patient')}
          tabIndex={0}
          role="button"
          onKeyDown={(e) => e.key === 'Enter' && onSelectTab('patient')}
          aria-label="CarePulse Home"
        >
          <div className="w-8 h-8 rounded-xl bg-[#E0E5EC] shadow-[3px_3px_6px_rgba(163,177,198,0.6),-3px_-3px_6px_rgba(255,255,255,0.7)] flex items-center justify-center border border-[#EEF2F7]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16866D] ring-2 ring-[#E0E5EC]" />
          </div>
          <div>
            <span className="text-lg font-extrabold tracking-tight text-[#26323B] group-hover:text-[#5667D8] transition-colors">
              CarePulse
            </span>
            <span className="hidden sm:inline-block ml-2 text-xs font-semibold text-[#56616B] uppercase tracking-wider border-l border-[#A3B1C6]/40 pl-2">
              Clinical Workstation
            </span>
          </div>
        </div>

        {/* Desktop Navigation & User Controls */}
        <div className="hidden md:flex items-center space-x-4">
          <nav className="neu-inset p-1.5 flex items-center gap-1" aria-label="Portal Navigation">
            {isPatient && (
              <button
                onClick={() => onSelectTab('patient')}
                aria-current={activeTab === 'patient' ? 'page' : undefined}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                  activeTab === 'patient'
                    ? 'neu-btn-active bg-[#EEF2F7]'
                    : 'text-[#56616B] hover:text-[#26323B]'
                }`}
              >
                Patient Workspace
              </button>
            )}

            {isDoctor && (
              <button
                onClick={() => onSelectTab('doctor')}
                aria-current={activeTab === 'doctor' ? 'page' : undefined}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                  activeTab === 'doctor'
                    ? 'neu-btn-active bg-[#EEF2F7]'
                    : 'text-[#56616B] hover:text-[#26323B]'
                }`}
              >
                Doctor Workspace
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => onSelectTab('patient')}
                  aria-current={activeTab === 'patient' ? 'page' : undefined}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                    activeTab === 'patient'
                      ? 'neu-btn-active bg-[#EEF2F7]'
                      : 'text-[#56616B] hover:text-[#26323B]'
                  }`}
                >
                  Patient View
                </button>
                <button
                  onClick={() => onSelectTab('doctor')}
                  aria-current={activeTab === 'doctor' ? 'page' : undefined}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                    activeTab === 'doctor'
                      ? 'neu-btn-active bg-[#EEF2F7]'
                      : 'text-[#56616B] hover:text-[#26323B]'
                  }`}
                >
                  Doctor View
                </button>
                <button
                  onClick={() => onSelectTab('admin')}
                  aria-current={activeTab === 'admin' ? 'page' : undefined}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                    activeTab === 'admin'
                      ? 'neu-btn-active bg-[#EEF2F7]'
                      : 'text-[#56616B] hover:text-[#26323B]'
                  }`}
                >
                  Operations Console
                </button>
              </>
            )}
          </nav>

          {/* User Auth Session Badge */}
          {currentUser ? (
            <div className="flex items-center space-x-3 border-l border-[#A3B1C6]/40 pl-4">
              <div className="text-right">
                <p className="text-xs font-bold text-[#26323B]">{currentUser.name}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#56616B]">
                  Role: <span className="text-[#5667D8]">{currentUser.role}</span>
                </p>
              </div>
              <button
                onClick={onLogout}
                className="neu-btn-secondary text-xs py-2 px-3 hover:text-[#B42318] min-h-[44px]"
                aria-label="Log out of account"
              >
                Log Out
              </button>
            </div>
          ) : (
            <div className="border-l border-[#A3B1C6]/40 pl-4">
              <button
                onClick={onOpenLogin}
                className="neu-btn-primary text-xs py-2 px-4 min-h-[44px]"
              >
                Sign In
              </button>
            </div>
          )}
        </div>

        {/* Mobile Navigation Toggle Button */}
        <div className="flex md:hidden items-center space-x-2">
          {currentUser && (
            <span className="text-xs font-bold text-[#26323B] truncate max-w-[120px]">
              {currentUser.name}
            </span>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="neu-btn-secondary p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-[#26323B]"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden pt-4 pb-2 px-2 border-t border-[#D4D9E2] mt-3 space-y-3">
          <nav className="flex flex-col gap-2" aria-label="Mobile Navigation">
            {isPatient && (
              <button
                onClick={() => {
                  onSelectTab('patient');
                  setMobileMenuOpen(false);
                }}
                className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] ${
                  activeTab === 'patient' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#26323B]'
                }`}
              >
                Patient Workspace
              </button>
            )}

            {isDoctor && (
              <button
                onClick={() => {
                  onSelectTab('doctor');
                  setMobileMenuOpen(false);
                }}
                className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] ${
                  activeTab === 'doctor' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#26323B]'
                }`}
              >
                Doctor Workspace
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    onSelectTab('patient');
                    setMobileMenuOpen(false);
                  }}
                  className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] ${
                    activeTab === 'patient' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#26323B]'
                  }`}
                >
                  Patient View
                </button>
                <button
                  onClick={() => {
                    onSelectTab('doctor');
                    setMobileMenuOpen(false);
                  }}
                  className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] ${
                    activeTab === 'doctor' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#26323B]'
                  }`}
                >
                  Doctor View
                </button>
                <button
                  onClick={() => {
                    onSelectTab('admin');
                    setMobileMenuOpen(false);
                  }}
                  className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] ${
                    activeTab === 'admin' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#26323B]'
                  }`}
                >
                  Operations Console
                </button>
              </>
            )}
          </nav>

          <div className="pt-2 border-t border-[#D4D9E2] flex items-center justify-between">
            {currentUser ? (
              <button
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full neu-btn-secondary text-xs py-3 text-[#B42318] font-bold justify-center"
              >
                Log Out ({currentUser.name})
              </button>
            ) : (
              <button
                onClick={() => {
                  onOpenLogin();
                  setMobileMenuOpen(false);
                }}
                className="w-full neu-btn-primary text-xs py-3 justify-center"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
