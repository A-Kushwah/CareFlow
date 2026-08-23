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

  if (checking) {
    return (
      <div className="min-h-screen bg-[#E0E5EC] grid place-items-center text-xs font-bold text-[#56616B]">
        Verifying session authorization…
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#E0E5EC] px-4 py-12 flex items-center justify-center">
      <div className="max-w-5xl w-full grid lg:grid-cols-[1fr_400px] gap-8 items-center">
        <section className="neu-panel p-8 space-y-6">
          <div className="inline-flex items-center space-x-2 bg-[#EEF2F7] px-3 py-1 rounded-xl border border-[#D4D9E2]">
            <span className="w-2.5 h-2.5 rounded-full bg-[#16866D]" />
            <span className="text-xs font-bold uppercase tracking-wider text-[#16866D]">CarePulse Clinical Operations</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#26323B]">
            Structured clinical handoff between patients and clinicians.
          </h1>
          <p className="text-xs font-medium leading-6 text-[#56616B]">
            Sign in to manage appointment schedules, doctor-authored prescription orders, visit summaries, and automated reminders in a session-protected workspace.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 text-xs text-[#56616B] font-bold pt-2">
            <div className="neu-inset p-3 border-l-4 border-[#16866D]">Patients access authorized care history.</div>
            <div className="neu-inset p-3 border-l-4 border-[#5667D8]">Doctors access assigned patients only.</div>
            <div className="neu-inset p-3 border-l-4 border-[#A86B00]">Every view is session-authenticated.</div>
          </div>
        </section>

        <div>
          <AuthModal standalone onClose={() => router.push('/')} onSuccess={handleSuccess} />
        </div>
      </div>
    </main>
  );
}
