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
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8">
          {children}
        </main>

        <footer className="border-t border-white/10 py-6 text-center text-xs text-gray-500">
          <p>© 2026 CarePulse Healthcare System • Built with Next.js, Prisma & TypeScript • Non-diagnostic AI assistant</p>
        </footer>
      </body>
    </html>
  );
}
