'use client';

import { useState } from 'react';
import { Role } from '@/lib/types';

export default function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (user: any) => void;
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
      setErrorMsg('Please enter email and password');
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
        setErrorMsg(data.error || 'Invalid credentials');
        setLoading(false);
        return;
      }

      onSuccess(data.user);
    } catch {
      setErrorMsg('Login request failed');
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) {
      setErrorMsg('All fields are required');
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
      setErrorMsg('Registration request failed');
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="bg-white border border-slate-200 rounded-lg max-w-sm w-full p-5 space-y-4 shadow-lg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              {mode === 'login' ? 'CarePulse Authentication' : 'Create Patient Account'}
            </h3>
            <p className="text-xs text-slate-500">
              {mode === 'login'
                ? 'Sign in to access booking & clinical portals'
                : 'Register a patient account for slot booking'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 font-bold text-base">
            ×
          </button>
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* Demo Account Fill Buttons */}
        {mode === 'login' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5">
            <span className="block text-[11px] font-semibold text-slate-700 uppercase">
              Demo accounts — credentials filled for evaluation
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => fillDemoAccount(Role.PATIENT)}
                className="py-1 px-2 bg-white border border-slate-300 rounded text-[11px] font-medium text-slate-700 hover:bg-slate-100"
              >
                Patient
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount(Role.DOCTOR)}
                className="py-1 px-2 bg-white border border-slate-300 rounded text-[11px] font-medium text-slate-700 hover:bg-slate-100"
              >
                Doctor
              </button>
              <button
                type="button"
                onClick={() => fillDemoAccount(Role.ADMIN)}
                className="py-1 px-2 bg-white border border-slate-300 rounded text-[11px] font-medium text-slate-700 hover:bg-slate-100"
              >
                Admin
              </button>
            </div>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="space-y-3">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name:</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email Address:</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Password:</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full text-xs p-2 bg-white border border-slate-300 rounded focus:outline-none focus:border-slate-900"
            />
          </div>

          <button type="submit" disabled={loading} className="w-full btn-primary text-xs">
            {loading ? 'Authenticating...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        {/* Mode Switcher Footer */}
        <div className="pt-2 border-t border-slate-200 text-center text-xs text-slate-500">
          {mode === 'login' ? (
            <p>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg('');
                }}
                className="font-semibold text-slate-900 hover:underline"
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
                className="font-semibold text-slate-900 hover:underline"
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
