'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthModal from '@/components/AuthModal';
import { Role } from '@/lib/types';

export default function LoginPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (data.user) router.replace('/');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSuccess = (user: any) => {
    const role = user.role as Role;
    router.replace(role === Role.PATIENT ? '/?portal=patient' : role === Role.DOCTOR ? '/?portal=doctor' : '/?portal=admin');
  };

  if (checking) return <div className="min-h-screen grid place-items-center text-sm text-slate-500">Checking session…</div>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1fr_380px] gap-10 items-center">
        <section className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">CarePulse / Clinic Operations</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-950">A clearer handoff between patients and clinicians.</h1>
          <p className="max-w-xl text-sm leading-6 text-slate-600">Sign in to manage appointments, consultation records, follow-up instructions, and medication reminders from the workspace that belongs to your role.</p>
          <div className="grid sm:grid-cols-3 gap-3 text-xs text-slate-600">
            <div className="border-l-2 border-emerald-500 pl-3">Patients see their own care history.</div>
            <div className="border-l-2 border-slate-400 pl-3">Doctors see assigned patients only.</div>
            <div className="border-l-2 border-slate-400 pl-3">Every view is session-protected.</div>
          </div>
        </section>
        <AuthModal standalone onClose={() => router.push('/')} onSuccess={handleSuccess} />
      </div>
    </main>
  );
}
