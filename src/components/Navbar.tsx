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
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const isPatient = !currentUser || currentUser.role === Role.PATIENT || currentUser.role === 'PATIENT';
  const isDoctor = currentUser && (currentUser.role === Role.DOCTOR || currentUser.role === 'DOCTOR');
  const isAdmin = currentUser && (currentUser.role === Role.ADMIN || currentUser.role === 'ADMIN');

  return (
    <header className="sticky top-0 z-40 med-header-glass px-4 sm:px-6 py-3 transition-all">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* CareFlow Brand Logo & Clinical Handoff Label */}
        <div
          className="flex items-center space-x-3 cursor-pointer group focus-visible:ring-2 focus-visible:ring-teal-500 rounded-xl p-1.5 transition-colors"
          onClick={() => onSelectTab('patient')}
          tabIndex={0}
          role="button"
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelectTab('patient')}
          aria-label="CareFlow Home - Go to Patient Workspace"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-600 to-sky-600 shadow-md flex items-center justify-center text-white font-bold transition-transform group-hover:scale-105">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-slate-900 group-hover:text-teal-700 transition-colors">
                CareFlow
              </span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold tracking-wide uppercase bg-teal-50 text-teal-700 border border-teal-200/80 rounded-full">
                Clinical v2
              </span>
            </div>
            <span className="hidden sm:block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Healthcare Operations Workstation
            </span>
          </div>
        </div>

        {/* Desktop Navigation Tabs */}
        <div className="hidden md:flex items-center space-x-4">
          <nav className="bg-slate-100/80 p-1.5 rounded-2xl flex items-center gap-1 border border-slate-200/60" aria-label="Portal Navigation">
            {isPatient && (
              <button
                onClick={() => onSelectTab('patient')}
                aria-current={activeTab === 'patient' ? 'page' : undefined}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  activeTab === 'patient'
                    ? 'bg-white text-teal-700 shadow-sm border border-slate-200/80 font-extrabold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Patient Workspace
              </button>
            )}

            {isDoctor && (
              <button
                onClick={() => onSelectTab('doctor')}
                aria-current={activeTab === 'doctor' ? 'page' : undefined}
                className={`py-2 px-4 rounded-xl text-xs font-bold transition-all min-h-[44px] flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  activeTab === 'doctor'
                    ? 'bg-white text-teal-700 shadow-sm border border-slate-200/80 font-extrabold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Doctor Workstation
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => onSelectTab('patient')}
                  aria-current={activeTab === 'patient' ? 'page' : undefined}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    activeTab === 'patient'
                      ? 'bg-white text-teal-700 shadow-sm border border-slate-200/80 font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  Patient View
                </button>
                <button
                  onClick={() => onSelectTab('doctor')}
                  aria-current={activeTab === 'doctor' ? 'page' : undefined}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    activeTab === 'doctor'
                      ? 'bg-white text-teal-700 shadow-sm border border-slate-200/80 font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  Doctor View
                </button>
                <button
                  onClick={() => onSelectTab('admin')}
                  aria-current={activeTab === 'admin' ? 'page' : undefined}
                  className={`py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    activeTab === 'admin'
                      ? 'bg-white text-teal-700 shadow-sm border border-slate-200/80 font-extrabold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  Operations Console
                </button>
              </>
            )}
          </nav>

          {/* User Auth Profile Badge & Controls */}
          {currentUser ? (
            <div className="relative border-l border-slate-200/80 pl-4">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center space-x-3 focus-visible:ring-2 focus-visible:ring-teal-500 rounded-xl p-1 hover:bg-slate-100/60 transition-colors"
                  aria-expanded={userMenuOpen}
                  aria-haspopup="true"
                  aria-label="User account menu"
                >
                  <div className="w-9 h-9 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-xs border border-teal-200 shadow-xs">
                    {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div className="text-left hidden lg:block">
                    <p className="text-xs font-bold text-slate-900 leading-tight">{currentUser.name}</p>
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-teal-700">
                      {currentUser.role} Account
                    </p>
                  </div>
                  <svg className={`w-4 h-4 text-slate-500 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <button
                  onClick={onLogout}
                  className="med-btn-secondary text-xs py-2 px-3 hover:border-red-300 hover:text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-teal-500 min-h-[44px]"
                  aria-label="Log out of account"
                >
                  Log Out
                </button>
              </div>

              {/* Dropdown Menu */}
              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900">{currentUser.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                  </div>
                  <div className="py-1">
                    <span className="block px-3 py-1.5 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                      Role Privilege
                    </span>
                    <span className="inline-block mx-3 px-2 py-0.5 text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200 rounded-md">
                      {currentUser.role}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition-colors min-h-[44px] flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                      </svg>
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="border-l border-slate-200/80 pl-4">
              <button
                onClick={onOpenLogin}
                className="med-btn-primary text-xs py-2 px-5 min-h-[44px] shadow-md focus-visible:ring-2 focus-visible:ring-teal-500"
              >
                Sign In
              </button>
            </div>
          )}
        </div>

        {/* Mobile Menu Trigger Button */}
        <div className="flex md:hidden items-center space-x-2">
          {currentUser && (
            <div className="flex items-center space-x-2 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-bold text-slate-800 truncate max-w-[100px]">
                {currentUser.name}
              </span>
            </div>
          )}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="med-btn-secondary p-2 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-800 focus-visible:ring-2 focus-visible:ring-teal-500"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="mobile-nav-menu"
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
        <div id="mobile-nav-menu" className="md:hidden pt-4 pb-3 px-2 border-t border-slate-200 mt-3 space-y-3 bg-white/95 backdrop-blur-lg rounded-2xl shadow-xl">
          <nav className="flex flex-col gap-2" aria-label="Mobile Navigation">
            {isPatient && (
              <button
                onClick={() => {
                  onSelectTab('patient');
                  setMobileMenuOpen(false);
                }}
                className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  activeTab === 'patient' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'text-slate-800 hover:bg-slate-100'
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
                className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  activeTab === 'doctor' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'text-slate-800 hover:bg-slate-100'
                }`}
              >
                Doctor Workstation
              </button>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => {
                    onSelectTab('patient');
                    setMobileMenuOpen(false);
                  }}
                  className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    activeTab === 'patient' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Patient View
                </button>
                <button
                  onClick={() => {
                    onSelectTab('doctor');
                    setMobileMenuOpen(false);
                  }}
                  className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    activeTab === 'doctor' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Doctor View
                </button>
                <button
                  onClick={() => {
                    onSelectTab('admin');
                    setMobileMenuOpen(false);
                  }}
                  className={`py-3 px-4 rounded-xl text-xs font-bold text-left min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                    activeTab === 'admin' ? 'bg-teal-50 text-teal-800 border border-teal-200' : 'text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  Operations Console
                </button>
              </>
            )}
          </nav>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            {currentUser ? (
              <button
                onClick={() => {
                  onLogout();
                  setMobileMenuOpen(false);
                }}
                className="w-full med-btn-secondary text-xs py-3 text-red-600 font-bold justify-center min-h-[44px]"
              >
                Log Out ({currentUser.name})
              </button>
            ) : (
              <button
                onClick={() => {
                  onOpenLogin();
                  setMobileMenuOpen(false);
                }}
                className="w-full med-btn-primary text-xs py-3 justify-center min-h-[44px]"
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

