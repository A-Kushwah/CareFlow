'use client';

export default function Navbar({
  activeTab,
  onSelectTab,
}: {
  activeTab: 'patient' | 'doctor' | 'admin';
  onSelectTab: (tab: 'patient' | 'doctor' | 'admin') => void;
}) {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 px-6 py-3.5 shadow-sm">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectTab('patient')}>
          <div className="w-8 h-8 rounded-md bg-slate-900 flex items-center justify-center text-white font-bold text-sm">
            CP
          </div>
          <div>
            <span className="text-base font-semibold text-slate-900 tracking-tight">
              CarePulse
            </span>
            <span className="block text-[11px] text-slate-500 font-medium">
              Care Coordination Desk
            </span>
          </div>
        </div>

        <nav className="flex items-center space-x-1.5 text-xs font-medium">
          <button
            onClick={() => onSelectTab('patient')}
            className={`py-1.5 px-3 rounded-md transition-colors ${
              activeTab === 'patient'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Patient Booking
          </button>
          <button
            onClick={() => onSelectTab('doctor')}
            className={`py-1.5 px-3 rounded-md transition-colors ${
              activeTab === 'doctor'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Doctor Schedule
          </button>
          <button
            onClick={() => onSelectTab('admin')}
            className={`py-1.5 px-3 rounded-md transition-colors ${
              activeTab === 'admin'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Operations & Outbox
          </button>
        </nav>
      </div>
    </header>
  );
}
