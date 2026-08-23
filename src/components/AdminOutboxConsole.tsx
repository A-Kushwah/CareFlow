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
            <span className="text-xs font-bold uppercase tracking-wider text-[#5667D8]">Operations & Outbox</span>
            <h1 className="text-2xl font-extrabold text-[#26323B] mt-1">Transactional Outbox Queue Console</h1>
            <p className="text-xs font-medium text-[#56616B] mt-0.5">
              Monitor notification queue health, worker leases, and dead-letter queue (DLQ) retry policies.
            </p>
          </div>

          <button
            onClick={handleTriggerWorker}
            disabled={processing}
            className="neu-btn-primary text-xs font-bold min-h-[44px]"
          >
            {processing ? 'Processing Outbox Queue…' : 'Trigger Outbox Worker'}
          </button>
        </div>

        {/* Compact Queue Metrics Summary Row */}
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
      </header>

      {/* Outbox Notification Logs Dense Table */}
      <section className="neu-panel p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-[#D4D9E2] pb-3">
          <h2 className="text-base font-bold text-[#26323B]">Recent Notification Queue Logs</h2>
          <button onClick={fetchConsoleData} className="neu-btn-secondary text-xs min-h-[44px]">
            Refresh Logs
          </button>
        </div>

        {loading ? (
          <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
            Loading notification queue logs…
          </div>
        ) : logs.length === 0 ? (
          <div className="neu-inset p-8 text-center text-xs font-semibold text-[#66727D]">
            No notification logs recorded in outbox queue.
          </div>
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
                      <span
                        className={`clinical-badge-${
                          log.status === 'SENT'
                            ? 'success'
                            : log.status === 'PROCESSING'
                            ? 'warning'
                            : log.status === 'DLQ'
                            ? 'danger'
                            : 'neutral'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-[#26323B]">{log.attempts} / {log.maxAttempts || 5}</td>
                    <td className="py-3 px-4 font-mono text-[10px] text-[#66727D]">{log.idempotencyKey}</td>
                    <td className="py-3 px-4 text-right">
                      {log.status === 'DLQ' && (
                        <button
                          onClick={() => handleRetryDlqJob(log.id)}
                          className="neu-btn-secondary text-[11px] py-1.5 px-3 min-h-[36px]"
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
      </section>
    </main>
  );
}
