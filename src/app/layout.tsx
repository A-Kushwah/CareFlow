import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CarePulse — Healthcare Appointment & Follow-up Manager',
  description: 'CarePulse appointment booking with doctor schedules, leave handling, notification retries, and AI-assisted visit summaries.',
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
          <p>© 2026 CarePulse • Next.js, Prisma, and TypeScript • AI summaries are not medical advice</p>
        </footer>
      </body>
    </html>
  );
}
