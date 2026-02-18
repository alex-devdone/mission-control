'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { useMissionControl } from '@/lib/store';
import type { App } from '@/lib/types';

const statusColors: Record<string, string> = {
  ready: 'bg-blue-500',
  building: 'bg-yellow-500 animate-pulse',
  done: 'bg-green-500',
  error: 'bg-red-500',
  paused: 'bg-gray-500',
};

const statusLabels: Record<string, string> = {
  ready: 'Ready',
  building: 'Building',
  done: 'Done',
  error: 'Error',
  paused: 'Paused',
};

function ProgressBar({ completed, total }: { completed: number; total: number }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const color = pct >= 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : pct > 0 ? 'bg-yellow-500' : 'bg-gray-300';
  
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-gray-200 dark:bg-gray-700">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 tabular-nums">{completed}/{total}</span>
    </div>
  );
}

export default function AppsPage() {
  const [apps, setApps] = useState<App[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', path: '', port: '', description: '' });
  const { setIsOnline } = useMissionControl();

  // Check OpenClaw connection status
  useEffect(() => {
    async function checkOpenClaw() {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch('/api/openclaw/status', { signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const status = await res.json();
          setIsOnline(status.connected);
        }
      } catch {
        setIsOnline(false);
      }
    }
    checkOpenClaw();
    const interval = setInterval(checkOpenClaw, 30000);
    return () => clearInterval(interval);
  }, [setIsOnline]);

  const fetchApps = async () => {
    try {
      const res = await fetch('/api/apps');
      if (res.ok) setApps(await res.json());
    } catch (e) {
      console.error('Failed to fetch apps:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchApps(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/apps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          path: form.path,
          port: form.port ? parseInt(form.port) : undefined,
          description: form.description || undefined,
        }),
      });
      if (res.ok) {
        setForm({ name: '', path: '', port: '', description: '' });
        setShowCreate(false);
        fetchApps();
      }
    } catch (e) {
      console.error('Failed to create app:', e);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">Loading apps...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Header pageName="apps" />
      <div className="mx-auto max-w-6xl p-6">
        {/* Page Title */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Apps</h1>
            <p className="text-sm text-gray-500">Manage project apps and track build progress</p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 transition-colors"
          >
            {showCreate ? 'Cancel' : '+ New App'}
          </button>
        </div>

        {/* Create Form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-6 rounded-xl border bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <input
                required
                placeholder="App name"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <input
                required
                placeholder="Path (e.g. /Users/betty/work/app-factory/my-app)"
                value={form.path}
                onChange={e => setForm(f => ({ ...f, path: e.target.value }))}
                className="rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <input
                placeholder="Port (optional)"
                type="number"
                value={form.port}
                onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                className="rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
              <input
                placeholder="Description (optional)"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                className="rounded-lg border px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
            <button
              type="submit"
              className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700"
            >
              Create App
            </button>
          </form>
        )}

        {/* Apps Grid */}
        {apps.length === 0 ? (
          <div className="rounded-xl border border-dashed p-12 text-center dark:border-gray-700">
            <p className="text-gray-500">No apps yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {apps.map(app => (
              <a
                key={app.id}
                href={`/apps/${app.id}`}
                className="block rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">{app.name}</h3>
                    {app.description && (
                      <p className="mt-1 text-xs text-gray-500">{app.description}</p>
                    )}
                  </div>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-white ${statusColors[app.build_status]}`}>
                    {statusLabels[app.build_status]}
                  </span>
                </div>

                <div className="mb-3 space-y-1 text-xs text-gray-500">
                  <div className="truncate font-mono">{app.path}</div>
                  {app.port && <div>Port: {app.port}</div>}
                  {app.current_agent_name && (
                    <div>Agent: <span className="text-violet-600 dark:text-violet-400">{app.current_agent_name}</span></div>
                  )}
                </div>

                <ProgressBar completed={app.progress_completed} total={app.progress_total} />
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
