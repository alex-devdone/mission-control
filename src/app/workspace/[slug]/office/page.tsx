'use client';

import { useEffect, useState, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { PixelOffice } from '@/components/PixelOffice';
import { Header } from '@/components/Header';
import { useMissionControl } from '@/lib/store';
import type { Workspace } from '@/lib/types';

function OfficeContent() {
  const params = useParams();
  const slug = params.slug as string;
  const { setAgents, setTasks, setEvents, setIsOnline, setIsLoading, isLoading } = useMissionControl();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const wsRes = await fetch(`/api/workspaces/${slug}`);
        if (wsRes.ok) {
          const ws = await wsRes.json();
          setWorkspace(ws);

          const [aRes, tRes, eRes] = await Promise.all([
            fetch(`/api/agents?workspace_id=${ws.id}`),
            fetch(`/api/tasks?workspace_id=${ws.id}`),
            fetch('/api/events'),
          ]);
          if (aRes.ok) setAgents(await aRes.json());
          if (tRes.ok) setTasks(await tRes.json());
          if (eRes.ok) setEvents(await eRes.json());
        } else if (wsRes.status === 404) {
          setNotFound(true);
        }
      } catch (e) {
        console.error('Failed to load workspace:', e);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [slug]);

  // Poll tasks
  useEffect(() => {
    if (!workspace) return;
    const interval = setInterval(async () => {
      try {
        const r = await fetch(`/api/tasks?workspace_id=${workspace.id}`);
        if (r.ok) setTasks(await r.json());
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, [workspace]);

  // SSE for live updates
  useEffect(() => {
    const es = new EventSource('/api/events/stream');
    es.onopen = () => setIsOnline(true);
    es.onerror = () => setIsOnline(false);
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'task_updated') {
          useMissionControl.getState().updateTask(data.payload);
        } else if (data.type === 'agent_updated') {
          useMissionControl.getState().updateAgent(data.payload);
        }
      } catch {}
    };
    return () => es.close();
  }, []);

  if (notFound) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🔍</div>
          <h1 className="text-2xl font-bold mb-2">Workspace Not Found</h1>
          <p className="text-mc-text-secondary">The workspace &ldquo;{slug}&rdquo; doesn&apos;t exist.</p>
        </div>
      </div>
    );
  }

  if (isLoading || !workspace) {
    return (
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🏢</div>
          <p className="text-mc-text-secondary">Loading Pixel Office...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-mc-bg overflow-hidden">
      <Header workspace={workspace} pageName="pixel-office" />
      <PixelOffice workspaceId={workspace.id} />
    </div>
  );
}

export default function OfficePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-4xl animate-pulse">🏢</div>
      </div>
    }>
      <OfficeContent />
    </Suspense>
  );
}
