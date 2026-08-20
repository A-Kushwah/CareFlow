'use client';

export default function Navbar({
  activeTab,
  onSelectTab,
}: {
  activeTab: 'patient' | 'doctor' | 'admin';
  onSelectTab: (tab: 'patient' | 'doctor' | 'admin') => void;
}) {
  return (
    <header className="sticky top-0 z-50 glass-panel rounded-none border-t-0 border-x-0 border-b border-white/10 px-6 py-4 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectTab('patient')}>
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

        <nav className="flex items-center space-x-2 md:space-x-4 text-xs font-semibold">
          <button
            onClick={() => onSelectTab('patient')}
            className={`py-2 px-3.5 rounded-lg transition-all ${
              activeTab === 'patient'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            🩺 Book Appointment
          </button>
          <button
            onClick={() => onSelectTab('doctor')}
            className={`py-2 px-3.5 rounded-lg transition-all ${
              activeTab === 'doctor'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            👨‍⚕️ Doctor Portal
          </button>
          <button
            onClick={() => onSelectTab('admin')}
            className={`py-2 px-3.5 rounded-lg transition-all ${
              activeTab === 'admin'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            ⚙️ Admin Outbox Jobs
          </button>
        </nav>
      </div>
    </header>
  );
}
