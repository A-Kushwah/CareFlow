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
      setEmail('admin@carepulse.com');
      setPassword('admin123');
    } else if (role === Role.DOCTOR) {
      setEmail('sarah.jenkins@carepulse.com');
      setPassword('admin123');
    } else {
      setEmail('alex.rivera@example.com');
      setPassword('patient123');
    }
  };

  return (
    <div className={standalone ? 'w-full' : 'fixed inset-0 z-50 flex items-center justify-center bg-[#26323B]/60 p-4'}>
      <div className="neu-panel bg-[#E0E5EC] max-w-sm w-full p-6 space-y-5 shadow-2xl border border-[#EEF2F7]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#D4D9E2] pb-3">
          <div>
            <h3 className="text-base font-extrabold text-[#26323B]">
              {mode === 'login' ? 'CarePulse Authentication' : 'Create Patient Account'}
            </h3>
            <p className="text-xs font-semibold text-[#56616B]">
              {mode === 'login' ? 'Sign in to access workspace' : 'Register patient account'}
            </p>
          </div>
          {!standalone && (
            <button
              onClick={onClose}
              className="neu-btn-secondary text-sm font-bold p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close authentication modal"
            >
              ×
            </button>
          )}
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-[#FEEFEE] border-l-4 border-[#B42318] text-[#B42318] text-xs font-bold">
            {errorMsg}
          </div>
        )}

        {/* Demo Accounts Presets */}
        {mode === 'login' && (
          <div className="neu-inset p-3 space-y-2">
            <span className="block text-[10px] font-extrabold text-[#56616B] uppercase tracking-wider">
              Evaluation Credentials
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => fillDemoAccount(Role.PATIENT)}
                className="neu-btn-secondary py-1.5 px-2 text-[11px] font-bold min-h-[36px]"
              >
                Patient
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount(Role.DOCTOR)}
                className="neu-btn-secondary py-1.5 px-2 text-[11px] font-bold min-h-[36px]"
              >
                Doctor
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount(Role.ADMIN)}
                className="neu-btn-secondary py-1.5 px-2 text-[11px] font-bold min-h-[36px]"
              >
                Admin
              </button>
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label htmlFor="reg-name" className="block text-xs font-bold text-[#26323B] mb-1">Full Name *</label>
              <input
                id="reg-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-xs font-bold text-[#26323B] mb-1">Email Address *</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@carepulse.com"
              className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
            />
          </div>

          <div>
            <label htmlFor="auth-password" className="block text-xs font-bold text-[#26323B] mb-1">Password *</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="neu-input text-xs w-full p-3 font-bold text-[#26323B] min-h-[44px]"
            />
          </div>

          <button type="submit" disabled={loading} className="neu-btn-primary text-xs w-full justify-center min-h-[44px]">
            {loading ? 'Authenticating…' : mode === 'login' ? 'Sign In to Workstation' : 'Register Account'}
          </button>
        </form>

        {/* Footer */}
        <div className="pt-2 border-t border-[#D4D9E2] text-center text-xs font-medium text-[#56616B]">
          {mode === 'login' ? (
            <p>
              Need a patient account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                }}
                className="font-bold text-[#5667D8] hover:underline"
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
                className="font-bold text-[#5667D8] hover:underline"
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
