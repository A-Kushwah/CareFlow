'use client';

export default function Navbar({
  activeTab,
  onSelectTab,
}: {
  activeTab: 'patient' | 'doctor' | 'admin';
  onSelectTab: (tab: 'patient' | 'doctor' | 'admin') => void;
}) {
  return (
    <header className="bg-white border-b border-slate-200 px-6 py-3">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectTab('patient')}>
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50"></span>
            <span className="text-base font-semibold text-slate-900 tracking-tight">
              CarePulse
            </span>
            <span className="text-xs text-slate-400 font-normal">|</span>
            <span className="text-xs text-slate-500 font-medium">
              Clinic Operations
            </span>
          </div>
        </div>

        <nav className="flex items-center space-x-1 text-xs font-medium bg-slate-100 p-1 rounded-md border border-slate-200">
          <button
            onClick={() => onSelectTab('patient')}
            className={`py-1.5 px-3 rounded text-xs transition-all ${
              activeTab === 'patient'
                ? 'bg-white text-slate-900 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Patient Portal
          </button>
          <button
            onClick={() => onSelectTab('doctor')}
            className={`py-1.5 px-3 rounded text-xs transition-all ${
              activeTab === 'doctor'
                ? 'bg-white text-slate-900 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Doctor Schedule
          </button>
          <button
            onClick={() => onSelectTab('admin')}
            className={`py-1.5 px-3 rounded text-xs transition-all ${
              activeTab === 'admin'
                ? 'bg-white text-slate-900 font-semibold shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Operations & Outbox
          </button>
        </nav>
      </div>
    </header>
  );
}
