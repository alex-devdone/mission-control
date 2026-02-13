'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, ExternalLink, RefreshCw, Loader2 } from 'lucide-react';
import type { App, Task } from '@/lib/types';

const statusColors: Record<string, string> = {
  ready: 'bg-blue-500',
  building: 'bg-yellow-500 animate-pulse',
  done: 'bg-green-500',
  error: 'bg-red-500',
  paused: 'bg-gray-500',
};

export default function AppDetailPage() {
  const { id } = useParams();
  const [app, setApp] = useState<App | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    try {
      const [appRes, tasksRes] = await Promise.all([
        fetch(`/api/apps/${id}`),
        fetch(`/api/tasks?app_id=${id}`),
      ]);
      if (appRes.ok) setApp(await appRes.json());
      if (tasksRes.ok) setTasks(await tasksRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const refreshProgress = async () => {
    setRefreshing(true);
    try {
      await fetch(`/api/apps/${id}/progress`, { method: 'POST' });
      await loadData();
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-mc-text-secondary" />
      </div>
    );
  }

  if (!app) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">🔍</div>
          <p className="text-mc-text-secondary">App not found</p>
          <Link href="/apps" className="text-mc-accent mt-2 inline-block">← Back to Apps</Link>
        </div>
      </div>
    );
  }

  const pct = app.progress_total > 0 ? Math.round((app.progress_completed / app.progress_total) * 100) : 0;

  const tasksByStatus: Record<string, Task[]> = {};
  for (const t of tasks) {
    (tasksByStatus[t.status] ||= []).push(t);
  }

  return (
    <div className="min-h-screen bg-mc-bg">
      {/* Header */}
      <header className="border-b border-mc-border bg-mc-bg-secondary px-6 py-4">
        <div className="max-w-5xl mx-auto">
          <Link href="/apps" className="inline-flex items-center gap-1 text-sm text-mc-text-secondary hover:text-mc-text mb-3">
            <ChevronLeft className="w-4 h-4" /> All Apps
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-3">
                📦 {app.name}
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white ${statusColors[app.build_status]}`}>
                  {app.build_status}
                </span>
              </h1>
              {app.description && <p className="text-mc-text-secondary mt-1">{app.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={refreshProgress}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-mc-bg-tertiary rounded text-sm hover:bg-mc-border transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                Sync PRD
              </button>
              {app.port && (
                <a
                  href={`http://localhost:${app.port}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-mc-accent text-mc-bg rounded text-sm font-medium hover:bg-mc-accent/90"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open App
                </a>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {/* Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="text-xs text-mc-text-secondary uppercase mb-1">Progress</div>
            <div className="text-2xl font-bold">{pct}%</div>
            <div className="text-xs text-mc-text-secondary">{app.progress_completed}/{app.progress_total} items</div>
            <div className="mt-2 h-2 rounded-full bg-mc-bg-tertiary overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct > 50 ? 'bg-blue-500' : 'bg-yellow-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="text-xs text-mc-text-secondary uppercase mb-1">Path</div>
            <div className="text-sm font-mono truncate">{app.path}</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="text-xs text-mc-text-secondary uppercase mb-1">Port</div>
            <div className="text-2xl font-bold">{app.port || '—'}</div>
          </div>
          <div className="bg-mc-bg-secondary border border-mc-border rounded-lg p-4">
            <div className="text-xs text-mc-text-secondary uppercase mb-1">Tasks</div>
            <div className="text-2xl font-bold">{tasks.length}</div>
            <div className="text-xs text-mc-text-secondary">
              {tasks.filter(t => t.status === 'done').length} done
            </div>
          </div>
        </div>

        {/* Tasks */}
        <h2 className="text-lg font-semibold mb-4">Linked Tasks</h2>
        {tasks.length === 0 ? (
          <div className="text-center py-12 text-mc-text-secondary border border-dashed border-mc-border rounded-lg">
            No tasks linked to this app yet
          </div>
        ) : (
          <div className="space-y-2">
            {tasks.map(task => {
              const statusEmoji: Record<string, string> = {
                inbox: '📥', planning: '🧠', assigned: '👤', in_progress: '🔨',
                testing: '🧪', review: '👀', done: '✅',
              };
              return (
                <div key={task.id} className="bg-mc-bg-secondary border border-mc-border rounded-lg p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span>{statusEmoji[task.status] || '📋'}</span>
                    <div>
                      <div className="font-medium text-sm">{task.title}</div>
                      <div className="text-xs text-mc-text-secondary">
                        {task.status} • {task.priority}
                        {task.assigned_agent_id && ` • assigned`}
                      </div>
                    </div>
                  </div>
                  <span className="text-xs text-mc-text-secondary">
                    {new Date(task.created_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
