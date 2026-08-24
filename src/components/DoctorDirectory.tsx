'use client';

import { useState, useEffect } from 'react';
import { AvailableSlot } from '@/lib/types';

function getNextWeekdayDate() {
  const date = new Date();
  const day = date.getDay();
  if (day === 0) date.setDate(date.getDate() + 1);
  if (day === 6) date.setDate(date.getDate() + 2);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export default function DoctorDirectory({
  onSelectSlot,
}: {
  onSelectSlot: (doctor: any, slot: AvailableSlot) => void;
}) {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('ALL');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(getNextWeekdayDate());
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [availabilityMessage, setAvailabilityMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    fetch('/api/doctors')
      .then((res) => res.json())
      .then((data) => {
        if (data.doctors) {
          setDoctors(data.doctors);
          if (data.doctors.length > 0) {
            setSelectedDoctorId(data.doctors[0].id);
          }
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDoctorId || !selectedDate) return;
    setSlotsLoading(true);

    fetch(`/api/doctors/slots?doctorId=${selectedDoctorId}&date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.slots) {
          setSlots(data.slots);
        }
        setAvailabilityMessage(data.message || '');
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDoctorId, selectedDate]);

  const specialties = ['ALL', ...Array.from(new Set(doctors.map((d) => d.specialty || d.specialization)))];

  const filteredDoctors = doctors.filter((doc) => {
    const docName = (doc.user?.name || doc.name || '').toLowerCase();
    const docSpec = (doc.specialty || doc.specialization || '').toLowerCase();
    const matchesSearch = searchQuery.trim() === '' || docName.includes(searchQuery.toLowerCase()) || docSpec.includes(searchQuery.toLowerCase());
    const matchesSpecialty = selectedSpecialty === 'ALL' || (doc.specialty || doc.specialization) === selectedSpecialty;
    return matchesSearch && matchesSpecialty;
  });

  const currentDoctor = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <section className="med-panel p-6 sm:p-8 space-y-6 bg-white rounded-3xl border border-slate-200/90 shadow-xl" aria-labelledby="booking-heading">
      {/* Header & Search/Filter Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-bold mb-2">
            <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
            Clinical Specialist Directory
          </div>
          <h2 id="booking-heading" className="text-xl font-extrabold text-slate-900 tracking-tight">
            Book a Specialist Appointment
          </h2>
          <p className="text-xs font-medium text-slate-500 mt-1">
            Filter certified medical specialists, evaluate profiles, and pick live available slots.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Instant Search Bar */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search doctor or specialty..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="med-input text-xs pl-9 pr-4 py-2.5 w-full sm:w-60 focus-visible:ring-2 focus-visible:ring-teal-500"
              aria-label="Search clinical specialists by name or specialty"
            />
            <svg className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Specialty Dropdown Filter */}
          <div className="flex items-center space-x-2">
            <label htmlFor="specialty-select" className="text-xs font-bold text-slate-700 whitespace-nowrap">
              Filter:
            </label>
            <select
              id="specialty-select"
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="med-input text-xs px-3 py-2.5 text-slate-900 font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              {specialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec === 'ALL' ? 'All Specialties' : spec}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Specialty Pills quick selector */}
      <div className="flex flex-wrap items-center gap-2 pt-1" aria-label="Specialty Quick Filters">
        {specialties.slice(0, 6).map((spec) => (
          <button
            key={spec}
            onClick={() => setSelectedSpecialty(spec)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all min-h-[36px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
              selectedSpecialty === spec
                ? 'bg-teal-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 hover:text-slate-900'
            }`}
          >
            {spec === 'ALL' ? '🏥 All Specialties' : spec}
          </button>
        ))}
      </div>

      {/* Doctor Cards Directory Grid */}
      {loading ? (
        <div className="bg-slate-50 p-12 text-center rounded-2xl border border-slate-200 text-xs font-bold text-slate-500" aria-live="polite">
          <svg className="animate-spin h-6 w-6 text-teal-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading clinical specialists...
        </div>
      ) : filteredDoctors.length === 0 ? (
        <div className="bg-slate-50 p-10 text-center rounded-2xl border border-slate-200 text-xs font-bold text-slate-500">
          No medical specialists found matching &ldquo;{searchQuery || selectedSpecialty}&rdquo;.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredDoctors.map((doc) => {
            const isSelected = doc.id === selectedDoctorId;
            const docName = doc.user?.name || doc.name || 'Doctor';
            const initials = docName.split(' ').map((n: string) => n[0]).join('').substring(0, 2).toUpperCase();

            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDoctorId(doc.id)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedDoctorId(doc.id)}
                aria-pressed={isSelected}
                className={`med-card-interactive p-5 cursor-pointer rounded-2xl border transition-all ${
                  isSelected
                    ? 'border-teal-600 bg-teal-50/40 ring-2 ring-teal-500 shadow-md'
                    : 'border-slate-200/90 hover:border-teal-300'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Doctor Avatar */}
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-teal-500 to-sky-600 text-white font-extrabold flex items-center justify-center text-sm shadow-md shrink-0">
                    {initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-extrabold text-slate-900 truncate">{docName}</h3>
                      <span className="px-2 py-0.5 text-[11px] font-extrabold text-teal-800 bg-teal-100/80 rounded-full border border-teal-200 shrink-0">
                        ${doc.consultFee}
                      </span>
                    </div>

                    <p className="text-xs font-bold text-teal-700 mt-0.5">{doc.specialty || doc.specialization}</p>

                    <div className="flex items-center gap-2 mt-2 text-[11px] font-semibold text-slate-500">
                      <span className="flex items-center text-amber-500 gap-1 font-bold">
                        ★ 4.9 <span className="text-slate-400 font-normal">(120+)</span>
                      </span>
                      <span>•</span>
                      <span>{doc.slotDurationMin || 30} mins slot</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Available Today
                  </span>
                  <span className={`text-xs font-bold ${isSelected ? 'text-teal-700' : 'text-slate-400'}`}>
                    {isSelected ? 'Selected ✓' : 'Select Doctor →'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slot Selection Timeline */}
      {currentDoctor && (
        <div className="med-panel p-6 space-y-5 bg-slate-50/70 border border-slate-200/90 rounded-2xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-slate-900">
                  Available Slots for {currentDoctor.user?.name || currentDoctor.name}
                </h3>
                <span className="px-2 py-0.5 text-xs font-bold bg-teal-100 text-teal-800 rounded-full">
                  {currentDoctor.specialty || currentDoctor.specialization}
                </span>
              </div>
              <p className="text-xs font-medium text-slate-600 mt-0.5">
                Pick a slot date and time to open the clinical triage wizard.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <label htmlFor="date-picker" className="text-xs font-bold text-slate-700 whitespace-nowrap">
                Select Date:
              </label>
              <input
                id="date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="med-input text-xs px-3 py-2 text-slate-900 font-bold min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500"
              />
            </div>
          </div>

          <div aria-live="polite">
            {slotsLoading ? (
              <div className="bg-white p-8 text-center rounded-xl border border-slate-200 text-xs font-semibold text-slate-500">
                <svg className="animate-spin h-5 w-5 text-teal-600 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Calculating real-time slot availability...
              </div>
            ) : slots.length === 0 ? (
              <div className="bg-white p-6 text-center rounded-xl border border-slate-200 text-xs font-semibold text-slate-600">
                {availabilityMessage || 'No open slots remain for this date. Please select another date.'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {slots.map((slot, index) => {
                  const timeStr = new Date(slot.startTime).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <button
                      key={index}
                      disabled={!slot.isAvailable}
                      onClick={() => onSelectSlot(currentDoctor, slot)}
                      className={`py-3 px-3 rounded-xl text-xs font-extrabold transition-all min-h-[44px] focus-visible:ring-2 focus-visible:ring-teal-500 ${
                        slot.isAvailable
                          ? 'bg-white border border-slate-200 text-slate-800 hover:bg-teal-600 hover:text-white hover:border-teal-600 shadow-xs'
                          : 'bg-slate-200/50 text-slate-400 border border-slate-200/60 cursor-not-allowed line-through shadow-none'
                      }`}
                    >
                      {timeStr}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

