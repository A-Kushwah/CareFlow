'use client';

import { useState, useEffect } from 'react';

export default function AdminOutboxConsole() {
  const [metrics, setMetrics] = useState<any>(null);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [dlqLogs, setDlqLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingMsg, setProcessingMsg] = useState('');

  const fetchAdminMetrics = () => {
    setLoading(true);
    fetch('/api/admin/metrics')
      .then((res) => res.json())
      .then((data) => {
        setMetrics(data.metrics || null);
        setRecentLogs(data.recentLogs || []);
        setDlqLogs(data.dlqLogs || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchAdminMetrics();
  }, []);

  const handleRunWorker = async () => {
    setProcessingMsg('Executing background worker run...');
    try {
      const res = await fetch('/api/notifications/process', { method: 'POST' });
      const data = await res.json();
      setProcessingMsg(`Worker run complete: ${JSON.stringify(data.summary)}`);
      fetchAdminMetrics();
    } catch {
      setProcessingMsg('Worker run execution failed.');
    }
  };

  const handleRetryDlq = async (logId?: string) => {
    setProcessingMsg('Re-queuing DLQ items...');
    try {
      const res = await fetch('/api/admin/retry-dlq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      });
      const data = await res.json();
      setProcessingMsg(`DLQ action: ${data.message}`);
      fetchAdminMetrics();
    } catch {
      setProcessingMsg('DLQ retry action failed.');
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Banner & Control Actions */}
      <div className="glass-panel p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4 mb-6">
          <div>
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping"></span>
              Admin Outbox & Notification Job Visibility Console
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              Monitor transaction outbox queue status, exponential backoff retries, and Dead Letter Queue (DLQ) exception items.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={handleRunWorker} className="btn-primary text-xs flex items-center gap-1">
              ⚡ Trigger Worker Run Now
            </button>
            <button onClick={fetchAdminMetrics} className="py-2 px-3 rounded-lg bg-gray-800 text-gray-300 text-xs font-semibold hover:bg-gray-700">
              🔄 Refresh
            </button>
          </div>
        </div>

        {processingMsg && (
          <div className="p-3 mb-6 rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-300 text-xs font-mono">
            {processingMsg}
          </div>
        )}

        {/* Metrics Grid */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <div className="glass-card p-4 rounded-xl text-center">
              <span className="block text-[11px] uppercase tracking-wider text-amber-400 font-semibold">Queued</span>
              <span className="text-2xl font-bold text-white mt-1 block">{metrics.outbox?.queued || 0}</span>
            </div>

            <div className="glass-card p-4 rounded-xl text-center">
              <span className="block text-[11px] uppercase tracking-wider text-sky-400 font-semibold">Processing</span>
              <span className="text-2xl font-bold text-white mt-1 block">{metrics.outbox?.processing || 0}</span>
            </div>

            <div className="glass-card p-4 rounded-xl text-center">
              <span className="block text-[11px] uppercase tracking-wider text-emerald-400 font-semibold">Sent</span>
              <span className="text-2xl font-bold text-white mt-1 block">{metrics.outbox?.sent || 0}</span>
            </div>

            <div className="glass-card p-4 rounded-xl text-center">
              <span className="block text-[11px] uppercase tracking-wider text-rose-400 font-semibold">Failed</span>
              <span className="text-2xl font-bold text-white mt-1 block">{metrics.outbox?.failed || 0}</span>
            </div>

            <div className="glass-card p-4 rounded-xl text-center border-rose-500/30 bg-rose-500/5">
              <span className="block text-[11px] uppercase tracking-wider text-rose-300 font-bold">DLQ (Dead Letter)</span>
              <span className="text-2xl font-bold text-rose-400 mt-1 block">{metrics.outbox?.dlq || 0}</span>
            </div>
          </div>
        )}
      </div>

      {/* Dead Letter Queue Section */}
      <div className="glass-panel p-6">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
          <h4 className="text-base font-bold text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            Dead Letter Queue (DLQ) Exceptions
          </h4>
          {dlqLogs.length > 0 && (
            <button onClick={() => handleRetryDlq()} className="text-xs text-amber-400 hover:text-amber-300 font-semibold underline">
              Re-queue All DLQ Items
            </button>
          )}
        </div>

        {dlqLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">No items currently in Dead Letter Queue.</div>
        ) : (
          <div className="space-y-3">
            {dlqLogs.map((log) => (
              <div key={log.id} className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-semibold text-rose-300">Recipient: {log.recipient} ({log.template})</div>
                  <div className="text-gray-400 mt-0.5">
                    Attempts: {log.attempts}/{log.maxAttempts} • Last Error: {log.lastError || 'Max retries exceeded'}
                  </div>
                </div>

                <button
                  onClick={() => handleRetryDlq(log.id)}
                  className="py-1.5 px-3 rounded bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 font-semibold text-[11px]"
                >
                  Re-queue Item
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outbox Activity Stream */}
      <div className="glass-panel p-6">
        <h4 className="text-base font-bold text-white border-b border-white/10 pb-4 mb-4">
          Recent Outbox Notification Stream
        </h4>

        {recentLogs.length === 0 ? (
          <div className="py-6 text-center text-xs text-gray-400">No outbox logs recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-300">
              <thead className="text-[11px] uppercase tracking-wider text-gray-400 border-b border-white/10">
                <tr>
                  <th className="pb-3">Channel</th>
                  <th className="pb-3">Recipient</th>
                  <th className="pb-3">Template</th>
                  <th className="pb-3">Attempts</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/5">
                    <td className="py-3 font-semibold text-sky-400">{log.channel}</td>
                    <td className="py-3 text-gray-200">{log.recipient}</td>
                    <td className="py-3 font-mono text-gray-400">{log.template}</td>
                    <td className="py-3">{log.attempts}/{log.maxAttempts}</td>
                    <td className="py-3">
                      <span className={`badge-status badge-${log.status.toLowerCase()}`}>{log.status}</span>
                    </td>
                    <td className="py-3 text-gray-400">
                      {new Date(log.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
