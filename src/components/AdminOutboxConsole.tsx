'use client';

import { useState, useEffect } from 'react';

export default function AdminOutboxConsole() {
  const [metrics, setMetrics] = useState<any | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const fetchConsoleData = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/admin/metrics').then((res) => res.json()),
      fetch('/api/notifications/logs').then((res) => res.json()),
    ])
      .then(([metricsData, logsData]) => {
        if (metricsData.success) setMetrics(metricsData.metrics);
        if (logsData.success) setLogs(logsData.logs || []);
      })
      .catch(() => setErrorMsg('Failed to load outbox console metrics'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConsoleData();
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
        fetchConsoleData();
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
        fetchConsoleData();
        setTimeout(() => setMsg(''), 5000);
      } else {
        setErrorMsg(data.error || 'Failed to re-queue DLQ job');
      }
    } catch {
      setErrorMsg('Network error retrying job');
    }
  };

  return (
    <div className="space-y-6">
      {msg && (
        <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
          {msg}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
          {errorMsg}
        </div>
      )}

      {/* Operations Dashboard Header */}
      <div className="desk-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Transactional Outbox Queue Console</h2>
            <p className="text-xs text-slate-500">Monitor notification queue health, DLQ inspections, and worker leases.</p>
          </div>

          <button
            onClick={handleTriggerWorker}
            disabled={processing}
            className="btn-primary text-xs"
          >
            {processing ? 'Processing Queue...' : 'Trigger Outbox Worker'}
          </button>
        </div>

        {/* Compact Queue Metrics Summary Table */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
            <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
              <span className="block text-xs font-medium text-slate-500 uppercase tracking-wider">Queued</span>
              <span className="text-lg font-bold text-slate-800">{metrics.queuedCount || 0}</span>
            </div>

            <div className="p-3 rounded-md bg-amber-50 border border-amber-200">
              <span className="block text-xs font-medium text-amber-700 uppercase tracking-wider">Processing</span>
              <span className="text-lg font-bold text-amber-800">{metrics.processingCount || 0}</span>
            </div>

            <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200">
              <span className="block text-xs font-medium text-emerald-700 uppercase tracking-wider">Sent</span>
              <span className="text-lg font-bold text-emerald-800">{metrics.sentCount || 0}</span>
            </div>

            <div className="p-3 rounded-md bg-slate-100 border border-slate-300">
              <span className="block text-xs font-medium text-slate-600 uppercase tracking-wider">Failed</span>
              <span className="text-lg font-bold text-slate-700">{metrics.failedCount || 0}</span>
            </div>

            <div className="p-3 rounded-md bg-rose-50 border border-rose-200 col-span-2 sm:col-span-1">
              <span className="block text-xs font-medium text-rose-700 uppercase tracking-wider">DLQ Jobs</span>
              <span className="text-lg font-bold text-rose-800">{metrics.dlqCount || 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Outbox Notification Logs Table */}
      <div className="desk-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="text-sm font-semibold text-slate-900">Recent Outbox Notification Jobs</h3>
          <button onClick={fetchConsoleData} className="btn-secondary text-xs">
            Refresh Logs
          </button>
        </div>

        {loading ? (
          <p className="text-xs text-slate-500 py-4">Loading notification queue logs...</p>
        ) : logs.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">No outbox notification logs recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                  <th className="py-2.5 px-3">Recipient</th>
                  <th className="py-2.5 px-3">Channel</th>
                  <th className="py-2.5 px-3">Template</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Attempts</th>
                  <th className="py-2.5 px-3">Idempotency Key</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-2.5 px-3 font-medium text-slate-900">{log.recipient}</td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">{log.channel}</td>
                    <td className="py-2.5 px-3 text-slate-600">{log.template}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`badge-${
                          log.status === 'SENT'
                            ? 'emerald'
                            : log.status === 'PROCESSING'
                            ? 'amber'
                            : log.status === 'DLQ'
                            ? 'rose'
                            : 'slate'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{log.attempts} / {log.maxAttempts || 5}</td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">{log.idempotencyKey}</td>
                    <td className="py-2.5 px-3 text-right">
                      {log.status === 'DLQ' && (
                        <button
                          onClick={() => handleRetryDlqJob(log.id)}
                          className="btn-secondary text-[11px] py-1 px-2.5"
                        >
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
      </div>
    </div>
  );
}
