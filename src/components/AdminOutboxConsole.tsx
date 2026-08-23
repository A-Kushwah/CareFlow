'use client';

import { useState, useEffect } from 'react';

type AdminTab = 'doctors' | 'outbox';

export default function AdminOutboxConsole() {
  const [activeTab, setActiveTab] = useState<AdminTab>('doctors');

  // Metrics & Logs state
  const [metrics, setMetrics] = useState<any | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Doctors Management State
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  // Create Doctor Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newDoctor, setNewDoctor] = useState({
    name: '',
    email: '',
    password: '',
    specialty: 'General Practice',
    consultFee: 120,
    slotDurationMin: 30,
    bufferTimeMin: 10,
    isPublished: true,
  });

  // Edit Doctor Form State
  const [editingDoctor, setEditingDoctor] = useState<any | null>(null);

  // Working Hours Modal State
  const [editingHoursDoctor, setEditingHoursDoctor] = useState<any | null>(null);
  const [workingHoursList, setWorkingHoursList] = useState<any[]>([]);

  // Doctor Leave Modal State
  const [leaveDoctor, setLeaveDoctor] = useState<any | null>(null);
  const [leaveForm, setLeaveForm] = useState({ startDate: '', endDate: '', reason: '' });

  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  const fetchOutboxData = () => {
    setLoadingLogs(true);
    Promise.all([
      fetch('/api/admin/metrics').then((res) => res.json()),
      fetch('/api/notifications/logs').then((res) => res.json()),
    ])
      .then(([metricsData, logsData]) => {
        if (metricsData.success) setMetrics(metricsData.metrics);
        if (logsData.success) setLogs(logsData.logs || []);
      })
      .catch(() => setErrorMsg('Failed to load outbox console metrics'))
      .finally(() => setLoadingLogs(false));
  };

  const fetchDoctors = () => {
    setLoadingDoctors(true);
    fetch('/api/admin/doctors')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setDoctors(data.doctors || []);
        else setErrorMsg(data.error || 'Failed to load doctors');
      })
      .catch(() => setErrorMsg('Failed to connect to doctor management API'))
      .finally(() => setLoadingDoctors(false));
  };

  useEffect(() => {
    fetchOutboxData();
    fetchDoctors();
  }, []);

  const handleTriggerWorker = async () => {
    setProcessing(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/notifications/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (res.ok) {
        setMsg(`Outbox worker run completed. Processed: ${data.result?.processedCount || 0} jobs.`);
        fetchOutboxData();
        setTimeout(() => setMsg(''), 5000);
      } else {
        setErrorMsg(data.error || 'Outbox processing failed');
      }
    } catch {
      setErrorMsg('Network error executing outbox worker');
    } finally {
      setProcessing(false);
    }
  };

  const handleRetryDlqJob = async (id: string) => {
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/retry-dlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (res.ok) {
        setMsg('Job re-queued successfully from Dead Letter Queue.');
        fetchOutboxData();
        setTimeout(() => setMsg(''), 5000);
      } else {
        setErrorMsg(data.error || 'Failed to re-queue DLQ job');
      }
    } catch {
      setErrorMsg('Network error retrying job');
    }
  };

  const handleCreateDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/admin/doctors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDoctor),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create doctor profile');
      setMsg('Doctor profile created successfully with default working hours.');
      setShowCreateModal(false);
      setNewDoctor({
        name: '',
        email: '',
        password: '',
        specialty: 'General Practice',
        consultFee: 120,
        slotDurationMin: 30,
        bufferTimeMin: 10,
        isPublished: true,
      });
      fetchDoctors();
      setTimeout(() => setMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleEditDoctorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoctor) return;
    setActionBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/admin/doctors/${editingDoctor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingDoctor.user?.name,
          specialty: editingDoctor.specialty,
          consultFee: Number(editingDoctor.consultFee),
          slotDurationMin: Number(editingDoctor.slotDurationMin),
          bufferTimeMin: Number(editingDoctor.bufferTimeMin),
          isPublished: editingDoctor.isPublished,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update doctor profile');
      setMsg('Doctor details updated successfully.');
      setEditingDoctor(null);
      fetchDoctors();
      setTimeout(() => setMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleTogglePublish = async (doctor: any) => {
    setActionBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/admin/doctors/${doctor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublished: !doctor.isPublished }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle status');
      setMsg(`Doctor status changed to ${!doctor.isPublished ? 'Published' : 'Unpublished'}.`);
      fetchDoctors();
      setTimeout(() => setMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const openHoursModal = (doctor: any) => {
    setEditingHoursDoctor(doctor);
    const existing = doctor.workingHours || [];
    if (existing.length > 0) {
      setWorkingHoursList(existing.map((h: any) => ({ ...h })));
    } else {
      setWorkingHoursList([1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startTime: '09:00', endTime: '17:00' })));
    }
  };

  const handleSaveHours = async () => {
    if (!editingHoursDoctor) return;
    setActionBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/admin/doctors/${editingHoursDoctor.id}/working-hours`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workingHours: workingHoursList }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update working hours');
      setMsg('Working hours updated successfully.');
      setEditingHoursDoctor(null);
      fetchDoctors();
      setTimeout(() => setMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  const handleAdminLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveDoctor) return;
    setActionBusy(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/admin/doctors/${leaveDoctor.id}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leaveForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit doctor leave');
      setMsg(`Doctor leave recorded. ${data.cancelledAppointmentsCount || 0} conflicting appointments cancelled.`);
      setLeaveDoctor(null);
      setLeaveForm({ startDate: '', endDate: '', reason: '' });
      fetchDoctors();
      fetchOutboxData();
      setTimeout(() => setMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6" aria-label="Admin Operations Console">
      {msg && (
        <div className="p-4 rounded-xl bg-[#E6F4F1] border-l-4 border-[#16866D] text-[#16866D] text-xs font-bold">
          {msg}
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-[#FEEFEE] border-l-4 border-[#B42318] text-[#B42318] text-xs font-bold">
          {errorMsg}
        </div>
      )}

      {/* Operations Header */}
      <header className="neu-panel p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#D4D9E2] pb-4 mb-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[#5667D8]">Admin Operations Control Center</span>
            <h1 className="text-2xl font-extrabold text-[#26323B] mt-1">Doctor Management & Outbox Queue Console</h1>
            <p className="text-xs font-medium text-[#56616B] mt-0.5">
              Provision clinician profiles, set working hours, process leave requests, and monitor notification outbox delivery.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button onClick={fetchDoctors} className="neu-btn-secondary text-xs font-bold min-h-[44px]">
              Refresh Data
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="neu-btn-primary text-xs font-bold min-h-[44px]"
            >
              + Create Doctor Profile
            </button>
          </div>
        </div>

        {/* Section Navigation Tabs */}
        <nav className="neu-inset p-1.5 flex gap-2">
          <button
            onClick={() => setActiveTab('doctors')}
            className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
              activeTab === 'doctors' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#56616B] hover:text-[#26323B]'
            }`}
          >
            1. Doctor Management ({doctors.length})
          </button>
          <button
            onClick={() => setActiveTab('outbox')}
            className={`py-3 px-5 rounded-xl text-xs font-bold transition-all min-h-[44px] ${
              activeTab === 'outbox' ? 'neu-btn-active bg-[#EEF2F7]' : 'text-[#56616B] hover:text-[#26323B]'
            }`}
          >
            2. Notification Outbox Queue
          </button>
        </nav>
      </header>

      {/* TAB 1: DOCTOR MANAGEMENT */}
      {activeTab === 'doctors' && (
        <section className="neu-panel p-6 space-y-6" aria-labelledby="admin-doctors-heading">
          <div className="flex items-center justify-between border-b border-[#D4D9E2] pb-3">
            <div>
              <h2 id="admin-doctors-heading" className="text-base font-bold text-[#26323B]">CareFlow Clinician Directory</h2>
              <p className="text-xs text-[#56616B]">Admin-only authorization enforced on all modification endpoints.</p>
            </div>
          </div>

          {loadingDoctors ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
              Loading clinician directory…
            </div>
          ) : doctors.length === 0 ? (
            <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
              No doctor profiles configured in the system. Click "+ Create Doctor Profile" above to add one.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#D4D9E2]">
              <table className="w-full text-left text-xs border-collapse bg-white">
                <thead>
                  <tr className="bg-[#EEF2F7] border-b border-[#D4D9E2] text-[#26323B] font-extrabold">
                    <th className="py-3 px-4">Doctor Name</th>
                    <th className="py-3 px-4">Specialty</th>
                    <th className="py-3 px-4">Fee / Slot</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Working Hours Summary</th>
                    <th className="py-3 px-4">Appointments</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#D4D9E2]">
                  {doctors.map((doc) => {
                    const daysCount = doc.workingHours?.length || 0;
                    return (
                      <tr key={doc.id} className="hover:bg-[#EEF2F7]/50 transition-colors">
                        <td className="py-3 px-4">
                          <span className="font-bold text-[#26323B] block">{doc.user?.name}</span>
                          <span className="text-[11px] text-[#56616B]">{doc.user?.email}</span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-[#26323B]">{doc.specialty}</td>
                        <td className="py-3 px-4 font-semibold text-[#26323B]">
                          ${doc.consultFee} <span className="text-[11px] text-[#66727D]">({doc.slotDurationMin}m + {doc.bufferTimeMin}m buf)</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`clinical-badge-${doc.isPublished ? 'success' : 'neutral'}`}>
                            {doc.isPublished ? 'Published' : 'Unpublished'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#56616B]">
                          {daysCount > 0 ? `${daysCount} Days (09:00 - 17:00)` : 'No hours configured'}
                        </td>
                        <td className="py-3 px-4 font-bold text-[#26323B]">{doc._count?.appointments || 0}</td>
                        <td className="py-3 px-4 text-right space-x-1">
                          <button
                            onClick={() => setEditingDoctor({ ...doc })}
                            className="neu-btn-secondary text-[11px] py-1.5 px-2 min-h-[34px]"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => openHoursModal(doc)}
                            className="neu-btn-secondary text-[11px] py-1.5 px-2 min-h-[34px]"
                          >
                            Hours
                          </button>
                          <button
                            onClick={() => {
                              setLeaveDoctor(doc);
                              setLeaveForm({ startDate: '', endDate: '', reason: '' });
                            }}
                            className="neu-btn-secondary text-[11px] py-1.5 px-2 min-h-[34px]"
                          >
                            Leave
                          </button>
                          <button
                            onClick={() => handleTogglePublish(doc)}
                            className={`text-[11px] py-1.5 px-2 rounded-xl font-bold transition-all min-h-[34px] ${
                              doc.isPublished
                                ? 'bg-[#FEEFEE] text-[#B42318] hover:bg-[#FECDCA]'
                                : 'bg-[#E6F4F1] text-[#16866D] hover:bg-[#9EE2D4]'
                            }`}
                          >
                            {doc.isPublished ? 'Unpublish' : 'Publish'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: OUTBOX QUEUE */}
      {activeTab === 'outbox' && (
        <div className="space-y-6">
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
              <div className="neu-inset p-3.5 border border-[#EEF2F7]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#66727D]">Queued Jobs</span>
                <span className="text-xl font-extrabold text-[#26323B]">{metrics.queuedCount || 0}</span>
              </div>
              <div className="neu-inset p-3.5 border border-[#F7D89C] bg-[#FFF8EB]/50">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#A86B00]">Processing</span>
                <span className="text-xl font-extrabold text-[#A86B00]">{metrics.processingCount || 0}</span>
              </div>
              <div className="neu-inset p-3.5 border border-[#9EE2D4] bg-[#E6F4F1]/50">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#16866D]">Sent Jobs</span>
                <span className="text-xl font-extrabold text-[#16866D]">{metrics.sentCount || 0}</span>
              </div>
              <div className="neu-inset p-3.5 border border-[#D4D9E2]">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#56616B]">Failed</span>
                <span className="text-xl font-extrabold text-[#26323B]">{metrics.failedCount || 0}</span>
              </div>
              <div className="neu-inset p-3.5 border border-[#FECDCA] bg-[#FEEFEE]/50 col-span-2 sm:col-span-1">
                <span className="block text-[10px] font-bold uppercase tracking-wider text-[#B42318]">DLQ Jobs</span>
                <span className="text-xl font-extrabold text-[#B42318]">{metrics.dlqCount || 0}</span>
              </div>
            </div>
          )}

          <section className="neu-panel p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#D4D9E2] pb-3">
              <h2 className="text-base font-bold text-[#26323B]">Recent Notification Queue Logs</h2>
              <div className="flex space-x-2">
                <button onClick={fetchOutboxData} className="neu-btn-secondary text-xs min-h-[44px]">Refresh Logs</button>
                <button onClick={handleTriggerWorker} disabled={processing} className="neu-btn-primary text-xs min-h-[44px]">
                  {processing ? 'Running Worker…' : 'Trigger Worker'}
                </button>
              </div>
            </div>

            {loadingLogs ? (
              <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">Loading outbox logs…</div>
            ) : logs.length === 0 ? (
              <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">No notification logs recorded in outbox queue.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#D4D9E2]">
                <table className="w-full text-left text-xs border-collapse bg-white">
                  <thead>
                    <tr className="bg-[#EEF2F7] border-b border-[#D4D9E2] text-[#26323B] font-extrabold">
                      <th className="py-3 px-4">Recipient</th>
                      <th className="py-3 px-4">Channel</th>
                      <th className="py-3 px-4">Template</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Attempts</th>
                      <th className="py-3 px-4">Idempotency Key</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#D4D9E2]">
                    {logs.map((log) => (
                      <tr key={log.id} className="hover:bg-[#EEF2F7]/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-[#26323B]">{log.recipient}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#56616B]">{log.channel}</td>
                        <td className="py-3 px-4 font-semibold text-[#26323B]">{log.template}</td>
                        <td className="py-3 px-4">
                          <span className={`clinical-badge-${log.status === 'SENT' ? 'success' : log.status === 'PROCESSING' ? 'warning' : log.status === 'DLQ' ? 'danger' : 'neutral'}`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-bold text-[#26323B]">{log.attempts} / {log.maxAttempts || 5}</td>
                        <td className="py-3 px-4 font-mono text-[10px] text-[#66727D]">{log.idempotencyKey}</td>
                        <td className="py-3 px-4 text-right">
                          {log.status === 'DLQ' && (
                            <button onClick={() => handleRetryDlqJob(log.id)} className="neu-btn-secondary text-[11px] py-1.5 px-3 min-h-[36px]">
                              Re-queue DLQ
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Modal: Create Doctor */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center overflow-y-auto">
          <form onSubmit={handleCreateDoctorSubmit} className="neu-panel bg-[#E0E5EC] max-w-lg w-full p-6 space-y-4 border border-[#EEF2F7] my-8">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <h3 className="text-base font-extrabold text-[#26323B]">Create Doctor Profile</h3>
              <button type="button" onClick={() => setShowCreateModal(false)} className="neu-btn-secondary text-sm font-bold min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Doctor Name *</label>
                <input required value={newDoctor.name} onChange={(e) => setNewDoctor({ ...newDoctor, name: e.target.value })} placeholder="Dr. Jane Smith" className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Email Address *</label>
                <input required type="email" value={newDoctor.email} onChange={(e) => setNewDoctor({ ...newDoctor, email: e.target.value })} placeholder="dr.jane@careflow.com" className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Account Password *</label>
                <input required type="password" value={newDoctor.password} onChange={(e) => setNewDoctor({ ...newDoctor, password: e.target.value })} placeholder="••••••••" className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Medical Specialty *</label>
                <input required value={newDoctor.specialty} onChange={(e) => setNewDoctor({ ...newDoctor, specialty: e.target.value })} placeholder="Cardiology" className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Consultation Fee ($) *</label>
                <input required type="number" min="0" value={newDoctor.consultFee} onChange={(e) => setNewDoctor({ ...newDoctor, consultFee: Number(e.target.value) })} className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Slot Duration (Min) *</label>
                <input required type="number" min="10" max="120" value={newDoctor.slotDurationMin} onChange={(e) => setNewDoctor({ ...newDoctor, slotDurationMin: Number(e.target.value) })} className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#D4D9E2]">
              <button type="button" onClick={() => setShowCreateModal(false)} className="neu-btn-secondary text-xs min-h-[44px]">Cancel</button>
              <button disabled={actionBusy} className="neu-btn-primary text-xs min-h-[44px]">
                {actionBusy ? 'Creating Profile…' : 'Create Doctor Profile'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Doctor Details */}
      {editingDoctor && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center overflow-y-auto">
          <form onSubmit={handleEditDoctorSubmit} className="neu-panel bg-[#E0E5EC] max-w-lg w-full p-6 space-y-4 border border-[#EEF2F7] my-8">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <h3 className="text-base font-extrabold text-[#26323B]">Edit Doctor Profile</h3>
              <button type="button" onClick={() => setEditingDoctor(null)} className="neu-btn-secondary text-sm font-bold min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Doctor Name</label>
                <input value={editingDoctor.user?.name || ''} onChange={(e) => setEditingDoctor({ ...editingDoctor, user: { ...editingDoctor.user, name: e.target.value } })} className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Specialty</label>
                <input value={editingDoctor.specialty || ''} onChange={(e) => setEditingDoctor({ ...editingDoctor, specialty: e.target.value })} className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Consult Fee ($)</label>
                <input type="number" min="0" value={editingDoctor.consultFee} onChange={(e) => setEditingDoctor({ ...editingDoctor, consultFee: Number(e.target.value) })} className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Slot Duration (Min)</label>
                <input type="number" min="10" max="120" value={editingDoctor.slotDurationMin} onChange={(e) => setEditingDoctor({ ...editingDoctor, slotDurationMin: Number(e.target.value) })} className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#D4D9E2]">
              <button type="button" onClick={() => setEditingDoctor(null)} className="neu-btn-secondary text-xs min-h-[44px]">Cancel</button>
              <button disabled={actionBusy} className="neu-btn-primary text-xs min-h-[44px]">
                {actionBusy ? 'Saving…' : 'Save Profile Details'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Edit Working Hours */}
      {editingHoursDoctor && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center overflow-y-auto">
          <div className="neu-panel bg-[#E0E5EC] max-w-xl w-full p-6 space-y-4 border border-[#EEF2F7] my-8">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#26323B]">Configure Working Hours</h3>
                <p className="text-xs text-[#5667D8]">For {editingHoursDoctor.user?.name}</p>
              </div>
              <button type="button" onClick={() => setEditingHoursDoctor(null)} className="neu-btn-secondary text-sm font-bold min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>

            <div className="space-y-3 max-h-60 overflow-y-auto pr-1 text-xs">
              {[0, 1, 2, 3, 4, 5, 6].map((dayNum) => {
                const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayNum];
                const active = workingHoursList.find((h) => h.dayOfWeek === dayNum);

                return (
                  <div key={dayNum} className="flex items-center justify-between bg-white p-3 rounded-xl border border-[#D4D9E2]">
                    <span className="font-bold text-[#26323B] w-24">{dayName}</span>
                    {active ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="time"
                          value={active.startTime || '09:00'}
                          onChange={(e) => {
                            setWorkingHoursList(workingHoursList.map((h) => h.dayOfWeek === dayNum ? { ...h, startTime: e.target.value } : h));
                          }}
                          className="neu-input p-1.5 font-bold"
                        />
                        <span>to</span>
                        <input
                          type="time"
                          value={active.endTime || '17:00'}
                          onChange={(e) => {
                            setWorkingHoursList(workingHoursList.map((h) => h.dayOfWeek === dayNum ? { ...h, endTime: e.target.value } : h));
                          }}
                          className="neu-input p-1.5 font-bold"
                        />
                        <button
                          type="button"
                          onClick={() => setWorkingHoursList(workingHoursList.filter((h) => h.dayOfWeek !== dayNum))}
                          className="text-[#B42318] font-bold px-2 hover:underline"
                        >
                          Off
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setWorkingHoursList([...workingHoursList, { dayOfWeek: dayNum, startTime: '09:00', endTime: '17:00' }])}
                        className="neu-btn-secondary text-xs"
                      >
                        + Add Shift
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#D4D9E2]">
              <button type="button" onClick={() => setEditingHoursDoctor(null)} className="neu-btn-secondary text-xs min-h-[44px]">Cancel</button>
              <button onClick={handleSaveHours} disabled={actionBusy} className="neu-btn-primary text-xs min-h-[44px]">
                {actionBusy ? 'Saving Hours…' : 'Save Working Hours'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Admin Submit Leave */}
      {leaveDoctor && (
        <div className="fixed inset-0 z-50 bg-[#26323B]/60 p-4 flex items-center justify-center overflow-y-auto">
          <form onSubmit={handleAdminLeaveSubmit} className="neu-panel bg-[#E0E5EC] max-w-lg w-full p-6 space-y-4 border border-[#EEF2F7] my-8">
            <div className="flex justify-between items-start border-b border-[#D4D9E2] pb-3">
              <div>
                <h3 className="text-base font-extrabold text-[#26323B]">Record Doctor Leave</h3>
                <p className="text-xs text-[#5667D8]">For {leaveDoctor.user?.name}</p>
              </div>
              <button type="button" onClick={() => setLeaveDoctor(null)} className="neu-btn-secondary text-sm font-bold min-h-[44px] min-w-[44px] flex items-center justify-center">×</button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-[#26323B] mb-1">Start Date *</label>
                <input required type="date" value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
              <div>
                <label className="block font-bold text-[#26323B] mb-1">End Date *</label>
                <input required type="date" value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
              </div>
            </div>

            <div className="text-xs">
              <label className="block font-bold text-[#26323B] mb-1">Reason *</label>
              <input required value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Medical leave, leave of absence" className="neu-input w-full p-2.5 font-bold text-[#26323B]" />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-[#D4D9E2]">
              <button type="button" onClick={() => setLeaveDoctor(null)} className="neu-btn-secondary text-xs min-h-[44px]">Cancel</button>
              <button disabled={actionBusy} className="neu-btn-primary text-xs min-h-[44px]">
                {actionBusy ? 'Recording Leave…' : 'Record Leave & Cancel Conflicts'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
