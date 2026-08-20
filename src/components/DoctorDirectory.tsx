'use client';

import { useState, useEffect } from 'react';
import { AvailableSlot } from '@/lib/types';

export default function DoctorDirectory({ onSelectSlot }: { onSelectSlot: (doctor: any, slot: AvailableSlot) => void }) {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [slotMessage, setSlotMessage] = useState<string>('');
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);

  useEffect(() => {
    fetch('/api/doctors')
      .then((res) => res.json())
      .then((data) => {
        if (data.doctors && data.doctors.length > 0) {
          setDoctors(data.doctors);
          setSelectedDoctorId(data.doctors[0].id);
        }
      });
  }, []);

  useEffect(() => {
    if (!selectedDoctorId || !selectedDate) return;

    setLoadingSlots(true);
    setSlotMessage('');
    fetch(`/api/doctors/slots?doctorId=${selectedDoctorId}&date=${selectedDate}`)
      .then((res) => res.json())
      .then((data) => {
        setSlots(data.slots || []);
        setSlotMessage(data.message || '');
        setLoadingSlots(false);
      })
      .catch(() => setLoadingSlots(false));
  }, [selectedDoctorId, selectedDate]);

  const selectedDoctor = doctors.find((d) => d.id === selectedDoctorId);

  return (
    <div className="glass-panel p-6 shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 border-b border-white/10 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-sky-400 animate-pulse"></span>
            Book Healthcare Appointment
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Select a specialist doctor and date to view real-time conflict-free slots.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400 font-semibold uppercase">Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-gray-900/80 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Doctor Cards Selector */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {doctors.map((doc) => {
          const isSelected = doc.id === selectedDoctorId;
          return (
            <div
              key={doc.id}
              onClick={() => setSelectedDoctorId(doc.id)}
              className={`glass-card p-5 rounded-xl cursor-pointer transition-all ${
                isSelected ? 'border-sky-500 bg-sky-500/10 ring-2 ring-sky-500/30' : 'hover:border-white/20'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-lg text-white">{doc.name}</h3>
                  <span className="inline-block mt-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">
                    {doc.specialty}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-bold text-sky-400">${doc.consultFee}</span>
                  <span className="block text-[11px] text-gray-400">per visit</span>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between text-xs text-gray-400 border-t border-white/5 pt-3">
                <span>Slot Duration: {doc.slotDurationMin} mins</span>
                <span>Buffer: {doc.bufferTimeMin} mins</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Available Slots Section */}
      {selectedDoctor && (
        <div className="mt-8">
          <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-300 mb-4">
            Available Slots for {selectedDoctor.name} ({selectedDate})
          </h4>

          {loadingSlots ? (
            <div className="py-8 text-center text-sky-400 animate-pulse text-sm">
              Calculating conflict-free slots...
            </div>
          ) : slotMessage ? (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm">
              ⚠️ {slotMessage}
            </div>
          ) : slots.length === 0 ? (
            <div className="p-4 rounded-xl bg-gray-800/50 text-gray-400 text-sm text-center">
              No available slots found for this date.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {slots.map((slot, index) => {
                const timeLabel = new Date(slot.startTime).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <button
                    key={index}
                    disabled={!slot.isAvailable}
                    onClick={() => slot.isAvailable && onSelectSlot(selectedDoctor, slot)}
                    className={`p-3 rounded-lg border text-xs font-semibold text-center transition-all ${
                      slot.isAvailable
                        ? 'border-sky-500/30 bg-sky-500/10 text-sky-300 hover:bg-sky-500 hover:text-white hover:border-sky-400 shadow-md hover:shadow-sky-500/20'
                        : 'border-white/5 bg-gray-900/50 text-gray-600 cursor-not-allowed'
                    }`}
                  >
                    <div>{timeLabel}</div>
                    {!slot.isAvailable && (
                      <span className="block text-[9px] uppercase tracking-wider mt-1 text-rose-400">
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
