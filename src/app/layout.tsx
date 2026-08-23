import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CareFlow — Healthcare Appointment & Follow-up Manager',
  description: 'Healthcare appointment manager with zero double-booking concurrency guarantees, doctor leave protection, and AI visit preparation.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen flex flex-col bg-slate-50 text-slate-900 antialiased">
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6">
          {children}
        </main>

        <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
          <p>© 2026 CareFlow Healthcare System • Modular Monolith • Non-diagnostic AI clinical assistant</p>
        </footer>
      </body>
    </html>
  );
}
