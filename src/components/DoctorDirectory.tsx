'use client';

import { useState, useEffect } from 'react';
import { AvailableSlot } from '@/lib/types';

export default function DoctorDirectory({
  onSelectSlot,
}: {
  onSelectSlot: (doctor: any, slot: AvailableSlot) => void;
}) {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>('ALL');
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
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
      })
      .finally(() => setSlotsLoading(false));
  }, [selectedDoctorId, selectedDate]);

  const specialties = ['ALL', ...Array.from(new Set(doctors.map((d) => d.specialty || d.specialization)))];

  const filteredDoctors = selectedSpecialty === 'ALL'
    ? doctors
    : doctors.filter((d) => (d.specialty || d.specialization) === selectedSpecialty);

  const currentDoctor = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <div className="space-y-6">
      <div className="desk-card p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Specialist Directory & Slot Selection</h2>
            <p className="text-xs text-slate-500">Filter clinical specialists and check slot availability.</p>
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-slate-600">Specialization:</span>
            <select
              value={selectedSpecialty}
              onChange={(e) => setSelectedSpecialty(e.target.value)}
              className="text-xs bg-white border border-slate-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              {specialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec === 'ALL' ? 'All Specialties' : spec}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Doctor List Cards */}
        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading clinical specialists...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredDoctors.map((doc) => {
              const isSelected = doc.id === selectedDoctorId;
              return (
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoctorId(doc.id)}
                  className={`p-4 rounded-md border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-slate-900 bg-slate-50/80 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{doc.user?.name || doc.name}</h3>
                      <p className="text-xs text-slate-600">{doc.specialty || doc.specialization}</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      ${doc.consultFee}
                    </span>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">
                    Slot duration: {doc.slotDurationMin || 30} mins
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Availability Timeline Section */}
      {currentDoctor && (
        <div className="desk-card p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Available Slots for {currentDoctor.user?.name || currentDoctor.name}
              </h3>
              <p className="text-xs text-slate-500">Select a time slot to proceed to visit preparation.</p>
            </div>

            <div className="flex items-center space-x-2">
              <label className="text-xs font-medium text-slate-600">Select Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="text-xs bg-white border border-slate-300 rounded-md px-2.5 py-1 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          {slotsLoading ? (
            <p className="text-xs text-slate-500 py-4">Calculating slot availability...</p>
          ) : slots.length === 0 ? (
            <p className="text-xs text-slate-500 py-4">No available slots on this date or doctor is on leave.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
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
                    className={`py-2 px-3 rounded-md text-xs font-medium border text-center transition-all ${
                      slot.isAvailable
                        ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-900 hover:text-white hover:border-slate-900'
                        : 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed line-through'
                    }`}
                  >
                    {timeStr}
                    {!slot.isAvailable && slot.reason && (
                      <span className="block text-[9px] no-underline font-normal text-slate-400 mt-0.5">
                        {slot.reason}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
