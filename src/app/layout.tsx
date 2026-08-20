import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CarePulse — Healthcare Appointment & Follow-up Manager',
  description: 'Enterprise healthcare booking system with zero double-booking concurrency guarantees, doctor leave protection, and AI intake assistant.',
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
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen flex flex-col antialiased">
        <header className="sticky top-0 z-50 glass-panel rounded-none border-t-0 border-x-0 border-b border-white/10 px-6 py-4 backdrop-blur-md">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-teal-400 flex items-center justify-center shadow-lg shadow-sky-500/20">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <span className="text-xl font-bold bg-gradient-to-r from-white via-sky-100 to-teal-300 bg-clip-text text-transparent">
                  CarePulse
                </span>
                <span className="block text-[10px] uppercase tracking-widest text-sky-400 font-semibold">
                  Healthcare System
                </span>
              </div>
            </div>
            <nav className="flex items-center space-x-6 text-sm font-medium text-gray-300">
              <a href="#doctors" className="hover:text-sky-400 transition-colors">Book Appointment</a>
              <a href="#doctor-portal" className="hover:text-sky-400 transition-colors">Doctor Portal</a>
              <a href="#admin-console" className="hover:text-sky-400 transition-colors">Admin Outbox Jobs</a>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8">
          {children}
        </main>

        <footer className="border-t border-white/10 py-6 text-center text-xs text-gray-500">
          <p>© 2026 CarePulse Healthcare System • Built with Next.js, Prisma & TypeScript • Non-diagnostic AI assistant</p>
        </footer>
      </body>
    </html>
  );
}
