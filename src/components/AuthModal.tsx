'use client';

import { useState } from 'react';
import { Role } from '@/lib/types';

export default function AuthModal({
  onClose,
  onSuccess,
  standalone = false,
}: {
  onClose: () => void;
  onSuccess: (user: any) => void;
  standalone?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loginTab, setLoginTab] = useState<'patient' | 'doctor' | 'admin'>('patient');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e?: React.FormEvent, customEmail?: string, customPass?: string) => {
    if (e) e.preventDefault();
    const loginEmail = customEmail || email;
    const loginPass = customPass || password;

    if (!loginEmail || !loginPass) {
      setErrorMsg('Please enter both email address and password');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPass }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Invalid authentication credentials');
        setLoading(false);
        return;
      }

      onSuccess(data.user);
    } catch {
      setErrorMsg('Network error executing login request');
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setErrorMsg('All fields are required to register a patient account');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || 'Registration failed');
        setLoading(false);
        return;
      }

      onSuccess(data.user);
    } catch {
      setErrorMsg('Network error executing registration request');
      setLoading(false);
    }
  };

  const fillDemoAccount = (role: Role) => {
    setErrorMsg('');
    if (role === Role.ADMIN) {
      setLoginTab('admin');
      setEmail('admin@carepulse.com');
      setPassword('admin123');
    } else if (role === Role.DOCTOR) {
      setLoginTab('doctor');
      setEmail('sarah.jenkins@carepulse.com');
      setPassword('doctor123');
    } else {
      setLoginTab('patient');
      setEmail('alex.rivera@example.com');
      setPassword('patient123');
    }
  };

  return (
    <div
      className={standalone ? 'w-full' : 'fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200'}
      role={standalone ? undefined : 'dialog'}
      aria-modal={standalone ? undefined : 'true'}
      aria-labelledby="auth-modal-title"
    >
      <div className="med-panel bg-white max-w-md w-full p-6 space-y-5 shadow-2xl border border-slate-200/90 rounded-3xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 id="auth-modal-title" className="text-lg font-extrabold text-slate-900">
              {mode === 'login' ? 'CareFlow Workstation Sign In' : 'Register Patient Account'}
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              {mode === 'login' ? 'Select workspace role or enter credentials' : 'Create patient record to book appointments'}
            </p>
          </div>
          {!standalone && (
            <button
              onClick={onClose}
              className="med-btn-secondary text-base font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-teal-500"
              aria-label="Close authentication dialog"
            >
              ×
            </button>
          )}
        </div>

        {/* Role Tab Navigation for Login Mode */}
        {mode === 'login' && (
          <div className="space-y-3">
            <div className="bg-slate-100/80 p-1 rounded-2xl flex items-center gap-1 border border-slate-200/60" role="tablist" aria-label="Portal Role Selection">
              <button
                type="button"
                role="tab"
                aria-selected={loginTab === 'patient'}
                onClick={() => {
                  setLoginTab('patient');
                  fillDemoAccount(Role.PATIENT);
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[40px] flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  loginTab === 'patient'
                    ? 'bg-white text-teal-800 shadow-xs font-extrabold border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Patient</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginTab === 'doctor'}
                onClick={() => {
                  setLoginTab('doctor');
                  fillDemoAccount(Role.DOCTOR);
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[40px] flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  loginTab === 'doctor'
                    ? 'bg-white text-teal-800 shadow-xs font-extrabold border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Doctor</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={loginTab === 'admin'}
                onClick={() => {
                  setLoginTab('admin');
                  fillDemoAccount(Role.ADMIN);
                }}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all min-h-[40px] flex items-center justify-center gap-1.5 focus-visible:ring-2 focus-visible:ring-teal-500 ${
                  loginTab === 'admin'
                    ? 'bg-white text-teal-800 shadow-xs font-extrabold border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Admin</span>
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-2xl bg-red-50 border-l-4 border-red-500 text-red-700 text-xs font-bold flex items-center justify-between" role="alert">
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="reg-name" className="block text-xs font-bold text-slate-800 mb-1">
                Full Name *
              </label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-bold text-slate-800 mb-1">
              Email Address *
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@careflow.com"
              className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-bold text-slate-800 mb-1">
              Password *
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="med-input text-xs w-full p-3 font-semibold text-slate-900 min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="med-btn-primary text-xs w-full justify-center min-h-[44px] font-bold shadow-md focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Authenticating…
              </span>
            ) : mode === 'login' ? (
              `Sign In as ${loginTab.toUpperCase()}`
            ) : (
              'Register Account'
            )}
          </button>
        </form>

        {/* Footer Switcher */}
        <div className="pt-3 border-t border-slate-100 text-center text-xs font-medium text-slate-600">
          {mode === 'login' ? (
            <p>
              Need a patient account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                }}
                className="font-bold text-teal-700 hover:text-teal-900 hover:underline focus-visible:ring-2 focus-visible:ring-teal-500 rounded-md px-1"
              >
                Register as Patient
              </button>
            </p>
          ) : (
            <p>
              Already registered?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg('');
                }}
                className="font-bold text-teal-700 hover:text-teal-900 hover:underline focus-visible:ring-2 focus-visible:ring-teal-500 rounded-md px-1"
              >
                Sign In
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

