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

  const filteredDoctors = selectedSpecialty === 'ALL'
    ? doctors
    : doctors.filter((d) => (d.specialty || d.specialization) === selectedSpecialty);

  const currentDoctor = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <section className="neu-panel p-6 space-y-6" aria-labelledby="booking-heading">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#D4D9E2] pb-4">
        <div>
          <h2 id="booking-heading" className="text-lg font-bold text-[#26323B]">5. Book a New Appointment</h2>
          <p className="text-xs font-medium text-[#56616B] mt-0.5">Filter clinical specialists and check real-time slot availability.</p>
        </div>

        <div className="flex items-center space-x-3">
          <label htmlFor="specialty-select" className="text-xs font-bold text-[#56616B]">Specialty Filter:</label>
          <select
            id="specialty-select"
            value={selectedSpecialty}
            onChange={(e) => setSelectedSpecialty(e.target.value)}
            className="neu-input text-xs px-3 py-2 text-[#26323B] font-bold min-h-[44px]"
          >
            {specialties.map((spec) => (
              <option key={spec} value={spec}>
                {spec === 'ALL' ? 'All Specialties' : spec}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Doctor Cards Directory Grid */}
      {loading ? (
        <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
          Loading clinical specialists...
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDoctors.map((doc) => {
            const isSelected = doc.id === selectedDoctorId;
            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDoctorId(doc.id)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => e.key === 'Enter' && setSelectedDoctorId(doc.id)}
                aria-pressed={isSelected}
                className={`neu-card p-5 cursor-pointer border transition-all ${
                  isSelected
                    ? 'border-[#5667D8] bg-[#EEF2F7] shadow-inset'
                    : 'border-[#EEF2F7] hover:border-[#D4D9E2]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#26323B]">{doc.user?.name || doc.name}</h3>
                    <p className="text-xs font-semibold text-[#5667D8]">{doc.specialty || doc.specialization}</p>
                  </div>
                  <span className="clinical-badge-neutral">
                    ${doc.consultFee}
                  </span>
                </div>
                <div className="mt-3 text-[11px] font-semibold text-[#66727D]">
                  Slot duration: {doc.slotDurationMin || 30} mins
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Slot Selection Timeline */}
      {currentDoctor && (
        <div className="neu-panel p-6 space-y-4 border border-[#EEF2F7]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#D4D9E2] pb-3">
            <div>
              <h3 className="text-sm font-bold text-[#26323B]">
                Available Slots for {currentDoctor.user?.name || currentDoctor.name}
              </h3>
              <p className="text-xs font-medium text-[#56616B]">Select an open slot to prepare your consultation notes.</p>
            </div>

            <div className="flex items-center space-x-2">
              <label htmlFor="date-picker" className="text-xs font-bold text-[#56616B]">Select Date:</label>
              <input
                id="date-picker"
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="neu-input text-xs px-3 py-2 text-[#26323B] font-bold min-h-[44px]"
              />
            </div>
          </div>

          {slotsLoading ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
              Calculating slot availability...
            </div>
          ) : slots.length === 0 ? (
            <div className="neu-inset p-6 text-center text-xs font-semibold text-[#66727D]">
              {availabilityMessage || 'No open slots remain for this date.'}
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
                    className={`py-3 px-3 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
                      slot.isAvailable
                        ? 'neu-btn-secondary hover:bg-[#5667D8] hover:text-white'
                        : 'bg-[#D4D9E2]/50 text-[#66727D] cursor-not-allowed line-through shadow-none'
                    }`}
                  >
                    {timeStr}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
