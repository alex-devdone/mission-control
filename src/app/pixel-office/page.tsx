'use client';

import { useEffect, useState, Suspense } from 'react';
import { PixelOffice } from '@/components/PixelOffice';
import { Header } from '@/components/Header';
import { useMissionControl } from '@/lib/store';

function PixelOfficeContent() {
  const { setAgents, setTasks, setEvents, setIsOnline, setIsLoading, isLoading } = useMissionControl();
  const [workspace, setWorkspace] = useState<any>(null);

  useEffect(() => {
    // Load default workspace
    async function load() {
      try {
        const wsRes = await fetch('/api/workspaces');
        if (wsRes.ok) {
          const workspaces = await wsRes.json();
          const ws = workspaces[0]; // default workspace
          if (ws) {
            setWorkspace(ws);

            const [aRes, tRes, eRes] = await Promise.all([
              fetch(`/api/agents?workspace_id=${ws.id}`),
              fetch(`/api/tasks?workspace_id=${ws.id}`),
              fetch('/api/events'),
            ]);
            if (aRes.ok) setAgents(await aRes.json());
            if (tRes.ok) setTasks(await tRes.json());
            if (eRes.ok) setEvents(await eRes.json());
          }
        }
      } catch (e) {
        console.error('Failed to load:', e);
      } finally {
        setIsLoading(false);
      }
    }
    load();

    // Poll tasks
    const interval = setInterval(async () => {
      if (!workspace) return;
      try {
        const r = await fetch(`/api/tasks?workspace_id=${workspace.id}`);
        if (r.ok) setTasks(await r.json());
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

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

export default function PixelOfficePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-mc-bg flex items-center justify-center">
        <div className="text-4xl animate-pulse">🏢</div>
      </div>
    }>
      <PixelOfficeContent />
    </Suspense>
  );
}
